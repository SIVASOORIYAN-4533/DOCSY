import mongoose, { Schema } from "mongoose";
import { env } from "../config/env";
import db from "./index";
import { runMigrations } from "./migrations";
import { connectMongo, isMongoReady } from "./mongodb";

interface UserRecord {
  id: number;
  name: string;
  email: string;
  password: string;
  role: string;
  phone?: string | null;
  favourite_teacher?: string | null;
  secured_password?: string | null;
  profile_photo?: string | null;
}

interface DocumentRecord {
  id: number;
  title: string;
  file_path: string;
  category: string;
  description: string;
  tags: string;
  upload_date: string;
  department: string;
  user_id: number;
  uploaded_by?: string;
  mime_type: string;
  size: number;
  content?: string;
  is_secured: number;
  shared_by_email?: string;
  shared_at?: string;
  permission?: string;
  shared_status?: "pending" | "accepted" | "declined";
  shared_to_email?: string;
}

let isMongoProvider = env.dbProvider === "mongodb";
let sqliteUsersColumnsChecked = false;

const counterSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Number, required: true, default: 0 },
  },
  { versionKey: false },
);

const userSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    role: { type: String, default: "user" },
    phone: { type: String, default: null },
    favourite_teacher: { type: String, default: null },
    secured_password: { type: String, default: null },
    profile_photo: { type: String, default: null },
  },
  { versionKey: false },
);

const documentSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    title: { type: String, required: true },
    file_path: { type: String, required: true },
    category: { type: String, default: "" },
    description: { type: String, default: "" },
    tags: { type: String, default: "" },
    upload_date: { type: Date, default: Date.now },
    department: { type: String, default: "" },
    user_id: { type: Number, required: true, index: true },
    mime_type: { type: String, default: "" },
    size: { type: Number, default: 0 },
    content: { type: String, default: "" },
    is_secured: { type: Number, default: 0, index: true },
  },
  { versionKey: false },
);

const sharingSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    doc_id: { type: Number, required: true, index: true },
    user_id: { type: Number, required: true, index: true },
    created_at: { type: Date, default: Date.now },
    status: { type: String, default: "accepted" },
    permission: { type: String, default: "view" },
  },
  { versionKey: false },
);

const CounterModel: any =
  (mongoose.models.Counter as any) || mongoose.model("Counter", counterSchema, "counters");
const UserModel: any = (mongoose.models.User as any) || mongoose.model("User", userSchema, "users");
const DocumentModel: any =
  (mongoose.models.Document as any) || mongoose.model("Document", documentSchema, "documents");
const SharingModel: any =
  (mongoose.models.Sharing as any) || mongoose.model("Sharing", sharingSchema, "sharing");

const escapeRegex = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const ensureUsersColumns = (): void => {
  if (isMongoProvider || sqliteUsersColumnsChecked) {
    return;
  }

  try {
    const columns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    const hasFavouriteTeacher = columns.some((column) => column.name === "favourite_teacher");
    const hasPhone = columns.some((column) => column.name === "phone");

    if (!hasFavouriteTeacher) {
      db.prepare("ALTER TABLE users ADD COLUMN favourite_teacher TEXT").run();
    }

    if (!hasPhone) {
      db.prepare("ALTER TABLE users ADD COLUMN phone TEXT").run();
    }
  } catch (error) {
    const message = String((error as { message?: string } | undefined)?.message || "");
    if (!message.includes("duplicate column name")) {
      throw error;
    }
  } finally {
    sqliteUsersColumnsChecked = true;
  }
};

const normalizeDocument = (doc: any): DocumentRecord => {
  const uploadDate = doc.upload_date instanceof Date ? doc.upload_date.toISOString() : String(doc.upload_date);

  return {
    id: Number(doc.id),
    title: doc.title ?? "",
    file_path: doc.file_path ?? "",
    category: doc.category ?? "",
    description: doc.description ?? "",
    tags: doc.tags ?? "",
    upload_date: uploadDate,
    department: doc.department ?? "",
    user_id: Number(doc.user_id),
    mime_type: doc.mime_type ?? "",
    size: Number(doc.size ?? 0),
    content: doc.content ?? "",
    is_secured: Number(doc.is_secured ?? 0),
  };
};

