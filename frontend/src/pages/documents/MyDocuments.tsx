import { useState, useEffect, useMemo, useRef } from "react";
import { 
  Files, 
  Eye, 
  Download, 
  Share2, 
  Trash2, 
  Search,
  Filter,
  FileText,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X
} from "lucide-react";
import { User, Document } from "../../types";
import { motion, AnimatePresence } from "motion/react";
import { getAuthToken } from "../../utils/authStorage";
import { apiHtmlFallbackError, isHtmlResponse } from "../../utils/api";

interface MyDocumentsProps {
  user: User;
}

type SortBy = "general" | "date_desc" | "date_asc" | "name_asc" | "size_desc";

const getFileExtension = (title: string): string => {
  const trimmed = String(title || "").trim().toLowerCase();
  const dotIndex = trimmed.lastIndexOf(".");
  return dotIndex >= 0 ? trimmed.slice(dotIndex + 1) : "";
};

const getDocumentType = (doc: Document): string => {
  const mime = String(doc.mime_type || "").toLowerCase();
  const ext = getFileExtension(doc.title);

  if (mime === "application/pdf" || ext === "pdf") {
    return "pdf";
  }

  if (mime.startsWith("image/")) {
    return ext || "image";
  }

  if (mime.includes("word") || ["doc", "docx"].includes(ext)) {
    return "word";
  }

  if (mime.startsWith("text/") || ["txt", "md", "rtf"].includes(ext)) {
    return "text";
  }

  if (ext) {
    return ext;
  }

  if (mime.includes("/")) {
    return mime.split("/")[1] || "file";
  }

  return "file";
};

const formatTypeLabel = (type: string): string => {
  return type.toUpperCase();
};

