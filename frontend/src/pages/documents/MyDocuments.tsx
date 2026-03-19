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
  const [shareEmail, setShareEmail] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareResult, setShareResult] = useState("");
  const [error, setError] = useState("");
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const canShareDocument = (doc: Document): boolean => doc.user_id === user.id;

  useEffect(() => {
    fetchDocs();
  }, []);

  const fetchDocs = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/documents", {
        headers: { "Authorization": `Bearer ${getAuthToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setDocs(data);
      } else {
        setError("Unable to load documents.");
      }
    } catch (err) {
      console.error(err);
      setError("Unable to load documents.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this document?")) return;
    setError("");
    try {
      const response = await fetch(`/api/documents/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${getAuthToken()}` }
      });
      if (response.ok) {
        setDocs((prev) => prev.filter((d) => d.id !== id));
      } else {
        setError("Unable to delete this document.");
      }
    } catch (err) {
      console.error(err);
      setError("Unable to delete this document.");
    }
  };

  const handleDownload = async (doc: Document) => {
    setError("");
    try {
      const response = await fetch(`/api/documents/${doc.id}/download`, {
        headers: { "Authorization": `Bearer ${getAuthToken()}` }
      });
      if (isHtmlResponse(response)) {
        throw new Error(apiHtmlFallbackError);
      }
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = doc.title;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        setError("Unable to download this document.");
      }
    } catch (err) {
      console.error(err);
      setError((err as Error)?.message || "Unable to download this document.");
    }
  };

  const openInBrowser = async (doc: Document) => {
    setError("");
    try {
      const response = await fetch(`/api/documents/${doc.id}/view`, {
        headers: { "Authorization": `Bearer ${getAuthToken()}` }
      });
      if (isHtmlResponse(response)) {
        throw new Error(apiHtmlFallbackError);
      }
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        setError("Unable to view this document.");
      }
    } catch (err) {
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

  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / PAGE_SIZE));
  const currentPageSafe = Math.min(currentPage, totalPages);
  const startIndex = (currentPageSafe - 1) * PAGE_SIZE;
  const pagedDocs = filteredDocs.slice(startIndex, startIndex + PAGE_SIZE);
  const pageStart = filteredDocs.length === 0 ? 0 : startIndex + 1;
  const pageEnd = Math.min(startIndex + PAGE_SIZE, filteredDocs.length);

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

  return (
    <div className="space-y-8 text-slate-900 dark:text-slate-100">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Documents</h1>
          <p className="text-slate-500 dark:text-slate-400">Manage and organize your document library.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Filter documents..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-64 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
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
              <div className="absolute right-0 mt-2 w-72 z-30 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-4 space-y-4">
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
          <div className="p-20 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
            <Loader2 className="w-10 h-10 animate-spin mb-4" />
            <p className="font-medium">Loading your documents...</p>
          </div>
        ) : filteredDocs.length > 0 ? (
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
                {pagedDocs.map((doc) => (
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
                          onClick={() => {
                            if (!canShareDocument(doc)) {
                              setShareResult("You can share only your own documents.");
                              return;
                            }
                            setShareDoc(doc);
                            setShareEmail("");
                            setShareResult("");
                          }}
                          className={`p-2 rounded-lg transition-all ${
                            canShareDocument(doc)
                              ? "text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                              : "text-slate-300 dark:text-slate-600 cursor-not-allowed"
                          }`}
                          title={canShareDocument(doc) ? "Share" : "Only owner can share"}
                          disabled={!canShareDocument(doc)}
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(doc.id)}
                          className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-20 text-center">
            <div className="bg-slate-50 dark:bg-slate-800 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Files className="w-10 h-10 text-slate-300 dark:text-slate-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">No documents found</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-2">Try adjusting your search or upload a new document.</p>
          </div>
        )}

        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Showing {pageStart}-{pageEnd} of {filteredDocs.length} documents
          </p>
          <div className="flex items-center gap-2">
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

      {/* Sharing Modal */}
      <AnimatePresence>
        {shareDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
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

      {/* Document Viewer Modal (Simplified) */}
      <AnimatePresence>
        {selectedDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
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
              className="relative w-full max-w-5xl h-[80vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-2xl">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">{selectedDoc.title}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Uploaded on {new Date(selectedDoc.upload_date).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => handleDownload(selectedDoc)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500 transition-colors"
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
              
              <div className="flex-1 bg-slate-100 dark:bg-slate-950 p-8 overflow-y-auto">
                <div className="max-w-3xl mx-auto bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-700 rounded-xl p-12 min-h-full">
                  <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-8">{selectedDoc.title}</h1>
                  <div className="space-y-4 text-slate-600 dark:text-slate-300 leading-relaxed">
                    <p className="font-medium text-slate-900 dark:text-slate-100">Document Metadata:</p>
                    <ul className="list-disc list-inside space-y-2">
                      <li>Category: {selectedDoc.category}</li>
                      <li>Department: {selectedDoc.department}</li>
                      <li>Tags: {selectedDoc.tags}</li>
                      <li>Description: {selectedDoc.description}</li>
                    </ul>
                    {selectedDoc.content ? (
                      <div className="mt-8 p-6 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl">
                        <p className="font-medium text-slate-900 dark:text-slate-100 mb-3">Extracted Content</p>
                        <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                          {selectedDoc.content}
                        </pre>
                      </div>
                    ) : (
                      <div className="mt-12 p-8 bg-slate-50 dark:bg-slate-800/60 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-center">
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