const getNextSequence = async (key: string): Promise<number> => {
  const counter = await CounterModel.findOneAndUpdate(
    { key },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  return Number(counter?.value ?? 1);
};

const ensureMongoIndexes = async (): Promise<void> => {
  await Promise.all([
    CounterModel.createIndexes(),
    UserModel.createIndexes(),
    DocumentModel.createIndexes(),
    SharingModel.createIndexes(),
  ]);
};

const mapDocumentsWithUploader = async (docs: any[]): Promise<DocumentRecord[]> => {
  const uploaderIds = [...new Set(docs.map((doc) => Number(doc.user_id)))];
  const users = await UserModel.find({ id: { $in: uploaderIds } }, { id: 1, name: 1, _id: 0 }).lean();
  const nameByUserId = new Map<number, string>(
    users.map((user: any) => [Number(user.id), String(user.name)]),
  );

  return docs.map((doc) => ({
    ...normalizeDocument(doc),
    uploaded_by: nameByUserId.get(Number(doc.user_id)) ?? "Unknown",
  }));
};

export const initializeDatabase = async (): Promise<void> => {
  if (isMongoProvider) {
    try {
      await connectMongo();
      await UserModel.updateMany(
        { favourite_teacher: { $exists: false } },
        { $set: { favourite_teacher: null } },
      );
      await UserModel.updateMany(
        { phone: { $exists: false } },
        { $set: { phone: null } },
      );
      await UserModel.updateMany(
        { role: { $ne: "user" } },
        { $set: { role: "user" } },
      );
      await ensureMongoIndexes();
      return;
    } catch (error) {
      if (!env.dbFallbackToSqlite) {
        throw error;
      }

      console.warn("MongoDB connection failed. Falling back to SQLite.");
      console.warn(error);
      isMongoProvider = false;
    }
  }

  runMigrations();
  db.prepare("UPDATE users SET role = 'user' WHERE role IS NULL OR LOWER(role) != 'user'").run();
};

export const getDatabaseHealth = (): { provider: "sqlite" | "mongodb"; connected: boolean } => {
  if (isMongoProvider) {
    return { provider: "mongodb", connected: isMongoReady() };
  }

  return { provider: "sqlite", connected: true };
};

export const createUser = async (
  name: string,
  email: string,
  password: string,
  role: string,
  favouriteTeacher: string,
  phone?: string,
): Promise<number> => {
  if (isMongoProvider) {
    const id = await getNextSequence("users");
    const normalizedPhone = String(phone || "").trim();
    await UserModel.create({
      id,
      name,
      email,
      password,
      role,
      phone: normalizedPhone || null,
      favourite_teacher: favouriteTeacher,
      profile_photo: null,
    });
    return id;
  }

  ensureUsersColumns();
  const normalizedPhone = String(phone || "").trim();
  const stmt = db.prepare(
    "INSERT INTO users (name, email, password, role, favourite_teacher, phone) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const result = stmt.run(name, email, password, role || "user", favouriteTeacher, normalizedPhone || null);
  return Number(result.lastInsertRowid);
};

export const findUserByEmail = async (email: string): Promise<UserRecord | null> => {
  const normalizedEmail = String(email || "").trim();
  if (!normalizedEmail) {
    return null;
  }

  if (isMongoProvider) {
    const user = await UserModel.findOne({
      email: { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: "i" },
    }).lean();
    if (!user) {
      return null;
    }
    return {
      id: Number(user.id),
      name: user.name,
      email: user.email,
      password: user.password,
      role: user.role,
      phone: user.phone ?? null,
      favourite_teacher: user.favourite_teacher ?? null,
      secured_password: user.secured_password,
      profile_photo: user.profile_photo ?? user.profilePhoto ?? null,
    };
  }

  const user = db
    .prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)")
    .get(normalizedEmail) as UserRecord | undefined;
  return user ?? null;
};

export const findUserById = async (userId: number): Promise<UserRecord | null> => {
  if (isMongoProvider) {
    const user = await UserModel.findOne({ id: userId }).lean();
    if (!user) {
      return null;
    }

    return {
      id: Number(user.id),
      name: user.name,
      email: user.email,
      password: user.password,
      role: user.role,
      phone: user.phone ?? null,
      favourite_teacher: user.favourite_teacher ?? null,
      secured_password: user.secured_password,
      profile_photo: user.profile_photo ?? user.profilePhoto ?? null,
    };
  }

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRecord | undefined;
  return user ?? null;
};

export const updateUserProfile = async (
  userId: number,
  name: string,
  email: string,
  profilePhoto: string | null,
  favouriteTeacher?: string,
): Promise<void> => {
  if (isMongoProvider) {
    const updatePayload: Record<string, unknown> = {
      name,
      email,
      profile_photo: profilePhoto,
      profilePhoto,
    };

    if (favouriteTeacher) {
      updatePayload.favourite_teacher = favouriteTeacher;
    }

    await UserModel.updateOne({ id: userId }, { $set: updatePayload });
    return;
  }

  if (favouriteTeacher) {
    ensureUsersColumns();
    db.prepare("UPDATE users SET name = ?, email = ?, profile_photo = ?, favourite_teacher = ? WHERE id = ?")
      .run(name, email, profilePhoto, favouriteTeacher, userId);
    return;
  }

  db.prepare("UPDATE users SET name = ?, email = ?, profile_photo = ? WHERE id = ?")
    .run(name, email, profilePhoto, userId);
};

export const setUserSecuredPassword = async (userId: number, securedPassword: string): Promise<void> => {
  if (isMongoProvider) {
    await UserModel.updateOne({ id: userId }, { $set: { secured_password: securedPassword } });
    return;
  }

  db.prepare("UPDATE users SET secured_password = ? WHERE id = ?").run(securedPassword, userId);
};

export const updateUserPassword = async (userId: number, password: string): Promise<void> => {
  if (isMongoProvider) {
    await UserModel.updateOne({ id: userId }, { $set: { password } });
    return;
  }

  db.prepare("UPDATE users SET password = ? WHERE id = ?").run(password, userId);
};

export const getUserSecuredPassword = async (userId: number): Promise<string | null> => {
  if (isMongoProvider) {
    const user = await UserModel.findOne({ id: userId }, { secured_password: 1, _id: 0 }).lean();
    return user?.secured_password ?? null;
  }

  const user = db
    .prepare("SELECT secured_password FROM users WHERE id = ?")
    .get(userId) as { secured_password?: string } | undefined;
  return user?.secured_password ?? null;
};

export const findUserIdByEmail = async (email: string): Promise<number | null> => {
  if (isMongoProvider) {
    const user = await UserModel.findOne({ email }, { id: 1, _id: 0 }).lean();
    return user ? Number(user.id) : null;
  }

  const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number } | undefined;
  return user ? Number(user.id) : null;
};

