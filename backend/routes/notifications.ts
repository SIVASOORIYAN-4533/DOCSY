import { Router, type Request } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import {
  getNotificationsForUser,
  getUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../db/repository";
import { authenticateToken } from "../middleware/auth";
import { subscribeUserToRealtime } from "../services/realtime";
import type { JwtUser } from "../types/auth";

const router = Router();

const decodeUserFromToken = (token: string): JwtUser | null => {
  try {
    return jwt.verify(token, env.jwtSecret) as JwtUser;
  } catch {
    return null;
  }
};

const getUserFromStreamRequest = (req: Request): JwtUser | null => {
  if (req.user) {
    return req.user as JwtUser;
  }

  const authHeader = String(req.headers.authorization || "");
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const queryToken = String(req.query.token || "");
  const token = headerToken || queryToken;

  if (!token) {
    return null;
  }

  return decodeUserFromToken(token);
};

router.get("/", authenticateToken, async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  const limitRaw = Number.parseInt(String(req.query.limit ?? "25"), 10);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 25;
  const [items, unreadCount] = await Promise.all([
    getNotificationsForUser(req.user.id, limit),
    getUnreadNotificationCount(req.user.id),
  ]);

  res.json({ items, unreadCount });
});

router.post("/read-all", authenticateToken, async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  const updated = await markAllNotificationsAsRead(req.user.id);
  res.json({ success: true, updated });
});

router.post("/:id/read", authenticateToken, async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  const notificationId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(notificationId)) {
    res.status(400).json({ error: "Invalid notification id" });
    return;
  }

  const updated = await markNotificationAsRead(notificationId, req.user.id);
  res.json({ success: true, updated });
});

router.get("/stream", async (req, res) => {
  const user = getUserFromStreamRequest(req);
  if (!user) {
    res.sendStatus(401);
    return;
  }

  subscribeUserToRealtime(user.id, res);
});

export default router;
