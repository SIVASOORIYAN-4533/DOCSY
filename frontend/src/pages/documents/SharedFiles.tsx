import { Share2, FileText, Loader2, Download, Eye, Trash2, Upload, X, Check, Ban } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Document, User } from "../../types";
import { AnimatePresence, motion } from "motion/react";
import { getAuthToken } from "../../utils/authStorage";

interface SharedFilesProps {
  user: User;
}

export default function SharedFiles({ user }: SharedFilesProps) {
  const [incomingDocs, setIncomingDocs] = useState<Document[]>([]);
  const [sharedByMeDocs, setSharedByMeDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareFile, setShareFile] = useState<File | null>(null);
  const [sharing, setSharing] = useState(false);

  const token = getAuthToken();

  const parseJsonSafe = async (response: Response): Promise<any> => {
    const raw = await response.text();
    if (!raw) {
      return {};
    }
    try {
      return JSON.parse(raw);
    } catch {
      return { error: raw.includes("<!doctype") ? "Server returned HTML instead of JSON." : raw };
    }
  };

  const fetchSharedFiles = async () => {
    setLoading(true);
    setError("");

    try {
      const [incomingResponse, outgoingResponse] = await Promise.all([
        fetch("/api/documents/shared-with-me", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/documents/shared-by-me", { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const incomingData = await parseJsonSafe(incomingResponse);
      const outgoingData = await parseJsonSafe(outgoingResponse);

      if (incomingResponse.ok && Array.isArray(incomingData)) {
        setIncomingDocs(incomingData as Document[]);
      } else {
        setIncomingDocs([]);
        setError(
          (incomingData && typeof incomingData.error === "string" && incomingData.error) ||
          "Unable to load incoming share requests.",
        );
      }

      setSharedByMeDocs(outgoingResponse.ok && Array.isArray(outgoingData) ? (outgoingData as Document[]) : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load shared files.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSharedFiles();
  }, [user.id]);

  const incomingPending = useMemo(
    () => incomingDocs.filter((doc) => doc.shared_status === "pending"),
    [incomingDocs],
  );
  const incomingAccepted = useMemo(
    () => incomingDocs.filter((doc) => (doc.shared_status || "accepted") === "accepted"),
    [incomingDocs],
  );

  const handleShareUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareFile) {
      setError("Please upload a file.");
      return;
    }

    setSharing(true);
    setError("");
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("email", shareEmail.trim());
      formData.append("file", shareFile);
      formData.append("title", shareFile.name);

      const response = await fetch("/api/documents/share-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await parseJsonSafe(response);
      if (response.ok) {
        setMessage(`File shared successfully to ${shareEmail}. Waiting for recipient approval.`);
        setIsShareModalOpen(false);
        setShareEmail("");
        setShareFile(null);
        void fetchSharedFiles();
        return;
      }

      // Fallback path for older/misaligned backend state: upload -> share
      const uploadData = new FormData();
      uploadData.append("file", shareFile);
      uploadData.append("title", shareFile.name);
      uploadData.append("category", "Shared");
      uploadData.append("description", "");
      uploadData.append("tags", "");
      uploadData.append("department", "");
      uploadData.append("is_secured", "false");

      const uploadResponse = await fetch("/api/documents/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: uploadData,
      });
      const uploaded = await parseJsonSafe(uploadResponse);
      if (!uploadResponse.ok || !uploaded?.id) {
        throw new Error(data.error || uploaded.error || "Sharing failed");
      }

      const shareResponse = await fetch(`/api/documents/${uploaded.id}/share`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: shareEmail.trim(), permission: "view" }),
      });
      const shared = await parseJsonSafe(shareResponse);
      if (!shareResponse.ok) {
        await fetch(`/api/documents/${uploaded.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => undefined);
        throw new Error(shared.error || data.error || "Sharing failed");
      }

      setMessage(`File shared successfully to ${shareEmail}.`);
      setIsShareModalOpen(false);
      setShareEmail("");
      setShareFile(null);
      void fetchSharedFiles();
    } catch (err: any) {
      setError(err?.message || "Sharing failed");
    } finally {
      setSharing(false);
    }
  };

  const respondToShare = async (docId: number, action: "accept" | "decline") => {
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/documents/${docId}/shared-request/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await parseJsonSafe(response);
      if (!response.ok) {
        throw new Error(data.error || `Unable to ${action} request.`);
      }
      setMessage(action === "accept" ? "File accepted successfully." : "File declined successfully.");
      void fetchSharedFiles();
    } catch (err: any) {
      setError(err?.message || `Unable to ${action} request.`);
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const response = await fetch(`/api/documents/${doc.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await parseJsonSafe(response);
        throw new Error(data.error || "Unable to download this file.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.title;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: any) {
      setError(err?.message || "Unable to download this file.");
    }
  };

  const handleView = async (doc: Document) => {
    try {
      const response = await fetch(`/api/documents/${doc.id}/view`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await parseJsonSafe(response);
        throw new Error(data.error || "Unable to view this file.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      setError(err?.message || "Unable to view this file.");
    }
  };

  const handleDeleteAccess = async (doc: Document) => {
    const proceed = window.confirm("Confirm to remove file?");
    if (!proceed) {
      return;
    }

    try {
      const response = await fetch(`/api/documents/${doc.id}/shared-access`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await parseJsonSafe(response);
      if (!response.ok) {
        throw new Error(data.error || "Unable to remove shared file.");
      }
      setMessage("File removed successfully.");
      void fetchSharedFiles();
    } catch (err: any) {
      setError(err?.message || "Unable to remove shared file.");
    }
  };

  return (
    <div className="space-y-8 text-slate-900 dark:text-slate-100">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Shared Files</h1>
          <p className="text-slate-500 dark:text-slate-400">Incoming requests and files shared by you.</p>
        </div>
        <button
          onClick={() => {
            setError("");
            setMessage("");
            setIsShareModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500 transition-colors"
        >
          <Upload className="w-4 h-4" />
          Share File
        </button>
      </header>

      {message && <div className="bg-emerald-50 border border-emerald-100 dark:bg-emerald-900/30 dark:border-emerald-800 rounded-2xl p-4 text-emerald-700 dark:text-emerald-300 text-sm font-medium">{message}</div>}
      {error && <div className="bg-red-50 border border-red-100 dark:bg-red-900/30 dark:border-red-800 rounded-2xl p-4 text-red-700 dark:text-red-300 text-sm font-medium">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-indigo-600 w-10 h-10" />
        </div>
      ) : (
        <>
          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Incoming Share Requests</h2>
            {incomingPending.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 text-sm text-slate-500 dark:text-slate-400">No pending requests.</div>
            ) : (
              incomingPending.map((doc) => (
                <div key={`pending-${doc.id}`} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4">
                  <FileText className="w-6 h-6 text-indigo-600" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{doc.title}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate">Shared by {doc.shared_by_email || "Unknown"}</p>
                  </div>
                  <button
                    onClick={() => void respondToShare(doc.id, "accept")}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500"
                  >
                    <Check className="w-4 h-4" /> Accept
                  </button>
                  <button
                    onClick={() => void respondToShare(doc.id, "decline")}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-500"
                  >
                    <Ban className="w-4 h-4" /> Decline
                  </button>
                </div>
              ))
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Accepted Shared Files</h2>
            {incomingAccepted.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 text-sm text-slate-500 dark:text-slate-400">No accepted shared files.</div>
            ) : (
              incomingAccepted.map((doc) => (
                <div key={`accepted-${doc.id}`} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-6">
                  <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-2xl">
                    <FileText className="w-8 h-8" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate">{doc.title}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate">Shared by {doc.shared_by_email || "Unknown"}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {doc.shared_at ? new Date(doc.shared_at).toLocaleString() : new Date(doc.upload_date).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => void handleView(doc)} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700" title="View">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => void handleDownload(doc)} className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50" title="Download">
                      <Download className="w-4 h-4" />
                    </button>
                    <button onClick={() => void handleDeleteAccess(doc)} className="p-2 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Shared By Me</h2>
            {sharedByMeDocs.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 text-sm text-slate-500 dark:text-slate-400">No files shared by you yet.</div>
            ) : (
              sharedByMeDocs.map((doc) => (
                <div key={`outgoing-${doc.id}-${doc.shared_to_email || "unknown"}`} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{doc.title}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate">To: {doc.shared_to_email || "Unknown"}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{doc.shared_at ? new Date(doc.shared_at).toLocaleString() : ""}</p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                      doc.shared_status === "declined"
                        ? "bg-red-100 text-red-700"
                        : doc.shared_status === "pending"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {doc.shared_status || "accepted"}
                  </span>
                </div>
              ))
            )}
          </section>
        </>
      )}

      <AnimatePresence>
        {isShareModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsShareModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Share File</h3>
                <button onClick={() => setIsShareModalOpen(false)} className="p-2 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleShareUpload} className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Email</label>
                  <input
                    type="email"
                    required
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    placeholder="Enter recipient email"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Upload File</label>
                  <input
                    type="file"
                    required
                    onChange={(e) => setShareFile(e.target.files?.[0] || null)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-slate-100 file:text-slate-900 dark:file:text-slate-100"
                  />
                </div>
                <button
                  type="submit"
                  disabled={sharing}
                  className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {sharing ? "Sharing..." : "Share"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
