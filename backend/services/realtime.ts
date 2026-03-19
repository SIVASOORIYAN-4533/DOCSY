import type { Response } from "express";

type ServerEventPayload = Record<string, unknown>;

const userConnections = new Map<number, Set<Response>>();
const KEEP_ALIVE_INTERVAL_MS = 25_000;

const writeSseEvent = (response: Response, event: string, payload: ServerEventPayload): void => {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const detachConnection = (userId: number, response: Response): void => {
  const connections = userConnections.get(userId);
  if (!connections) {
    return;
  }

  connections.delete(response);
  if (connections.size === 0) {
    userConnections.delete(userId);
  }
};

export const subscribeUserToRealtime = (userId: number, response: Response): void => {
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders?.();

  const existing = userConnections.get(userId) ?? new Set<Response>();
  existing.add(response);
  userConnections.set(userId, existing);

  writeSseEvent(response, "connected", { connected: true, ts: new Date().toISOString() });

  const keepAlive = setInterval(() => {
    if (response.writableEnded) {
      clearInterval(keepAlive);
      detachConnection(userId, response);
      return;
    }

    response.write(": ping\n\n");
  }, KEEP_ALIVE_INTERVAL_MS);

  const cleanup = (): void => {
    clearInterval(keepAlive);
    detachConnection(userId, response);
  };

  response.on("close", cleanup);
  response.on("error", cleanup);
};

export const pushRealtimeEventToUser = (
  userId: number,
  event: string,
  payload: ServerEventPayload,
): void => {
  const connections = userConnections.get(userId);
  if (!connections || connections.size === 0) {
    return;
  }

  for (const response of connections) {
    if (response.writableEnded) {
      detachConnection(userId, response);
      continue;
    }

    try {
      writeSseEvent(response, event, payload);
    } catch {
      detachConnection(userId, response);
    }
  }
};
