import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Bot,
  FileText,
  Loader2,
  MessageSquare,
  Paperclip,
  SendHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { User } from "../../types";
import { getAuthToken } from "../../utils/authStorage";

interface SmartSearchProps {
  user: User;
}

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type UploadedChatFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
};

type FileMode = "question" | "summarize";
type ChatbotNameResponse = { name?: string; error?: string };
type MessageResponse = { reply?: string; error?: string };

const DEFAULT_CHATBOT_NAME = "Agastiya";
const WELCOME_MESSAGE_ID = "chatbot-welcome";
const WELCOME_TAGLINE = "Ask questions or upload a file for summaries and topic-based answers.";

const createMessage = (role: ChatRole, content: string): ChatMessage => ({
  id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role,
  content,
});

const buildWelcomeMessage = (chatbotName: string): string =>
  `Hi! I am ${chatbotName}. ${WELCOME_TAGLINE}`;

const createWelcomeMessage = (chatbotName: string): ChatMessage => ({
  id: WELCOME_MESSAGE_ID,
  role: "assistant",
  content: buildWelcomeMessage(chatbotName),
});

const formatBytes = (size: number): string => {
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

export default function SmartSearch({ user }: SmartSearchProps) {
  const [chatbotName, setChatbotName] = useState(DEFAULT_CHATBOT_NAME);
  const [messages, setMessages] = useState<ChatMessage[]>([createWelcomeMessage(DEFAULT_CHATBOT_NAME)]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeFile, setActiveFile] = useState<UploadedChatFile | null>(null);
  const [activeFileMode, setActiveFileMode] = useState<FileMode | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  const historyPayload = useMemo(
    () =>
      messages
        .filter((message) => message.id !== WELCOME_MESSAGE_ID)
        .slice(-10)
        .map((message) => ({ role: message.role, content: message.content })),
    [messages],
  );

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, uploading]);

  const syncWelcomeMessage = (name: string) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === WELCOME_MESSAGE_ID
          ? { ...message, content: buildWelcomeMessage(name) }
          : message,
      ),
    );
  };

  useEffect(() => {
    let active = true;

    const loadChatbotName = async () => {
      try {
        const response = await fetch("/api/chat/name", {
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
          },
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json().catch(() => ({}))) as ChatbotNameResponse;
        const resolvedName = String(data.name || "").trim() || DEFAULT_CHATBOT_NAME;
        if (!active) {
          return;
        }

        setChatbotName(resolvedName);
        syncWelcomeMessage(resolvedName);
      } catch {
        // Keep default name when loading fails.
      }
    };

    void loadChatbotName();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const appendAssistant = (content: string) => {
    setMessages((current) => [...current, createMessage("assistant", content)]);
  };

  const appendUser = (content: string) => {
    setMessages((current) => [...current, createMessage("user", content)]);
  };

  const sendChatMessage = async (params: {
    message: string;
    history: Array<{ role: ChatRole; content: string }>;
    fileId?: string;
    fileMode?: FileMode;
  }): Promise<void> => {
    setSending(true);
    try {
      const response = await fetch("/api/chat/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify(params),
      });

      const data = (await response.json().catch(() => ({}))) as MessageResponse;
      if (!response.ok) {
        appendAssistant(data.error || "Unable to process the request right now.");
        return;
      }

      appendAssistant(data.reply || "I could not generate a response. Please try again.");
    } catch {
      appendAssistant("Network error while contacting chat service.");
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || sending) {
      return;
    }

    setInput("");
    appendUser(message);

    await sendChatMessage({
      message,
      history: historyPayload,
      fileId: activeFile?.id,
      fileMode: activeFile ? activeFileMode || "question" : undefined,
    });
  };

  const clearActiveFile = async () => {
    if (!activeFile) {
      return;
    }

    const fileId = activeFile.id;
    setActiveFile(null);
    setActiveFileMode(null);

    try {
      await fetch("/api/chat/file/clear", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ fileId }),
      });
    } catch {
      // Ignore clear failures; local state is already cleared.
    }
  };

  const handleFileSelection = async (file: File | null) => {
    if (!file || uploading) {
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    try {
      const response = await fetch("/api/chat/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: formData,
      });

      const data = (await response.json().catch(() => ({}))) as {
        file?: UploadedChatFile;
        error?: string;
      };
      if (!response.ok || !data.file) {
        appendAssistant(data.error || "File upload failed.");
        return;
      }

      setActiveFile(data.file);
      setActiveFileMode(null);
      appendAssistant(
        `File uploaded: ${data.file.name}. What do you want from this file?\n- Click "Summarize File", or\n- Click "Ask Topic" and send your question.`,
      );
    } catch {
      appendAssistant("Failed to upload file. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSummarizeFile = async () => {
    if (!activeFile || sending) {
      return;
    }

    const message = "Please summarize this file.";
    setActiveFileMode("summarize");

    await sendChatMessage({
      message,
      history: historyPayload,
      fileId: activeFile.id,
      fileMode: "summarize",
    });
  };

  const handleAskTopicMode = () => {
    if (!activeFile) {
      return;
    }
    setActiveFileMode("question");
    appendAssistant(
      "Topic mode enabled. Ask any specific question about the uploaded file, and I will extract relevant text and answer.",
    );
  };

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-5xl flex-col gap-4 text-slate-900 dark:text-slate-100">
      <header className="space-y-2">
        <div className="agastiya-display inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-2 text-sm text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
          <Sparkles className="h-4 w-4" />
          {chatbotName}
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">{WELCOME_TAGLINE}</p>
      </header>

      {activeFile ? (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/80 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/30">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded-lg bg-white p-2 text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-300">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{activeFile.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {activeFile.mimeType} - {formatBytes(activeFile.size)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSummarizeFile}
                disabled={sending}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                Summarize File
              </button>
              <button
                type="button"
                onClick={handleAskTopicMode}
                className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-50 dark:border-indigo-700 dark:bg-slate-800 dark:text-indigo-300 dark:hover:bg-slate-700"
              >
                Ask Topic
              </button>
              <button
                type="button"
                onClick={clearActiveFile}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                title="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="h-full overflow-y-auto px-4 py-5 sm:px-6">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "whitespace-pre-wrap bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-300">
                      <Bot className="h-3.5 w-3.5" />
                      {chatbotName}
                    </div>
                  ) : null}
                  {message.role === "assistant" ? (
                    <div className="agastiya-markdown">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  ) : (
                    message.content
                  )}
                </div>
              </div>
            ))}

            {(sending || uploading) && (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {uploading ? "Uploading file..." : "Thinking..."}
                </div>
              </div>
            )}
            <div ref={listEndRef} />
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || sending}
            className="rounded-xl border border-slate-200 bg-white p-3 text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            title="Upload file (PDF/TXT/Images)"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md,image/png,image/jpeg,image/webp"
            onChange={(event) => handleFileSelection(event.target.files?.[0] || null)}
            className="hidden"
          />

          <div className="relative min-w-0 basis-full flex-1 sm:basis-auto">
            <MessageSquare className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={
                activeFile
                  ? activeFileMode === "question"
                    ? "Ask a specific topic from the uploaded file..."
                    : "Type an instruction for this file..."
                  : "Ask anything..."
              }
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40"
            />
          </div>

          <button
            type="submit"
            disabled={sending || uploading || !input.trim()}
            className="inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            <SendHorizontal className="h-4 w-4" />
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
