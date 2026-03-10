import dotenv from "dotenv";
import mongoose from "mongoose";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..", "..");
const envCandidates = [
  path.resolve(process.cwd(), ".env.local"),
  path.resolve(projectRoot, ".env.local"),
];
const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));
if (envPath) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set in .env.local");
  process.exit(1);
}

const dbName = process.env.MONGODB_DB_NAME || undefined;
const options = dbName
  ? { dbName, serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000, socketTimeoutMS: 12000 }
  : { serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000, socketTimeoutMS: 12000 };

const sqlitePath = path.resolve(process.cwd(), "smartdoc.db");
const sqlite = new Database(sqlitePath);

const parseDate = (value) => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeUser = (row) => ({
  id: Number(row.id),
  name: row.name ?? "",
  email: row.email ?? "",
  password: row.password ?? "",
  role: row.role ?? "user",
  favourite_teacher: row.favourite_teacher ?? null,
  secured_password: row.secured_password ?? null,
  profile_photo: row.profile_photo ?? null,
});

const normalizeDocument = (row) => ({
  id: Number(row.id),
  title: row.title ?? "",
  file_path: row.file_path ?? "",
  category: row.category ?? "",
  description: row.description ?? "",
  tags: row.tags ?? "",
  upload_date: parseDate(row.upload_date) ?? new Date(),
  department: row.department ?? "",
  user_id: Number(row.user_id),
  mime_type: row.mime_type ?? "",
  size: Number(row.size ?? 0),
  content: row.content ?? "",
  is_secured: Number(row.is_secured ?? 0),
});

const normalizeSharing = (row) => ({
  id: Number(row.id),
  doc_id: Number(row.doc_id),
  user_id: Number(row.user_id),
  created_at: parseDate(row.created_at) ?? new Date(),
  status: row.status ?? "accepted",
  permission: row.permission ?? "view",
});

const bulkUpsert = async (collection, docs, idField) => {
  if (!docs.length) {
    return;
  }
  const ops = docs.map((doc) => ({
    updateOne: {
      filter: { [idField]: doc[idField] },
      update: { $set: doc },
      upsert: true,
    },
  }));
  await collection.bulkWrite(ops, { ordered: false });
};

const getMaxId = (rows) => rows.reduce((max, row) => Math.max(max, Number(row.id || 0)), 0);

const run = async () => {
  await mongoose.connect(uri, options);
  const mongo = mongoose.connection.db;

  const users = sqlite.prepare("SELECT * FROM users").all().map(normalizeUser);
  const documents = sqlite.prepare("SELECT * FROM documents").all().map(normalizeDocument);
  const sharing = sqlite.prepare("SELECT * FROM sharing").all().map(normalizeSharing);

  await bulkUpsert(mongo.collection("users"), users, "id");
  await bulkUpsert(mongo.collection("documents"), documents, "id");
  await bulkUpsert(mongo.collection("sharing"), sharing, "id");

  const counters = [
    { key: "users", value: getMaxId(users) },
    { key: "documents", value: getMaxId(documents) },
    { key: "sharing", value: getMaxId(sharing) },
  ];
  await bulkUpsert(mongo.collection("counters"), counters, "key");

  const after = {
    users: await mongo.collection("users").countDocuments(),
    documents: await mongo.collection("documents").countDocuments(),
    sharing: await mongo.collection("sharing").countDocuments(),
    counters: await mongo.collection("counters").countDocuments(),
  };
  console.log(JSON.stringify({ migrated: { users: users.length, documents: documents.length, sharing: sharing.length }, after }));
  await mongoose.disconnect();
};

run().catch((error) => {
  console.error("SQLite → MongoDB migration failed:", error?.message || error);
  process.exit(1);
});
