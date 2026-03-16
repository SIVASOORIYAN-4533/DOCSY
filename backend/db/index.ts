import Database from "better-sqlite3";
import { env } from "../config/env";

let sqliteInstance: Database | null = null;

const ensureSqliteDb = (): Database => {
  if (sqliteInstance) {
    return sqliteInstance;
  }

  if (env.dbProvider !== "sqlite" && !env.dbFallbackToSqlite) {
    throw new Error("SQLite is disabled. Configure MongoDB Atlas or enable SQLite fallback.");
  }

  sqliteInstance = new Database(env.sqliteDbPath);
  sqliteInstance.pragma("foreign_keys = ON");
  return sqliteInstance;
};

const db = new Proxy({} as Database, {
  get(_target, prop) {
    const instance = ensureSqliteDb();
    const value = (instance as any)[prop];
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
}) as Database;

export default db;
