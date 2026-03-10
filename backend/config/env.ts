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

const inferredDbProvider =
  process.env.DB_PROVIDER ?? (process.env.MONGODB_URI ? "mongodb" : "sqlite");
const nodeEnv = process.env.NODE_ENV ?? "development";
const port = parsePort(process.env.PORT, 5001);
const oauthBaseUrl = process.env.OAUTH_BASE_URL ?? `http://localhost:${port}`;
const frontendBaseUrl =
  process.env.FRONTEND_BASE_URL ??
  (nodeEnv === "production" ? oauthBaseUrl : "http://localhost:5173");

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
  mongodbUri: process.env.MONGODB_URI ?? "",
  mongodbDbName: process.env.MONGODB_DB_NAME ?? "",
  oauthBaseUrl,
  frontendBaseUrl,
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  githubClientId: process.env.GITHUB_CLIENT_ID ?? "",
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
};
