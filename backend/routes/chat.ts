import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { authenticateToken } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { env } from "../config/env";
import {
  findUserById,
  getUserChatbotName,
  setUserChatbotName,
} from "../db/repository";

type ChatRole = "user" | "assistant";
type ChatHistoryItem = { role?: string; content?: string };
type FileMode = "question" | "summarize";

type ChatUploadRecord = {
  id: string;
  ownerId: number;
  filePath: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: number;
};

const router = Router();
const ai = env.geminiApiKey ? new GoogleGenAI({ apiKey: env.geminiApiKey }) : null;
const configuredModel = process.env.GEMINI_CHAT_MODEL || "gemini-3-flash-preview";
const fallbackModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const FILE_TTL_MS = 60 * 60 * 1000;
const MAX_HISTORY_MESSAGES = 10;
const DEFAULT_CHATBOT_NAME = "Agastiya";
const MAX_CHATBOT_NAME_LENGTH = 40;
const chatUploads = new Map<string, ChatUploadRecord>();
const uploadsRoot = path.resolve(process.cwd(), env.uploadDir);

const supportedMimeTypes = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const cleanupExpiredUploads = (): void => {
  const now = Date.now();

  for (const [uploadId, record] of chatUploads.entries()) {
    if (now - record.createdAt < FILE_TTL_MS) {
      continue;
    }

    chatUploads.delete(uploadId);
    try {
      if (fs.existsSync(record.filePath)) {
        fs.unlinkSync(record.filePath);
      }
    } catch {
      // Cleanup failures are non-fatal.
    }
  }
};

setInterval(cleanupExpiredUploads, 15 * 60 * 1000).unref();

const normalizeMessage = (value: unknown): string => String(value || "").trim();

const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const stripCodeFences = (value: string): string => {
  return value.replace(/```(?:[\w-]+)?\s*\n?([\s\S]*?)```/g, "$1").trim();
};

const sanitizeFileReply = (rawReply: string, chatbotName: string, fileMode: FileMode): string => {
  let reply = stripCodeFences(rawReply).replace(/\r\n/g, "\n");

  if (fileMode !== "summarize") {
    return reply.trim();
  }

  const escapedName = escapeRegExp(chatbotName);
  reply = reply
    .replace(new RegExp(`^\\s*${escapedName}\\s*$`, "gim"), "")
    .replace(new RegExp(`^\\s*(?:hello[!,.\\s]*)?(?:i am|i'm)\\s+${escapedName}[^\\n]*\\n?`, "i"), "")
    .replace(/^\s*here is (?:the )?summary[^.\n]*\.?\s*\n?/i, "")
    .replace(/^\s*please summarize this file\.?\s*\n?/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return reply;
};

const normalizeHistory = (history: unknown): Array<{ role: ChatRole; content: string }> => {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .slice(-MAX_HISTORY_MESSAGES)
    .map((item) => item as ChatHistoryItem)
    .map((item) => {
      const role: ChatRole = item.role === "assistant" ? "assistant" : "user";
      return {
        role,
        content: normalizeMessage(item.content),
      };
    })
    .filter((item) => item.content.length > 0);
};

const toGeminiContents = (history: Array<{ role: ChatRole; content: string }>) => {
  return history.map((item) => ({
    role: item.role === "assistant" ? "model" : "user",
    parts: [{ text: item.content }],
  }));
};

const deleteUploadFile = (record: ChatUploadRecord): void => {
  try {
    if (fs.existsSync(record.filePath)) {
      fs.unlinkSync(record.filePath);
    }
  } catch {
    // Cleanup failures are non-fatal.
  }
};

const normalizeChatbotName = (value: unknown): string => {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
};

const resolveChatbotNameForUser = async (userId: number): Promise<string> => {
  const storedName = await getUserChatbotName(userId);
  const normalized = normalizeChatbotName(storedName);
  return normalized || DEFAULT_CHATBOT_NAME;
};

const resolveModelCandidates = (): string[] => {
  const candidates = [configuredModel, ...fallbackModels]
    .map((item) => String(item || "").trim())
    .filter((item) => item.length > 0);

  return [...new Set(candidates)];
};

const generateContentWithFallback = async (contents: any[]) => {
  if (!ai) {
    throw new Error("AI client is not configured.");
  }

  const modelCandidates = resolveModelCandidates();
  let lastError: unknown = null;

  for (const modelName of modelCandidates) {
    try {
      return await ai.models.generateContent({
        model: modelName,
        contents,
      });
    } catch (error) {
      lastError = error;
      const message = String((error as { message?: string } | undefined)?.message || "");
      const normalized = message.toLowerCase();
      const isLikelyModelError =
        normalized.includes("model") ||
        normalized.includes("not found") ||
        normalized.includes("unsupported") ||
        normalized.includes("invalid");
      if (!isLikelyModelError) {
        break;
      }
    }
  }

  throw lastError || new Error("Failed to generate content.");
};

router.post("/upload", authenticateToken, upload.single("file"), (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file uploaded." });
    return;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    try {
      fs.unlinkSync(file.path);
    } catch {
      // Ignore deletion failures.
    }
    res.status(400).json({ error: "File is too large. Max allowed is 10MB." });
    return;
  }

  if (!supportedMimeTypes.has(file.mimetype)) {
    try {
      fs.unlinkSync(file.path);
    } catch {
      // Ignore deletion failures.
    }
    res.status(400).json({
      error:
        "Unsupported file type. Please upload PDF, TXT/Markdown, PNG, JPG, or WEBP.",
    });
    return;
  }

  const uploadId = randomUUID();
  const record: ChatUploadRecord = {
    id: uploadId,
    ownerId: req.user.id,
    filePath: file.path,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    createdAt: Date.now(),
  };
  chatUploads.set(uploadId, record);

  res.json({
    file: {
      id: uploadId,
      name: record.originalName,
      mimeType: record.mimeType,
      size: record.size,
    },
  });
});