export const createDocument = async (input: {
  title: string;
  file_path: string;
  category: string;
  description: string;
  tags: string;
  department: string;
  user_id: number;
  mime_type: string;
  size: number;
  is_secured: number;
}): Promise<number> => {
  if (isMongoProvider) {
    const id = await getNextSequence("documents");
    await DocumentModel.create({ ...input, id, upload_date: new Date() });
    return id;
  }

  const stmt = db.prepare(`
    INSERT INTO documents (title, file_path, category, description, tags, department, user_id, mime_type, size, is_secured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    input.title,
    input.file_path,
    input.category,
    input.description,
    input.tags,
    input.department,
    input.user_id,
    input.mime_type,
    input.size,
    input.is_secured,
  );

  return Number(result.lastInsertRowid);
};

export const getVisibleDocuments = async (
  userId: number,
  includeSecured: boolean,
): Promise<DocumentRecord[]> => {
  const securedFlag = includeSecured ? 1 : 0;

  if (isMongoProvider) {
    const sharedDocIds = await SharingModel.find({ user_id: userId, status: "accepted" }).distinct("doc_id");
    const docs = await DocumentModel.find({
      is_secured: securedFlag,
      $or: [{ user_id: userId }, { id: { $in: sharedDocIds } }],
    })
      .sort({ upload_date: -1 })
      .lean();

    return mapDocumentsWithUploader(docs);
  }

  const docs = db
    .prepare(
      `
      SELECT d.*, u.name as uploaded_by
      FROM documents d
      JOIN users u ON d.user_id = u.id
      WHERE (d.user_id = ? OR d.id IN (SELECT doc_id FROM sharing WHERE user_id = ?))
      AND d.id NOT IN (SELECT doc_id FROM sharing WHERE user_id = ? AND status != 'accepted')
      AND d.is_secured = ?
      ORDER BY upload_date DESC
    `,
    )
    .all(userId, userId, userId, securedFlag) as DocumentRecord[];

  return docs.map((doc) => ({
    ...doc,
    is_secured: Number(doc.is_secured ?? 0),
  }));
};

export const getDocumentById = async (docId: number): Promise<DocumentRecord | null> => {
  if (isMongoProvider) {
    const doc = await DocumentModel.findOne({ id: docId }).lean();
    return doc ? normalizeDocument(doc) : null;
  }

  const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(docId) as DocumentRecord | undefined;
  return doc ?? null;
};

export const deleteDocument = async (docId: number): Promise<void> => {
  if (isMongoProvider) {
    await DocumentModel.deleteOne({ id: docId });
    return;
  }

  db.prepare("DELETE FROM documents WHERE id = ?").run(docId);
};

export const deleteSharingByDocId = async (docId: number): Promise<void> => {
  if (isMongoProvider) {
    await SharingModel.deleteMany({ doc_id: docId });
    return;
  }

  db.prepare("DELETE FROM sharing WHERE doc_id = ?").run(docId);
};

export const upsertSharing = async (
  docId: number,
  userId: number,
  permission: string,
): Promise<void> => {
  if (isMongoProvider) {
    const existing = await SharingModel.findOne({ doc_id: docId, user_id: userId });
    if (existing) {
      existing.permission = permission;
      existing.status = "accepted";
      await existing.save();
      return;
    }

    const id = await getNextSequence("sharing");
    await SharingModel.create({
      id,
      doc_id: docId,
      user_id: userId,
      permission,
      created_at: new Date(),
      status: "accepted",
    });
    return;
  }

  db.prepare("DELETE FROM sharing WHERE doc_id = ? AND user_id = ?").run(docId, userId);
  db.prepare(
    "INSERT INTO sharing (doc_id, user_id, permission, created_at, status) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'accepted')",
  ).run(docId, userId, permission);
};

export const createSharingRequest = async (
  docId: number,
  userId: number,
  permission: string,
): Promise<void> => {
  if (isMongoProvider) {
    const existing = await SharingModel.findOne({ doc_id: docId, user_id: userId });
    if (existing) {
      existing.permission = permission;
      existing.status = "pending";
      existing.created_at = new Date();
      await existing.save();
      return;
    }

    const id = await getNextSequence("sharing");
    await SharingModel.create({
      id,
      doc_id: docId,
      user_id: userId,
      permission,
      status: "pending",
      created_at: new Date(),
    });
    return;
  }

  db.prepare("DELETE FROM sharing WHERE doc_id = ? AND user_id = ?").run(docId, userId);
  db.prepare(
    "INSERT INTO sharing (doc_id, user_id, permission, created_at, status) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'pending')",
  ).run(docId, userId, permission);
};

export const getSharedDocumentsForUser = async (userId: number): Promise<DocumentRecord[]> => {
  if (isMongoProvider) {
    const sharingRows = await SharingModel.find({ user_id: userId }).lean();
    if (sharingRows.length === 0) {
      return [];
    }

    const docIds = sharingRows.map((row: any) => Number(row.doc_id));
    const docs = await DocumentModel.find({ id: { $in: docIds } }).lean();
    const owners = await UserModel.find(
      { id: { $in: [...new Set(docs.map((doc: any) => Number(doc.user_id)))] } },
      { id: 1, email: 1, _id: 0 },
    ).lean();

    const ownerEmailById = new Map<number, string>(
      owners.map((owner: any) => [Number(owner.id), String(owner.email)]),
    );
    const sharingByDocId = new Map<number, any>(
      sharingRows.map((row: any) => [Number(row.doc_id), row]),
    );

    return docs
      .map((doc: any) => {
        const normalized = normalizeDocument(doc);
        const sharing = sharingByDocId.get(normalized.id);
        const sharedAtRaw = sharing?.created_at;
        const sharedAt = sharedAtRaw instanceof Date ? sharedAtRaw.toISOString() : String(sharedAtRaw ?? "");
        return {
          ...normalized,
          uploaded_by: ownerEmailById.get(normalized.user_id) ?? "Unknown",
          shared_by_email: ownerEmailById.get(normalized.user_id) ?? "Unknown",
          shared_at: sharedAt,
          permission: sharing?.permission ?? "view",
          shared_status: sharing?.status ?? "accepted",
        };
      })
      .sort((a, b) => new Date(b.shared_at || 0).getTime() - new Date(a.shared_at || 0).getTime());
  }

  const docs = db
    .prepare(
      `
      SELECT d.*, owner.email as shared_by_email, s.created_at as shared_at, s.permission
      , s.status as shared_status
      FROM sharing s
      JOIN documents d ON d.id = s.doc_id
      JOIN users owner ON owner.id = d.user_id
      WHERE s.user_id = ? AND d.is_secured = 0
      ORDER BY s.created_at DESC
    `,
    )
    .all(userId) as DocumentRecord[];

  return docs.map((doc) => ({
    ...doc,
    is_secured: Number(doc.is_secured ?? 0),
    uploaded_by: doc.shared_by_email ?? "Unknown",
    shared_by_email: doc.shared_by_email ?? "Unknown",
    shared_at: doc.shared_at ?? doc.upload_date,
    shared_status: (doc.shared_status as "pending" | "accepted" | "declined") ?? "accepted",
  }));
};

export const getFilesSharedByOwner = async (ownerUserId: number): Promise<DocumentRecord[]> => {
  if (isMongoProvider) {
    const docs = await DocumentModel.find({ user_id: ownerUserId }).lean();
    if (docs.length === 0) {
      return [];
    }

    const docIds = docs.map((doc: any) => Number(doc.id));
    const sharingRows = await SharingModel.find({ doc_id: { $in: docIds } }).lean();
    if (sharingRows.length === 0) {
      return [];
    }

    const recipientIds = [...new Set(sharingRows.map((row: any) => Number(row.user_id)))];
    const recipients = await UserModel.find(
      { id: { $in: recipientIds } },
      { id: 1, email: 1, _id: 0 },
    ).lean();
    const recipientEmailById = new Map<number, string>(
      recipients.map((recipient: any) => [Number(recipient.id), String(recipient.email)]),
    );
    const docById = new Map<number, any>(docs.map((doc: any) => [Number(doc.id), doc]));

    return sharingRows
      .map((row: any) => {
        const doc = docById.get(Number(row.doc_id));
        if (!doc) {
          return null;
        }
        const normalized = normalizeDocument(doc);
        const sharedAtRaw = row.created_at;
        const sharedAt = sharedAtRaw instanceof Date ? sharedAtRaw.toISOString() : String(sharedAtRaw ?? "");
        return {
          ...normalized,
          shared_to_email: recipientEmailById.get(Number(row.user_id)) ?? "Unknown",
          shared_status: row.status ?? "accepted",
          shared_at: sharedAt,
          permission: row.permission ?? "view",
        } as DocumentRecord;
      })
      .filter((row): row is DocumentRecord => !!row)
      .sort((a, b) => new Date(b.shared_at || 0).getTime() - new Date(a.shared_at || 0).getTime());
  }

  const rows = db
    .prepare(
      `
      SELECT d.*, recipient.email as shared_to_email, s.status as shared_status, s.created_at as shared_at, s.permission
      FROM sharing s
      JOIN documents d ON d.id = s.doc_id
      JOIN users recipient ON recipient.id = s.user_id
      WHERE d.user_id = ?
      ORDER BY s.created_at DESC
    `,
    )
    .all(ownerUserId) as DocumentRecord[];

  return rows.map((row) => ({
    ...row,
    is_secured: Number(row.is_secured ?? 0),
    shared_status: (row.shared_status as "pending" | "accepted" | "declined") ?? "accepted",
  }));
};

export const updateSharingStatus = async (
  docId: number,
  userId: number,
  status: "pending" | "accepted" | "declined",
): Promise<boolean> => {
  if (isMongoProvider) {
    const result = await SharingModel.updateOne({ doc_id: docId, user_id: userId }, { $set: { status } });
    return Number(result.modifiedCount ?? 0) > 0;
  }

  const result = db.prepare("UPDATE sharing SET status = ? WHERE doc_id = ? AND user_id = ?")
    .run(status, docId, userId);
  return Number(result.changes ?? 0) > 0;
};

export const removeSharingForUser = async (docId: number, userId: number): Promise<boolean> => {
  if (isMongoProvider) {
    const result = await SharingModel.deleteOne({ doc_id: docId, user_id: userId });
    return Number(result.deletedCount ?? 0) > 0;
  }

  const result = db.prepare("DELETE FROM sharing WHERE doc_id = ? AND user_id = ?").run(docId, userId);
  return Number(result.changes ?? 0) > 0;
};

export const isDocumentSharedWithUser = async (docId: number, userId: number): Promise<boolean> => {
  if (isMongoProvider) {
    const shared = await SharingModel.findOne(
      { doc_id: docId, user_id: userId, status: "accepted" },
      { _id: 1 },
    ).lean();
    return !!shared;
  }

  const shared = db
    .prepare("SELECT 1 FROM sharing WHERE doc_id = ? AND user_id = ? AND status = 'accepted'")
    .get(docId, userId);
  return !!shared;
};

export const searchDocuments = async (
  userId: number,
  rawQuery: string,
): Promise<DocumentRecord[]> => {
  const query = rawQuery.trim();

  if (isMongoProvider) {
    const sharedDocIds = await SharingModel.find({ user_id: userId, status: "accepted" }).distinct("doc_id");
    const visibilityFilter = {
      $or: [{ user_id: userId }, { id: { $in: sharedDocIds } }],
    };

    const searchFilter =
      query.length > 0
        ? {
            $or: [
              { title: { $regex: escapeRegex(query), $options: "i" } },
              { tags: { $regex: escapeRegex(query), $options: "i" } },
              { content: { $regex: escapeRegex(query), $options: "i" } },
              { category: { $regex: escapeRegex(query), $options: "i" } },
            ],
          }
        : {};

    const docs = await DocumentModel.find({
      is_secured: 0,
      ...visibilityFilter,
      ...searchFilter,
    })
      .sort({ upload_date: -1 })
      .lean();

    return mapDocumentsWithUploader(docs);
  }

  const sqlQuery = `%${query}%`;
  const docs = db
    .prepare(
      `
      SELECT d.*, u.name as uploaded_by
      FROM documents d
      JOIN users u ON d.user_id = u.id
      WHERE (d.user_id = ? OR d.id IN (SELECT doc_id FROM sharing WHERE user_id = ?))
      AND d.id NOT IN (SELECT doc_id FROM sharing WHERE user_id = ? AND status != 'accepted')
      AND d.is_secured = 0
      AND (d.title LIKE ? OR d.tags LIKE ? OR d.content LIKE ? OR d.category LIKE ?)
      ORDER BY upload_date DESC
    `,
    )
    .all(userId, userId, userId, sqlQuery, sqlQuery, sqlQuery, sqlQuery) as DocumentRecord[];

  return docs;
};

export const updateDocumentAIFields = async (
  docId: number,
  content: string,
  tags: string,
  description: string,
): Promise<void> => {
  if (isMongoProvider) {
    await DocumentModel.updateOne({ id: docId }, { $set: { content, tags, description } });
    return;
  }

  db.prepare(`
    UPDATE documents
    SET content = ?, tags = ?, description = ?
    WHERE id = ?
  `).run(content, tags, description, docId);
};