export default function MyDocuments({ user }: MyDocumentsProps) {
  const PAGE_SIZE = 8;
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("general");
  const [selectedFileType, setSelectedFileType] = useState("all");
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [shareDoc, setShareDoc] = useState<Document | null>(null);
  const [pendingShareDownloadDoc, setPendingShareDownloadDoc] = useState<Document | null>(null);
  const [downloadingShareDocId, setDownloadingShareDocId] = useState<number | null>(null);
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState<Document | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<number | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareResult, setShareResult] = useState("");
  const [error, setError] = useState("");
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const canShareDocument = (doc: Document): boolean => doc.user_id === user.id;
  const canDeleteDocument = (_doc: Document): boolean => true;

  const parseJsonSafe = async (response: Response): Promise<any> => {
    const raw = await response.text();
    if (!raw) {
      return {};
    }
    try {
      return JSON.parse(raw);
    } catch {
      const normalized = raw.toLowerCase();
      if (normalized.includes("<!doctype") || normalized.includes("<html")) {
        return { error: "Server returned HTML instead of JSON." };
      }
      return { error: raw };
    }
  };

  const removeSharedAccessAfterCopy = async (sourceDocId: number): Promise<void> => {
    try {
      const token = getAuthToken();
      await fetch(`/api/documents/${sourceDocId}/shared-access`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Best-effort cleanup to avoid duplicate shared+owned entries.
    }
  };

  const copySharedDocViaDownloadAndUpload = async (doc: Document): Promise<number> => {
    const token = getAuthToken();
    const downloadResponse = await fetch(`/api/documents/${doc.id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (isHtmlResponse(downloadResponse)) {
      throw new Error(apiHtmlFallbackError);
    }

    if (!downloadResponse.ok) {
      const downloadData = await parseJsonSafe(downloadResponse);
      throw new Error(downloadData?.error || "Unable to download this shared file.");
    }

    const blob = await downloadResponse.blob();
    const normalizedTitle = String(doc.title || `document-${doc.id}`);
    const normalizedMimeType = String(doc.mime_type || blob.type || "application/octet-stream");
    const file = new File([blob], normalizedTitle, { type: normalizedMimeType });

    const uploadData = new FormData();
    uploadData.append("file", file);
    uploadData.append("title", normalizedTitle);
    uploadData.append("category", doc.category || "Shared");
    uploadData.append("description", doc.description || "");
    uploadData.append("tags", doc.tags || "");
    uploadData.append("department", doc.department || "");
    uploadData.append("is_secured", "false");

    const uploadResponse = await fetch("/api/documents/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: uploadData,
    });

    if (isHtmlResponse(uploadResponse)) {
      throw new Error(apiHtmlFallbackError);
    }

    const uploaded = await parseJsonSafe(uploadResponse);
    if (!uploadResponse.ok || !uploaded?.id) {
      throw new Error(uploaded?.error || "Unable to save this file to your documents.");
    }

    if (doc.user_id !== user.id) {
      await removeSharedAccessAfterCopy(doc.id);
    }

    return Number(uploaded.id);
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const fetchDocs = async (): Promise<Document[]> => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/documents", {
        headers: { "Authorization": `Bearer ${getAuthToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setDocs(data);
        return data as Document[];
      } else {
        setError("Unable to load documents.");
      }
    } catch (err) {
      console.error(err);
      setError("Unable to load documents.");
    } finally {
      setLoading(false);
    }

    return [];
  };

  const handleDeleteRequest = (doc: Document) => {
    setError("");
    if (!canDeleteDocument(doc)) {
      setError("You do not have permission to delete this document.");
      return;
    }
    setPendingDeleteDoc(doc);
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteDoc || deletingDocId) {
      return;
    }

    const id = pendingDeleteDoc.id;
    setDeletingDocId(id);
    setError("");
    try {
      // Owner delete removes the document globally; non-owner delete removes only their shared access.
      const deleteUrl =
        pendingDeleteDoc.user_id === user.id
          ? `/api/documents/${id}`
          : `/api/documents/${id}/shared-access`;
      const response = await fetch(deleteUrl, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${getAuthToken()}` }
      });
      if (response.ok) {
        setDocs((prev) => prev.filter((d) => d.id !== id));
        setPendingDeleteDoc(null);
      } else {
        const data = await parseJsonSafe(response);
        setError(data?.error || "Unable to delete this document.");
      }
    } catch (err) {
      console.error(err);
      setError((err as Error)?.message || "Unable to delete this document.");
    } finally {
      setDeletingDocId(null);
    }
  };

  const handleCopySharedForShareConfirm = async () => {
    if (!pendingShareDownloadDoc || downloadingShareDocId) {
      return;
    }

    const sourceDoc = pendingShareDownloadDoc;
    setDownloadingShareDocId(sourceDoc.id);
    setError("");
    setShareResult("");

    try {
      const response = await fetch(`/api/documents/${sourceDoc.id}/copy-to-my-documents`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${getAuthToken()}` },
      });

      let copiedDocId = 0;

      if (response.ok) {
        const data = await parseJsonSafe(response);
        copiedDocId = Number(data?.id || 0);
      } else {
        const data = await parseJsonSafe(response);
        const message = String(data?.error || "");
        const normalizedMessage = message.toLowerCase();
        const shouldFallback =
          response.status === 404 ||
          response.status === 405 ||
          normalizedMessage.includes("cannot post") ||
          normalizedMessage.includes("server returned html");

        if (!shouldFallback) {
          setError(message || "Unable to download this shared file.");
          return;
        }

        copiedDocId = await copySharedDocViaDownloadAndUpload(sourceDoc);
      }

      if (!Number.isFinite(copiedDocId) || copiedDocId <= 0) {
        copiedDocId = await copySharedDocViaDownloadAndUpload(sourceDoc);
      }

      const refreshedDocs = await fetchDocs();
      const copiedDoc = refreshedDocs.find((doc) => doc.id === copiedDocId);
      setPendingShareDownloadDoc(null);

      if (copiedDoc) {
        setShareDoc(copiedDoc);
        setShareEmail("");
        setShareResult("");
      } else {
        setShareResult("File downloaded to your documents. You can now share it normally.");
      }
    } catch (err) {
      console.error(err);
      setError((err as Error)?.message || "Unable to download this shared file.");
    } finally {
      setDownloadingShareDocId(null);
    }
  };

  const findExistingOwnedCopy = (
    sourceDoc: Document,
    docsToSearch: Document[] = docs,
  ): Document | undefined => {
    const normalizedTitle = String(sourceDoc.title || "").trim();
    const normalizedMime = String(sourceDoc.mime_type || "").trim().toLowerCase();
    const normalizedSize = Number(sourceDoc.size || 0);

    return docsToSearch.find((candidate) => {
      if (candidate.user_id !== user.id) {
        return false;
      }

      return (
        String(candidate.title || "").trim() === normalizedTitle &&
        String(candidate.mime_type || "").trim().toLowerCase() === normalizedMime &&
        Number(candidate.size || 0) === normalizedSize
      );
    });
  };

  const ensureSharedDocSavedToMyDocuments = async (sourceDoc: Document): Promise<number> => {
    const existingOwnedDoc = findExistingOwnedCopy(sourceDoc);
    if (existingOwnedDoc) {
      if (sourceDoc.user_id !== user.id) {
        await removeSharedAccessAfterCopy(sourceDoc.id);
        await fetchDocs();
      }
      return existingOwnedDoc.id;
    }

    const response = await fetch(`/api/documents/${sourceDoc.id}/copy-to-my-documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    });

    let copiedDocId = 0;

    if (response.ok) {
      const data = await parseJsonSafe(response);
      copiedDocId = Number(data?.id || 0);
    } else {
      const data = await parseJsonSafe(response);
      const message = String(data?.error || "");
      const normalizedMessage = message.toLowerCase();
      const shouldFallback =
        response.status === 404 ||
        response.status === 405 ||
        normalizedMessage.includes("cannot post") ||
        normalizedMessage.includes("server returned html");

      if (!shouldFallback) {
        throw new Error(message || "Unable to save this shared file to your documents.");
      }

      copiedDocId = await copySharedDocViaDownloadAndUpload(sourceDoc);
    }

    if (!Number.isFinite(copiedDocId) || copiedDocId <= 0) {
      copiedDocId = await copySharedDocViaDownloadAndUpload(sourceDoc);
    }

    const refreshedDocs = await fetchDocs();
    const refreshedOwnedDoc =
      refreshedDocs.find((doc) => doc.id === copiedDocId) || findExistingOwnedCopy(sourceDoc, refreshedDocs);

    if (refreshedOwnedDoc) {
      return refreshedOwnedDoc.id;
    }

    if (Number.isFinite(copiedDocId) && copiedDocId > 0) {
      return copiedDocId;
    }

    throw new Error("Unable to save this shared file to your documents.");
  };

  const handleDownload = async (doc: Document) => {
    setError("");
    try {
      let downloadDocId = doc.id;
      if (doc.user_id !== user.id) {
        downloadDocId = await ensureSharedDocSavedToMyDocuments(doc);
      }

      const response = await fetch(`/api/documents/${downloadDocId}/download`, {
        headers: { "Authorization": `Bearer ${getAuthToken()}` }
      });
      if (isHtmlResponse(response)) {
        throw new Error(apiHtmlFallbackError);
      }
      if (!response.ok) {
        const data = await parseJsonSafe(response);
        throw new Error(data?.error || "Unable to download this document.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.title;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error(err);
      setError((err as Error)?.message || "Unable to download this document.");
    }
  };

  const openInBrowser = async (doc: Document) => {
    setError("");
    const previewTab = window.open("", "_blank");
    try {
      if (previewTab && !previewTab.closed) {
        previewTab.document.title = "Opening document...";
        if (previewTab.document.body) {
          previewTab.document.body.textContent = "Loading document preview...";
        }
      }

      const response = await fetch(`/api/documents/${doc.id}/view`, {
        headers: { "Authorization": `Bearer ${getAuthToken()}` }
      });
      if (isHtmlResponse(response)) {
        throw new Error(apiHtmlFallbackError);
      }
      if (!response.ok) {
        const data = await parseJsonSafe(response);
        throw new Error(data?.error || "Unable to view this document.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      if (previewTab && !previewTab.closed) {
        previewTab.location.href = url;
      } else {
        const fallbackTab = window.open(url, "_blank", "noopener,noreferrer");
        if (!fallbackTab) {
          window.location.href = url;
        }
      }

      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      if (previewTab && !previewTab.closed) {
        previewTab.close();
      }
      console.error(err);
      setError((err as Error)?.message || "Unable to view this document.");
    }
  };

  const handleView = (doc: Document) => {
    void openInBrowser(doc);
  };

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareDoc || !shareEmail) return;
    setError("");
    if (!canShareDocument(shareDoc)) {
      setShareResult("You can share only your own documents.");
      return;
    }

    setSharing(true);
    setShareResult("");
    try {
      const response = await fetch(`/api/documents/${shareDoc.id}/share`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getAuthToken()}` 
        },
        body: JSON.stringify({ email: shareEmail.trim(), permission: "view" }),
      });

      if (response.ok) {
        setShareResult(`Share request sent to ${shareEmail}. Waiting for recipient approval.`);
        setShareDoc(null);
        setShareEmail("");
      } else {
        const data = await response.json();
        setShareResult(data.error || "Sharing failed");
      }
    } catch (err) {
      console.error(err);
      setShareResult("An unexpected error occurred while sharing.");
    } finally {
      setSharing(false);
    }
  };

  const availableFileTypes = useMemo(() => {
    const allTypes = docs.map((doc) => getDocumentType(doc));
    return [...new Set(allTypes)].sort((a, b) => a.localeCompare(b));
  }, [docs]);

  const filteredDocs = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const visibleDocs = docs.filter((doc) => {
      const matchesSearch =
        !normalizedSearch ||
        doc.title.toLowerCase().includes(normalizedSearch) ||
        doc.category?.toLowerCase().includes(normalizedSearch) ||
        doc.tags?.toLowerCase().includes(normalizedSearch);

      if (!matchesSearch) {
        return false;
      }

      if (selectedFileType === "all") {
        return true;
      }

      return getDocumentType(doc) === selectedFileType;
    });

    if (sortBy === "general") {
      return visibleDocs;
    }

    return visibleDocs.sort((a, b) => {
      if (sortBy === "name_asc") {
        return a.title.localeCompare(b.title);
      }

      if (sortBy === "size_desc") {
        return b.size - a.size;
      }

      const aDate = new Date(a.upload_date).getTime();
      const bDate = new Date(b.upload_date).getTime();
      return sortBy === "date_asc" ? aDate - bDate : bDate - aDate;
    });
  }, [docs, searchTerm, sortBy, selectedFileType]);

  const ownedFilteredDocs = useMemo(
    () => filteredDocs.filter((doc) => doc.user_id === user.id),
    [filteredDocs, user.id],
  );
  const sharedFilteredDocs = useMemo(
    () => filteredDocs.filter((doc) => doc.user_id !== user.id),
    [filteredDocs, user.id],
  );

  const totalPages = Math.max(1, Math.ceil(ownedFilteredDocs.length / PAGE_SIZE));
  const currentPageSafe = Math.min(currentPage, totalPages);
  const startIndex = (currentPageSafe - 1) * PAGE_SIZE;
  const pagedOwnedDocs = ownedFilteredDocs.slice(startIndex, startIndex + PAGE_SIZE);
  const pageStart = ownedFilteredDocs.length === 0 ? 0 : startIndex + 1;
  const pageEnd = Math.min(startIndex + PAGE_SIZE, ownedFilteredDocs.length);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (selectedFileType !== "all" && !availableFileTypes.includes(selectedFileType)) {
      setSelectedFileType("all");
    }
  }, [availableFileTypes, selectedFileType]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setIsFilterMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const renderDocumentRow = (doc: Document) => (
    <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-lg group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/50 transition-colors">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate max-w-[240px]">{doc.title}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 uppercase font-bold">{doc.mime_type?.split('/')[1] || "file"}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
          {doc.category || "General"}
        </span>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center text-[10px] font-bold">
            {doc.uploaded_by[0].toUpperCase()}
          </div>
          <span className="text-sm text-slate-600 dark:text-slate-300">{doc.uploaded_by}</span>
        </div>
      </td>
      <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
        {new Date(doc.upload_date).toLocaleString()}
      </td>
      <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
        {(doc.size / 1024 / 1024).toFixed(2)} MB
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex items-center justify-end gap-2">
          <button 
            onClick={() => handleView(doc)}
            className="p-2 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-all"
            title="View"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => void handleDownload(doc)}
            className="p-2 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-all"
            title={doc.user_id === user.id ? "Download" : "Download and save"}
          >
            <Download className="w-4 h-4" />
          </button>
          <button 
            onClick={() => {
              if (!canShareDocument(doc)) {
                setPendingShareDownloadDoc(doc);
                setShareResult("");
                setError("");
                return;
              }
              setShareDoc(doc);
              setShareEmail("");
              setShareResult("");
            }}
            className="p-2 rounded-lg transition-all text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
            title={canShareDocument(doc) ? "Share" : "Download to share"}
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button 
            onClick={() => handleDeleteRequest(doc)}
            className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="space-y-8 text-slate-900 dark:text-slate-100">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Documents</h1>
          <p className="text-slate-500 dark:text-slate-400">Manage and organize your document library.</p>
        </div>
        
        <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Filter documents..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-64 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>
          <div ref={filterMenuRef} className="relative">
            <button
              onClick={() => setIsFilterMenuOpen((prev) => !prev)}
              className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              title="Sort and filter"
            >
              <Filter className="w-5 h-5" />
            </button>

            {isFilterMenuOpen && (
              <div className="absolute right-0 mt-2 w-[min(18rem,calc(100vw-2rem))] z-30 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-4 space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Sort By</p>
                  {[
                    { value: "general" as SortBy, label: "General" },
                    { value: "name_asc" as SortBy, label: "Name (A-Z)" },
                    { value: "date_desc" as SortBy, label: "Date (Newest)" },
                    { value: "date_asc" as SortBy, label: "Date (Oldest)" },
                    { value: "size_desc" as SortBy, label: "File Size (Largest)" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setSortBy(option.value);
                        setCurrentPage(1);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        sortBy === option.value
                          ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-semibold"
                          : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">File Type</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFileType("all");
                      setCurrentPage(1);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedFileType === "all"
                        ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-semibold"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    General
                  </button>
                  {availableFileTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setSelectedFileType(type);
                        setCurrentPage(1);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        selectedFileType === type
                          ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-semibold"
                          : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      {formatTypeLabel(type)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {shareResult && (
        <div className="px-4 py-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-sm font-medium border border-indigo-100 dark:border-indigo-800/70">
          {shareResult}
        </div>
      )}
      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm font-medium border border-red-100 dark:border-red-800/70">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-10 sm:p-20 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
            <Loader2 className="w-10 h-10 animate-spin mb-4" />
            <p className="font-medium">Loading your documents...</p>
          </div>
        ) : ownedFilteredDocs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Document Name</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Uploaded By</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Size</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pagedOwnedDocs.map(renderDocumentRow)}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 sm:p-20 text-center">
            <div className="bg-slate-50 dark:bg-slate-800 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Files className="w-10 h-10 text-slate-300 dark:text-slate-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">No uploaded documents found</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-2">Try adjusting your search or upload a new document.</p>
          </div>
        )}

        <div className="px-4 sm:px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center sm:text-left">
            Showing {pageStart}-{pageEnd} of {ownedFilteredDocs.length} documents
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30"
              disabled={currentPageSafe === 1}
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {currentPageSafe}/{totalPages}
            </span>
            <button
              className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30"
              disabled={currentPageSafe === totalPages}
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {!loading && (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Shared files</h2>
            <p className="text-slate-500 dark:text-slate-400">These files were shared with you by other users.</p>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
            {sharedFilteredDocs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Document Name</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Uploaded By</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Size</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {sharedFilteredDocs.map(renderDocumentRow)}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-10 text-center">
                <p className="text-slate-500 dark:text-slate-400">No files shared by other users.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Sharing Modal */}
      <AnimatePresence>
        {shareDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShareDoc(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Share Document</h3>
                <button onClick={() => setShareDoc(null)} className="p-2 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleShare} className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Selected Document</label>
                  <input
                    type="text"
                    value={shareDoc.title}
                    readOnly
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-slate-700 dark:text-slate-200"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">User Email</label>
                  <input
                    type="email"
                    required
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    placeholder="Enter user email to share with"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={sharing}
                  className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-all disabled:opacity-50"
                >
                  {sharing ? "Sharing..." : "Share Document"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pendingDeleteDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPendingDeleteDoc(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900"
            >
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Delete Document</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Are you sure you want to delete this file?
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPendingDeleteDoc(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteConfirm()}
                  disabled={deletingDocId === pendingDeleteDoc.id}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                >
                  {deletingDocId === pendingDeleteDoc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {deletingDocId === pendingDeleteDoc.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pendingShareDownloadDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPendingShareDownloadDoc(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900"
            >
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Download Before Sharing</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                This file is shared by <span className="font-semibold">{pendingShareDownloadDoc.uploaded_by}</span>.
                If you want to share it, you need to download it to your documents first.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPendingShareDownloadDoc(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopySharedForShareConfirm()}
                  disabled={downloadingShareDocId === pendingShareDownloadDoc.id}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                >
                  {downloadingShareDocId === pendingShareDownloadDoc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {downloadingShareDocId === pendingShareDownloadDoc.id ? "Downloading..." : "Download"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Document Viewer Modal (Simplified) */}
      <AnimatePresence>
        {selectedDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDoc(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-5xl h-[88vh] sm:h-[80vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-slate-900">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-2xl">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white break-words">{selectedDoc.title}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Uploaded on {new Date(selectedDoc.upload_date).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex w-full sm:w-auto items-center justify-end gap-2 sm:gap-3">
                  <button 
                    onClick={() => handleDownload(selectedDoc)}
                    className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500 transition-colors"
                  >
                    <Download className="w-4 h-4" /> Download
                  </button>
                  <button 
                    onClick={() => setSelectedDoc(null)}
                    className="p-2 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 bg-slate-100 dark:bg-slate-950 p-4 sm:p-8 overflow-y-auto">
                <div className="max-w-3xl mx-auto bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-700 rounded-xl p-5 sm:p-12 min-h-full">
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-8 break-words">{selectedDoc.title}</h1>
                  <div className="space-y-4 text-slate-600 dark:text-slate-300 leading-relaxed">
                    <p className="font-medium text-slate-900 dark:text-slate-100">Document Metadata:</p>
                    <ul className="list-disc list-inside space-y-2">
                      <li>Category: {selectedDoc.category}</li>
                      <li>Department: {selectedDoc.department}</li>
                      <li>Tags: {selectedDoc.tags}</li>
                      <li>Description: {selectedDoc.description}</li>
                    </ul>
                    {selectedDoc.content ? (
                      <div className="mt-8 p-4 sm:p-6 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl">
                        <p className="font-medium text-slate-900 dark:text-slate-100 mb-3">Extracted Content</p>
                        <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                          {selectedDoc.content}
                        </pre>
                      </div>
                    ) : (
                      <div className="mt-12 p-5 sm:p-8 bg-slate-50 dark:bg-slate-800/60 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-center">
                        <p className="text-slate-400 dark:text-slate-500 italic">
                          Preview content is not available yet for this file.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
