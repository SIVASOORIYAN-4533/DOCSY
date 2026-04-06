import fs from "fs";
import path from "path";
import { Router } from "express";
import {
  createNotification,
  createSharingRequest,
  createDocument,
  deleteDocument,
  deleteSharingByDocId,
  findUserByEmail,
  getFilesSharedByOwner,
  getDocumentById,
  getSharedDocumentsForUser,
  getVisibleDocuments,
  isDocumentSharedWithUser,
  removeSharingForUser,
  updateDocumentAIFields,
  updateSharingStatus,
} from "../db/repository";
import { env } from "../config/env";
import { authenticateToken } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { processDocumentWithAI } from "../services/aiProcessing";
import { pushRealtimeEventToUser } from "../services/realtime";

const router = Router();
const normalizedUploadDir = String(env.uploadDir || "uploads")
  .replace(/\\/g, "/")
  .replace(/^\/+|\/+$/g, "");
const uploadsRoot = path.resolve(process.cwd(), env.uploadDir);

const toStoredUploadPath = (absoluteFilePath: string): string => {
  const fileName = path.basename(String(absoluteFilePath || ""));
  return normalizedUploadDir ? `${normalizedUploadDir}/${fileName}` : fileName;
};

const resolveExistingDocumentPath = (storedPath: string): string | null => {
  const raw = String(storedPath || "").trim();
  if (!raw) {
    return null;
  }

  const candidates: string[] = [];
  if (path.isAbsolute(raw)) {
    candidates.push(raw);
  } else {
    candidates.push(path.resolve(process.cwd(), raw));
  }

  const normalizedRaw = raw.replace(/\\/g, "/");
  const uploadSegmentMatch = normalizedRaw.match(/(?:^|\/)(uploads\/.+)$/i);
  if (uploadSegmentMatch?.[1]) {
    candidates.push(path.resolve(process.cwd(), uploadSegmentMatch[1]));
  }

  if (normalizedUploadDir && normalizedRaw.startsWith(`${normalizedUploadDir}/`)) {
    const fromConfiguredDir = normalizedRaw.slice(normalizedUploadDir.length + 1);
    if (fromConfiguredDir) {
      candidates.push(path.join(uploadsRoot, fromConfiguredDir));
    }
  }

  const baseName = path.basename(raw);
  if (baseName) {
    candidates.push(path.join(uploadsRoot, baseName));
  }

  const uniqueCandidates = [...new Set(candidates.map((entry) => path.normalize(entry)))];
  for (const candidate of uniqueCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

router.post("/upload", authenticateToken, upload.single("file"), async (req, res) => {
  const { title, category, description, tags, department, is_secured } = req.body || {};
  const file = req.file;

  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  if (!file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const docId = await createDocument({
    title: title || file.originalname,
    file_path: toStoredUploadPath(file.path),
    category: category || "",
    description: description || "",
    tags: tags || "",
    department: department || "",
    user_id: req.user.id,
    mime_type: file.mimetype,
    size: file.size,
    is_secured: is_secured === "true" || is_secured === true ? 1 : 0,
  });
  void processDocumentWithAI(docId, file.path, file.mimetype);

  res.status(201).json({ id: docId });
});

router.get("/", authenticateToken, async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  const docs = await getVisibleDocuments(req.user.id, false);
  res.json(docs);
});

router.get("/secured", authenticateToken, async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  const docs = await getVisibleDocuments(req.user.id, true);
  res.json(docs);
});

router.get("/shared-with-me", authenticateToken, async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  const docs = await getSharedDocumentsForUser(req.user.id);
  res.json(docs);
});

router.get("/shared-by-me", authenticateToken, async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  const docs = await getFilesSharedByOwner(req.user.id);
  res.json(docs);
});

router.post("/share-upload", authenticateToken, upload.single("file"), async (req, res) => {
  const { email, title, category, description, tags, department } = req.body || {};
  const file = req.file;

  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  if (!email) {
    res.status(400).json({ error: "Recipient email is required" });
    return;
  }

  if (!file) {
    res.status(400).json({ error: "Please upload a file" });
    return;
  }

  const recipient = await findUserByEmail(String(email));
  if (!recipient) {
    res.status(404).json({ error: "User does not exist" });
    return;
  }

  const docId = await createDocument({
    title: String(title || file.originalname),
    file_path: toStoredUploadPath(file.path),
    category: String(category || "Shared"),
    description: String(description || ""),
    tags: String(tags || ""),
    department: String(department || ""),
    user_id: req.user.id,
    mime_type: file.mimetype,
    size: file.size,
    is_secured: 0,
  });

  await createSharingRequest(docId, recipient.id, "view");
  void processDocumentWithAI(docId, file.path, file.mimetype);

  try {
    const notification = await createNotification({
      userId: recipient.id,
      actorId: req.user.id,
      docId,
      type: "share_request",
      message: `${req.user.name} (${req.user.email}) shared "${String(title || file.originalname)}" with you.`,
      link: "/shared",
    });
    pushRealtimeEventToUser(recipient.id, "notification.created", { notification });
  } catch (error) {
    console.error("Failed to notify share-upload recipient:", error);
  }

  res.status(201).json({ success: true, id: docId });
});