router.get("/name", authenticateToken, async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  const name = await resolveChatbotNameForUser(req.user.id);
  res.json({ name });
});

router.put("/name", authenticateToken, async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  const name = normalizeChatbotName(req.body?.name);
  if (!name) {
    res.status(400).json({ error: "Chatbot name is required." });
    return;
  }

  if (name.length > MAX_CHATBOT_NAME_LENGTH) {
    res.status(400).json({ error: `Chatbot name must be ${MAX_CHATBOT_NAME_LENGTH} characters or less.` });
    return;
  }

  try {
    await setUserChatbotName(req.user.id, name);
    res.json({ name });
  } catch {
    res.status(500).json({ error: "Failed to rename chatbot." });
  }
});

router.post("/message", authenticateToken, async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  if (!ai) {
    res.status(500).json({
      error: "AI is not configured. Set GEMINI_API_KEY in environment variables.",
    });
    return;
  }

  const message = normalizeMessage(req.body?.message);
  const history = normalizeHistory(req.body?.history);
  const fileId = normalizeMessage(req.body?.fileId);
  const modeRaw = normalizeMessage(req.body?.fileMode).toLowerCase();
  const fileMode: FileMode = modeRaw === "summarize" ? "summarize" : "question";

  if (!message && !fileId) {
    res.status(400).json({ error: "Message is required." });
    return;
  }

  try {
    const chatbotName = await resolveChatbotNameForUser(req.user.id);
    const contents: any[] = toGeminiContents(history);

    if (fileId) {
      const record = chatUploads.get(fileId);
      if (!record || record.ownerId !== req.user.id) {
        res.status(404).json({ error: "Uploaded file session expired. Please upload again." });
        return;
      }

      const resolvedPath = path.resolve(record.filePath);
      if (!resolvedPath.startsWith(uploadsRoot) || !fs.existsSync(resolvedPath)) {
        chatUploads.delete(fileId);
        res.status(404).json({ error: "File no longer exists. Please upload again." });
        return;
      }

      const fileBase64 = fs.readFileSync(resolvedPath).toString("base64");
      const userRequest =
        message || (fileMode === "summarize" ? "Summarize this file." : "Explain this file.");

      const instruction =
        fileMode === "summarize"
          ? `You are ${chatbotName}. The user uploaded a file named "${record.originalName}".
Create a clean summary in plain text using this exact structure:
Summary:
<2-4 sentences>

Key Points:
- <bullet points>

Important Names, Dates, and Numbers:
- <important facts>

Rules:
- Do not use markdown symbols (#, *, **, or backticks).
- Do not introduce yourself.
- Do not repeat the user prompt.
- Keep the writing concise and practical.`
          : `You are ${chatbotName}. The user uploaded a file named "${record.originalName}" and asked a question.
Respond in plain text with:
Extracted Text:
Answer:

Rules:
- Do not introduce yourself.
- Do not repeat the user prompt.
- If information is missing, say so clearly.`;

      contents.push({
        role: "user",
        parts: [
          { text: `${instruction}\n\nUser request: ${userRequest}` },
          { inlineData: { data: fileBase64, mimeType: record.mimeType } },
        ],
      });
    } else {
      contents.push({
        role: "user",
        parts: [
          {
            text: `You are ${chatbotName}, a helpful conversational assistant. Keep responses clear and structured when useful.\n\nUser: ${message}`,
          },
        ],
      });
    }

    const response = await generateContentWithFallback(contents);

    const rawReply = normalizeMessage(response.text);
    const reply = fileId
      ? sanitizeFileReply(rawReply, chatbotName, fileMode)
      : rawReply;
    if (!reply) {
      res.status(502).json({ error: "AI returned an empty response. Please try again." });
      return;
    }

    res.json({ reply });
  } catch (error) {
    console.error("Chat message failed:", error);
    res.status(500).json({ error: "Failed to process chat message." });
  }
});

router.post("/file/clear", authenticateToken, (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  const fileId = normalizeMessage(req.body?.fileId);
  if (!fileId) {
    res.json({ success: true });
    return;
  }

  const record = chatUploads.get(fileId);
  if (!record || record.ownerId !== req.user.id) {
    res.json({ success: true });
    return;
  }

  chatUploads.delete(fileId);
  deleteUploadFile(record);
  res.json({ success: true });
});

export default router;
