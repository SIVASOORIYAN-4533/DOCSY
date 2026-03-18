import db from "./index";

const INITIAL_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    phone TEXT,
    favourite_teacher TEXT,
    secured_password TEXT,
    profile_photo TEXT
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL,
    category TEXT,
    description TEXT,
    tags TEXT,
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    department TEXT,
    user_id INTEGER,
    mime_type TEXT,
    size INTEGER,
    content TEXT,
    is_secured INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sharing (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id INTEGER,
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'accepted',
    permission TEXT,
    FOREIGN KEY (doc_id) REFERENCES documents(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
  CREATE INDEX IF NOT EXISTS idx_documents_upload_date ON documents(upload_date);
  CREATE INDEX IF NOT EXISTS idx_documents_is_secured ON documents(is_secured);
  CREATE INDEX IF NOT EXISTS idx_sharing_doc_id ON sharing(doc_id);
  CREATE INDEX IF NOT EXISTS idx_sharing_user_id ON sharing(user_id);
`;

const hasColumn = (table: string, column: string): boolean => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return columns.some((entry) => entry.name === column);
};

const stripDefaultClause = (type: string): string => {
  const normalized = type.toUpperCase();
  const defaultIndex = normalized.indexOf(" DEFAULT ");
  if (defaultIndex === -1) {
    return type.trim();
  }

  return type.slice(0, defaultIndex).trim();
};

const addColumn = (table: string, column: string, type: string): void => {
  try {
    if (hasColumn(table, column)) {
      return;
    }

    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
    console.log(`Added column ${column} to ${table}`);
  } catch (error: any) {
    const message = String(error?.message || error || "");
    const normalizedMessage = message.toLowerCase();
    if (normalizedMessage.includes("duplicate column name")) {
      return;
    }

    if (normalizedMessage.includes("non-constant default")) {
      const fallbackType = stripDefaultClause(type);
      if (fallbackType && fallbackType !== type) {
        try {
          db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${fallbackType}`).run();
          console.log(`Added column ${column} to ${table} with fallback type ${fallbackType}`);
          return;
        } catch (retryError: any) {
          const retryMessage = String(retryError?.message || retryError || "");
          console.error(`Migration failed for ${table}.${column} after fallback:`, retryMessage);
          return;
        }
      }
    }

    console.error(`Migration failed for ${table}.${column}:`, message);
  }
};

export const runMigrations = (): void => {
  db.exec(INITIAL_SCHEMA);
  addColumn("users", "secured_password", "TEXT");
  addColumn("users", "profile_photo", "TEXT");
  addColumn("users", "favourite_teacher", "TEXT");
  addColumn("users", "phone", "TEXT");
  addColumn("documents", "is_secured", "INTEGER DEFAULT 0");
  addColumn("documents", "content", "TEXT");
  addColumn("sharing", "created_at", "DATETIME");
  addColumn("sharing", "status", "TEXT DEFAULT 'accepted'");

  // Backfill created_at for older databases where the column was added later.
  if (hasColumn("sharing", "created_at")) {
    db.prepare("UPDATE sharing SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL").run();
  }

  if (hasColumn("sharing", "status")) {
    db.prepare("UPDATE sharing SET status = 'accepted' WHERE status IS NULL").run();
  }
};
