import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const parsePort = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const parseDbProvider = (value: string | undefined): "sqlite" | "mongodb" => {
  return value === "mongodb" ? "mongodb" : "sqlite";
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
};

const normalizeOrigin = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
};

const parseOrigins = (value: string | undefined, fallback: string): string[] => {
  const resolved = (value ?? fallback)
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter((origin) => origin.length > 0);
  return [...new Set(resolved)];
};

const normalizeConfiguredUrl = (value: string | undefined, fallback: string): string => {
  const normalized = normalizeOrigin(value ?? "");
  if (normalized) {
    return normalized;
  }

  return normalizeOrigin(fallback);
};

const inferredDbProvider =
  process.env.DB_PROVIDER ?? (process.env.MONGODB_URI || process.env.MONGO_URI ? "mongodb" : "sqlite");
const nodeEnv = process.env.NODE_ENV ?? "development";
const port = parsePort(process.env.PORT, 5001);
const oauthBaseUrl = normalizeConfiguredUrl(process.env.OAUTH_BASE_URL, `http://localhost:${port}`);
const primaryCorsOrigin = (process.env.CORS_ORIGIN ?? "").split(",")[0] ?? "";
const frontendFallbackUrl =
  nodeEnv === "production" ? normalizeOrigin(primaryCorsOrigin) || oauthBaseUrl : "http://localhost:5173";
const frontendBaseUrl = normalizeConfiguredUrl(process.env.FRONTEND_BASE_URL, frontendFallbackUrl);
const mongodbUri = process.env.MONGODB_URI ?? process.env.MONGO_URI ?? "";
const corsOrigins = parseOrigins(process.env.CORS_ORIGIN, frontendBaseUrl);

export const env = {
  nodeEnv,
  port,
  portSearchLimit: parsePositiveInt(process.env.PORT_SEARCH_LIMIT, 20),
  jwtSecret: process.env.JWT_SECRET ?? "smartdoc-secret-key",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  dbProvider: parseDbProvider(inferredDbProvider),
  dbFallbackToSqlite: parseBoolean(
    process.env.DB_FALLBACK_TO_SQLITE,
    nodeEnv !== "production",
  ),
  mongodbUri,
  mongodbDbName: process.env.MONGODB_DB_NAME ?? "",
  oauthBaseUrl,
  frontendBaseUrl,
  corsOrigins,
  uploadDir: process.env.UPLOAD_DIR ?? "uploads",
  sqliteDbPath: process.env.SQLITE_DB_PATH ?? "smartdoc.db",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  githubClientId: process.env.GITHUB_CLIENT_ID ?? "",
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
};