router.delete("/:id", authenticateToken, async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  const docId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(docId)) {
    res.status(400).json({ error: "Invalid document id" });
    return;
  }

  const doc = await getDocumentById(docId);

  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  if (doc.user_id !== req.user.id) {
    res.status(403).json({ error: "Only the document owner can delete this file" });
    return;
  }

  try {
    // Remove sharing rows first to satisfy foreign-key constraints in SQLite.
    await deleteSharingByDocId(docId);
    await deleteDocument(docId);

    const resolvedPath = resolveExistingDocumentPath(doc.file_path);
    if (resolvedPath && fs.existsSync(resolvedPath)) {
      fs.unlinkSync(resolvedPath);
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete document:", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

router.post("/:id/share", authenticateToken, async (req, res) => {
  const { email, permission } = req.body || {};

  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  const docId = Number.parseInt(req.params.id, 10);
  const doc = await getDocumentById(docId);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  if (doc.user_id !== req.user.id) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  const normalizedEmail = String(email || "").trim();
  if (!normalizedEmail) {
    res.status(400).json({ error: "Recipient email is required" });
    return;
  }

  const targetUser = await findUserByEmail(normalizedEmail);
  if (!targetUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await createSharingRequest(docId, targetUser.id, permission || "view");

  try {
    const notification = await createNotification({
      userId: targetUser.id,
      actorId: req.user.id,
      docId,
      type: "share_request",
      message: `${req.user.name} (${req.user.email}) shared "${doc.title}" with you.`,
      link: "/shared",
    });
    pushRealtimeEventToUser(targetUser.id, "notification.created", { notification });
  } catch (error) {
    console.error("Failed to notify share recipient:", error);
  }

  res.json({ success: true, pending: true });
});

router.post("/:id/copy-to-my-documents", authenticateToken, async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  const docId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(docId)) {
    res.status(400).json({ error: "Invalid document id" });
    return;
  }

  const sourceDoc = await getDocumentById(docId);
  if (!sourceDoc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  if (sourceDoc.user_id === req.user.id) {
    res.json({ success: true, id: sourceDoc.id, alreadyOwned: true });
    return;
  }

  const isShared = await isDocumentSharedWithUser(docId, req.user.id);
  if (!isShared) {
    res.status(403).json({ error: "You do not have access to this shared file." });
    return;
  }

  const sourceFilePath = resolveExistingDocumentPath(sourceDoc.file_path);
  if (!sourceFilePath) {
    res.status(404).json({ error: "Source file not found on server." });
    return;
  }

  const safeTitle = String(sourceDoc.title || "document").replace(/[^\w.-]/g, "_");
  const copiedFileName = `${Date.now()}-${req.user.id}-${safeTitle}`;
  const copiedFilePath = path.join(uploadsRoot, copiedFileName);

  try {
    fs.copyFileSync(sourceFilePath, copiedFilePath);

    const copiedDocId = await createDocument({
      title: sourceDoc.title || safeTitle,
      file_path: toStoredUploadPath(copiedFilePath),
      category: sourceDoc.category || "",
      description: sourceDoc.description || "",
      tags: sourceDoc.tags || "",
      department: sourceDoc.department || "",
      user_id: req.user.id,
      mime_type: sourceDoc.mime_type || "application/octet-stream",
      size: sourceDoc.size || 0,
      is_secured: Number(sourceDoc.is_secured ?? 0),
    });

    await updateDocumentAIFields(
      copiedDocId,
      sourceDoc.content || "",
      sourceDoc.tags || "",
      sourceDoc.description || "",
    );

    // After a user copies a shared file to their own documents, remove the
    // original shared-access row so analytics/listing treat it as owned data.
    await removeSharingForUser(docId, req.user.id);

    res.status(201).json({ success: true, id: copiedDocId, title: sourceDoc.title || safeTitle });
  } catch (error) {
    try {
      if (fs.existsSync(copiedFilePath)) {
        fs.unlinkSync(copiedFilePath);
      }
    } catch {
      // Ignore cleanup failures.
    }

    console.error("Failed to copy shared document:", error);
    res.status(500).json({ error: "Failed to download shared file to your documents." });
  }
});

router.delete("/:id/shared-access", authenticateToken, async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  const docId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(docId)) {
    res.status(400).json({ error: "Invalid document id" });
    return;
  }

  const doc = await getDocumentById(docId);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const isOwner = doc.user_id === req.user.id;
  const isShared = await isDocumentSharedWithUser(docId, req.user.id);
  if (!isOwner && !isShared) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  try {
    // Owner removes the file globally, recipient removes only their own access.
    if (isOwner) {
      await deleteSharingByDocId(docId);
      await deleteDocument(docId);
      const resolvedPath = resolveExistingDocumentPath(doc.file_path);
      if (resolvedPath && fs.existsSync(resolvedPath)) {
        fs.unlinkSync(resolvedPath);
      }
      res.json({ success: true, deleted: "document" });
      return;
    }

    const removed = await removeSharingForUser(docId, req.user.id);
    if (!removed) {
      res.status(404).json({ error: "Shared access not found" });
      return;
    }

    res.json({ success: true, deleted: "access" });
  } catch (error) {
    console.error("Failed to remove shared access:", error);
    res.status(500).json({ error: "Failed to remove shared access" });
  }
});

