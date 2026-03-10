import { useState, useCallback } from "react";
import { Upload as UploadIcon, FileText, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { User } from "../../types";
import { motion, AnimatePresence } from "motion/react";
import { CATEGORIES, DEPARTMENTS } from "../../constants";

interface UploadProps {
  user: User;
}

export default function Upload({ user }: UploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [metadata, setMetadata] = useState({
    title: "",
    category: "General",
    description: "",
    tags: "",
    department: DEPARTMENTS[0],
    is_secured: false,
  });

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) setFile(droppedFile);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) setFile(selectedFile);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", metadata.title || file.name);
    formData.append("category", metadata.category);
    formData.append("description", metadata.description);
    formData.append("tags", metadata.tags);
    formData.append("department", metadata.department);
    formData.append("is_secured", metadata.is_secured.toString());

    try {
      const response = await fetch("/api/documents/upload", {
        method: "POST",
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` },
        body: formData,
      });

      if (response.ok) {
        setSuccess(true);
        setFile(null);
        setMetadata({
          title: "",
          category: "General",
          description: "",
          tags: "",
          department: DEPARTMENTS[0],
          is_secured: false,
        });
      } else {
        const data = await response.json();
        setError(data.error || "Upload failed");
      }
    } catch (err) {
      setError("An error occurred during upload.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 text-slate-900 dark:text-slate-100">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Upload Document</h1>
        <p className="text-slate-500 dark:text-slate-400">Add new documents to your intelligent library.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`relative border-2 border-dashed rounded-3xl p-12 text-center transition-all ${
              isDragging 
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" 
                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-300 dark:hover:border-indigo-600"
            }`}
          >
            <input
              type="file"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              accept=".pdf,.docx,.xlsx,.jpg,.png,.txt"
            />
            
            <div className="flex flex-col items-center">
              <div className={`p-4 rounded-2xl mb-4 transition-colors ${file ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300" : "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300"}`}>
                {file ? <CheckCircle2 className="w-10 h-10" /> : <UploadIcon className="w-10 h-10" />}
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {file ? file.name : "Drop files here or click to upload"}
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
                Supported formats: PDF, DOCX, XLSX, JPG, PNG, TXT
              </p>
              {file && (
                <button 
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="mt-4 text-sm font-bold text-red-500 dark:text-red-300 hover:text-red-600 dark:hover:text-red-200 flex items-center gap-1"
                >
                  <X className="w-4 h-4" /> Remove File
                </button>
              )}
            </div>
          </div>

          <AnimatePresence>
            {success && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 p-4 rounded-2xl flex items-center gap-3 text-emerald-800 dark:text-emerald-300"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">Document uploaded successfully!</span>
                <button onClick={() => setSuccess(false)} className="ml-auto text-emerald-600 dark:text-emerald-300 hover:text-emerald-700 dark:hover:text-emerald-200">
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 p-4 rounded-2xl flex items-center gap-3 text-red-800 dark:text-red-300"
              >
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">{error}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">Document Title</label>
            <input
              type="text"
              value={metadata.title}
              onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
              placeholder="Enter document title"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">Category</label>
              <select
                value={metadata.category}
                onChange={(e) => setMetadata({ ...metadata, category: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none text-slate-900 dark:text-slate-100"
              >
                {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">Department</label>
              <select
                value={metadata.department}
                onChange={(e) => setMetadata({ ...metadata, department: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none text-slate-900 dark:text-slate-100"
              >
                {DEPARTMENTS.map(dept => <option key={dept} value={dept}>{dept}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">Description</label>
            <textarea
              value={metadata.description}
              onChange={(e) => setMetadata({ ...metadata, description: e.target.value })}
              placeholder="Brief description of the document..."
              rows={3}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">Tags (comma separated)</label>
            <input
              type="text"
              value={metadata.tags}
              onChange={(e) => setMetadata({ ...metadata, tags: e.target.value })}
              placeholder="invoice, march, 2024"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>

          <div className="flex items-center gap-3 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800/70">
            <input
              type="checkbox"
              id="is_secured"
              checked={metadata.is_secured}
              onChange={(e) => setMetadata({ ...metadata, is_secured: e.target.checked })}
              className="w-5 h-5 text-indigo-600 rounded-lg focus:ring-indigo-500"
            />
            <label htmlFor="is_secured" className="flex items-center gap-2 cursor-pointer">
              <span className="font-bold text-indigo-900 dark:text-indigo-200">Secured Document</span>
              <span className="text-xs text-indigo-600 dark:text-indigo-300 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-700">Vault Protection</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={!file || uploading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-600/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <UploadIcon className="w-5 h-5" />
                Upload Document
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
