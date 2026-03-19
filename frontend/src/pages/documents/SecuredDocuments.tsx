import { useState, useEffect } from "react";
import { 
  Lock, 
  Shield, 
  Key, 
  Eye, 
  Download, 
  Trash2, 
  FileText, 
  Loader2,
  AlertCircle,
  CheckCircle2,
  X
} from "lucide-react";
import { User, Document } from "../../types";
import { motion, AnimatePresence } from "motion/react";
import { getAuthToken } from "../../utils/authStorage";
import { apiHtmlFallbackError, isHtmlResponse } from "../../utils/api";

interface SecuredDocumentsProps {
  user: User;
}

export default function SecuredDocuments({ user }: SecuredDocumentsProps) {
  const [isVerified, setIsVerified] = useState(false);
  const [showUnlockPrompt, setShowUnlockPrompt] = useState(true);
  const [password, setPassword] = useState("");
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountPassword, setAccountPassword] = useState("");

  const verifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    setError("");
    try {
      const response = await fetch("/api/auth/verify-secured", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getAuthToken()}` 
        },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        setIsVerified(true);
        setShowUnlockPrompt(true);
        setPassword("");
        fetchSecuredDocs();
      } else {
        const data = await response.json();
        if (data.notSet) {
          setIsSettingPassword(true);
        } else {
          setError(data.error || "Invalid password");
        }
      }
    } catch (err) {
      setError("An error occurred.");
    } finally {
      setVerifying(false);
    }
  };

  const setSecuredPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!accountPassword.trim()) {
      setError("Account password is required");
      return;
    }
    setVerifying(true);
    setError("");
    try {
      const response = await fetch("/api/auth/secured-password", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getAuthToken()}` 
        },
        body: JSON.stringify({ password: newPassword, accountPassword }),
      });

      if (response.ok) {
        setIsSettingPassword(false);
        setIsVerified(true);
        setShowUnlockPrompt(true);
        setAccountPassword("");
        setNewPassword("");
        setConfirmPassword("");
        fetchSecuredDocs();
      } else {
        const data = await response.json();
        setError(data.error || "Failed to set password");
      }
    } catch (err) {
      setError("An error occurred.");
    } finally {
      setVerifying(false);
    }
  };

  const fetchSecuredDocs = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/documents/secured", {
        headers: { "Authorization": `Bearer ${getAuthToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setDocs(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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

  const handleLockVault = () => {
    setIsVerified(false);
    setShowUnlockPrompt(false);
    setPassword("");
    setError("");
  };

  if (!isVerified) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md text-center"
        >
          <div className="bg-indigo-50 dark:bg-indigo-900/30 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
          </div>
          
          {isSettingPassword ? (
            <>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Set Secured Password</h2>
              <p className="text-slate-500 dark:text-slate-400 mb-8">
                First-time setup requires your account password.
              </p>
              <form onSubmit={setSecuredPassword} className="space-y-4">
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={accountPassword}
                    onChange={(e) => setAccountPassword(e.target.value)}
                    placeholder="Account Password"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                  />
                </div>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New Secured Password"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                  />
                </div>
                <div className="relative">
                  <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm Password"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                  />
                </div>
                {error && <p className="text-red-500 text-sm font-bold">{error}</p>}
                <button
                  type="submit"
                  disabled={verifying}
                  className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {verifying ? <Loader2 className="w-5 h-5 animate-spin" /> : "Set & Enter"}
                </button>
              </form>
            </>
          ) : showUnlockPrompt ? (
            <>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Secured Access</h2>
              <p className="text-slate-500 dark:text-slate-400 mb-8">
                Please enter your secured documents password to continue.
              </p>
              <form onSubmit={verifyPassword} className="space-y-4">
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="password"
                    required
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter Secured Password"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                  />
                </div>
                {error && <p className="text-red-500 text-sm font-bold">{error}</p>}
                <button
                  type="submit"
                  disabled={verifying}
                  className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {verifying ? <Loader2 className="w-5 h-5 animate-spin" /> : "Unlock Vault"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Vault Locked</h2>
              <p className="text-slate-500 dark:text-slate-400 mb-8">
                Your secured vault is locked.
              </p>
              <button
                type="button"
                onClick={() => setShowUnlockPrompt(true)}
                className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-all"
              >
                Unlock Vault
              </button>
            </>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Lock className="w-5 h-5 text-indigo-600" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Secured Documents</h1>
          </div>
          <p className="text-slate-500 dark:text-slate-400">Your most sensitive files, protected by extra security.</p>
        </div>
        <button 
          onClick={handleLockVault}
          className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors"
        >
          Lock Vault
        </button>
      </header>

      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-20 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-10 h-10 animate-spin mb-4" />
            <p className="font-medium">Unlocking your vault...</p>
          </div>
        ) : docs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Document Name</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date & Time</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {docs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                          <FileText className="w-5 h-5" />
                        </div>
                        <span className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[240px]">{doc.title}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {doc.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                      {new Date(doc.upload_date).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleDownload(doc)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-all"
                        >
                          <Download className="w-4 h-4" />
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
              <Shield className="w-10 h-10 text-slate-300 dark:text-slate-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">No secured documents</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-2">Your vault is empty. Mark documents as secured during upload.</p>
          </div>
        )}
      </div>
    </div>
  );
}
