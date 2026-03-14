import { useState, useEffect } from "react";
import { Search, Files, FileText, Calendar, Tag, User as UserIcon, Loader2, ArrowRight, Sparkles } from "lucide-react";
import { User, Document } from "../../types";
import { motion, AnimatePresence } from "motion/react";
import { useSearchParams } from "react-router-dom";
import { getAuthToken } from "../../utils/authStorage";

interface SmartSearchProps {
  user: User;
}

export default function SmartSearch({ user }: SmartSearchProps) {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [results, setResults] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setQuery(q);
      performSearch(q);
    }
  }, [searchParams]);

  const performSearch = async (searchQuery: string) => {
    setLoading(true);
    setHasSearched(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: { "Authorization": `Bearer ${getAuthToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setResults(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    performSearch(query);
  };

  const suggestions = [
    "Invoices from last month",
    "Technical specifications for Project X",
    "HR policies regarding remote work",
    "Marketing strategy 2024",
  ];

  const handleDownload = async (doc: Document) => {
    try {
      const response = await fetch(`/api/documents/${doc.id}/download`, {
        headers: { "Authorization": `Bearer ${getAuthToken()}` },
      });
      if (!response.ok) return;

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.title;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-12 text-slate-900 dark:text-slate-100">
      <header className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-full text-sm font-bold mb-2">
          <Sparkles className="w-4 h-4" />
          AI-Powered Search Engine
        </div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight">What are you looking for?</h1>
        <p className="text-slate-500 dark:text-slate-400 text-lg max-w-2xl mx-auto">
          Search through document names, tags, categories, and even the content inside your files.
        </p>
      </header>

      <div className="relative max-w-3xl mx-auto">
        <form onSubmit={handleSearch} className="relative group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, keyword, or content..."
            className="w-full bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 rounded-3xl py-5 pl-16 pr-32 text-lg shadow-xl shadow-slate-200/50 dark:shadow-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-indigo-500 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : "Search"}
          </button>
        </form>

        {!hasSearched && (
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <span className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest w-full text-center mb-2">Try searching for</span>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setQuery(s);
                  performSearch(s);
                }}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 hover:text-indigo-600 dark:hover:text-indigo-300 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium transition-all"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-6">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500"
            >
              <div className="relative">
                <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-indigo-600" />
              </div>
              <p className="mt-6 font-bold text-lg text-slate-600 dark:text-slate-300">AI is analyzing your library...</p>
              <p className="text-sm">Scanning through thousands of pages</p>
            </motion.div>
          ) : hasSearched ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Search Results <span className="text-slate-400 dark:text-slate-500 font-medium ml-2">({results.length})</span>
                </h2>
                <div className="flex items-center gap-2 text-sm font-bold text-indigo-600">
                  Sorted by Relevance
                </div>
              </div>

              {results.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {results.map((doc, i) => (
                    <motion.div
                      key={doc.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="group bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md dark:hover:shadow-none hover:border-indigo-100 dark:hover:border-indigo-700 transition-all cursor-pointer"
                    >
                      <div className="flex items-start gap-6">
                        <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          <FileText className="w-8 h-8" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">
                              {doc.title}
                            </h3>
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                              {doc.mime_type?.split('/')[1] || "file"}
                            </span>
                          </div>
                          <p className="text-slate-500 dark:text-slate-400 text-sm line-clamp-2 mb-4">
                            {doc.description || "No description provided for this document."}
                          </p>
                          <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-400 dark:text-slate-500">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5" />
                              {new Date(doc.upload_date).toLocaleDateString()}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Tag className="w-3.5 h-3.5" />
                              {doc.category || "General"}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <UserIcon className="w-3.5 h-3.5" />
                              {doc.uploaded_by}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-center justify-center h-full">
                           <button
                             type="button"
                             onClick={() => handleDownload(doc)}
                             className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-xl group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/40 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-all"
                             title="Download"
                           >
                             <ArrowRight className="w-5 h-5" />
                           </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="py-20 text-center">
                  <div className="bg-slate-50 dark:bg-slate-800 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Search className="w-10 h-10 text-slate-300 dark:text-slate-500" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">No matches found</h3>
                  <p className="text-slate-500 dark:text-slate-400 mt-2">We couldn't find any documents matching your query.</p>
                </div>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