router.post("/:id/shared-request/accept", authenticateToken, async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  const docId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(docId)) {
    res.status(400).json({ error: "Invalid document id" });
    return;
  }

  const doc = await getDocumentById(docId);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const updated = await updateSharingStatus(docId, req.user.id, "accepted");
  if (!updated) {
    res.status(404).json({ error: "Share request not found" });
    return;
  }

  if (doc.user_id !== req.user.id) {
    try {
      const notification = await createNotification({
        userId: doc.user_id,
        actorId: req.user.id,
        docId,
        type: "share_response",
        message: `${req.user.name} (${req.user.email}) accepted "${doc.title}".`,
        link: "/shared",
      });
      pushRealtimeEventToUser(doc.user_id, "notification.created", { notification });
    } catch (error) {
      console.error("Failed to notify document owner about acceptance:", error);
    }
  }

  res.json({ success: true });
});

router.post("/:id/shared-request/decline", authenticateToken, async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  const docId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(docId)) {
    res.status(400).json({ error: "Invalid document id" });
    return;
  }

  const doc = await getDocumentById(docId);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const updated = await updateSharingStatus(docId, req.user.id, "declined");
  if (!updated) {
    res.status(404).json({ error: "Share request not found" });
    return;
  }

  if (doc.user_id !== req.user.id) {
    try {
      const notification = await createNotification({
        userId: doc.user_id,
        actorId: req.user.id,
        docId,
        type: "share_response",
        message: `${req.user.name} (${req.user.email}) declined "${doc.title}".`,
        link: "/shared",
      });
      pushRealtimeEventToUser(doc.user_id, "notification.created", { notification });
    } catch (error) {
      console.error("Failed to notify document owner about decline:", error);
    }
  }

  res.json({ success: true });
});

router.get("/:id/download", authenticateToken, async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  const docId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(docId)) {
    res.status(400).json({ error: "Invalid document id" });
    return;
  }

  const doc = await getDocumentById(docId);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const isOwner = doc.user_id === req.user.id;
  const isShared = await isDocumentSharedWithUser(doc.id, req.user.id);

  if (!isOwner && !isShared) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  const resolvedPath = resolveExistingDocumentPath(doc.file_path);
  if (!resolvedPath) {
    res.status(404).json({ error: "File not found on server" });
    return;
  }

  res.download(resolvedPath, doc.title);
});

router.get("/:id/view", authenticateToken, async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  const docId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(docId)) {
    res.status(400).json({ error: "Invalid document id" });
    return;
  }

  const doc = await getDocumentById(docId);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const isOwner = doc.user_id === req.user.id;
  const isShared = await isDocumentSharedWithUser(doc.id, req.user.id);

  if (!isOwner && !isShared) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  const resolvedPath = resolveExistingDocumentPath(doc.file_path);
  if (!resolvedPath) {
    res.status(404).json({ error: "File not found on server" });
    return;
  }

  res.setHeader("Content-Type", doc.mime_type || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${doc.title}"`);
  res.sendFile(resolvedPath);
});

export default router;
