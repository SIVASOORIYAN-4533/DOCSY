import express from "express";
import fs from "fs";
import type { AddressInfo } from "net";
import net from "net";
import path from "path";
import { env } from "./config/env";
import { getDatabaseHealth, initializeDatabase } from "./db/repository";
import { authenticateToken } from "./middleware/auth";
import authRoutes from "./routes/auth";
import documentsRoutes from "./routes/documents";
import notificationsRoutes from "./routes/notifications";
import searchRoutes from "./routes/search";

const canUsePort = (port: number): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const tester = net.createServer();

    tester.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        resolve(false);
        return;
      }

      reject(error);
    });

    tester.once("listening", () => {
      tester.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }

        resolve(true);
      });
    });

    tester.listen(port, "0.0.0.0");
  });
};

const findAvailablePort = async (preferredPort: number, searchLimit: number): Promise<number> => {
  for (let offset = 0; offset <= searchLimit; offset += 1) {
    const candidatePort = preferredPort + offset;
    const available = await canUsePort(candidatePort);
    if (available) {
      return candidatePort;
    }
  }

  throw new Error(
    `Unable to find an available port between ${preferredPort} and ${preferredPort + searchLimit}.`,
  );
};

export const startServer = async (): Promise<void> => {
  await initializeDatabase();

  const app = express();
  const projectRoot = process.cwd();
  const distPath = path.join(projectRoot, "dist");
  const indexHtmlPath = path.join(distPath, "index.html");
  const allowedOrigins = new Set(env.corsOrigins);
  const allowAllOrigins = allowedOrigins.has("*");

  app.use((req, res, next) => {
    const requestOrigin = typeof req.headers.origin === "string" ? req.headers.origin : "";
    const isAllowedOrigin = allowAllOrigins || (!!requestOrigin && allowedOrigins.has(requestOrigin));

    if (allowAllOrigins) {
      res.header("Access-Control-Allow-Origin", "*");
    } else if (isAllowedOrigin && requestOrigin) {
      res.header("Access-Control-Allow-Origin", requestOrigin);
      res.header("Vary", "Origin");
    }

    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Authorization,Content-Type");
    res.header("Access-Control-Expose-Headers", "Content-Disposition,Content-Type");

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    next();
  });

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.get("/api/health/db", (_req, res) => {
    res.json(getDatabaseHealth());
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/documents", documentsRoutes);
  app.use("/api/notifications", notificationsRoutes);
  app.use("/api/search", searchRoutes);

  app.use("/uploads", authenticateToken, express.static(path.resolve(projectRoot, env.uploadDir)));

  if (env.nodeEnv === "production" && fs.existsSync(indexHtmlPath)) {
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(indexHtmlPath);
    });
  } else if (env.nodeEnv === "production") {
    console.warn(
      "No frontend build found at dist/index.html. Starting in API-only mode for production deployment.",
    );
    app.get("/", (_req, res) => {
      res.json({ status: "ok", service: "smartdoc-backend" });
    });
  } else {
    app.get("/", (_req, res) => {
      res.json({ status: "ok", service: "smartdoc-backend" });
    });
  }

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled request error:", error);
    if (res.headersSent) {
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  });

  const resolvedPort =
    env.nodeEnv === "production"
      ? env.port
      : await findAvailablePort(env.port, env.portSearchLimit);
  if (env.nodeEnv !== "production" && resolvedPort !== env.port) {
    console.warn(`Port ${env.port} is already in use. Using port ${resolvedPort} instead.`);
  }

  const server = app.listen(resolvedPort, "0.0.0.0", () => {
    const address = server.address() as AddressInfo | null;
    const port = address?.port ?? resolvedPort;
    console.log(`Server running on http://localhost:${port}`);
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    console.error("Server failed to start:", error);
    process.exit(1);
  });
};
