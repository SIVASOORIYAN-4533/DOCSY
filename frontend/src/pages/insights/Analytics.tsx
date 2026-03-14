import { BarChart3, TrendingUp, PieChart, Activity, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useState, useEffect } from "react";
import { Document } from "../../types";
import { getAuthToken } from "../../utils/authStorage";

export default function Analytics() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/documents", {
      headers: { "Authorization": `Bearer ${getAuthToken()}` }
    })
    .then(res => res.json())
    .then(data => {
      setDocs(data);
      setLoading(false);
    });
  }, []);

  const categoryCounts = docs.reduce((acc: any, doc) => {
    acc[doc.category || "General"] = (acc[doc.category || "General"] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-8 text-slate-900 dark:text-slate-100">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Analytics</h1>
        <p className="text-slate-500 dark:text-slate-400">Insights into your document management activity.</p>
      </header>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-600 dark:text-indigo-300 w-10 h-10" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col items-center text-center"
          >
            <div className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 p-4 rounded-2xl mb-4">
              <Activity className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100">Total Documents</h3>
            <p className="text-3xl font-bold text-indigo-600 mt-2">{docs.length}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col items-center text-center"
          >
            <div className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 p-4 rounded-2xl mb-4">
              <TrendingUp className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100">Storage Used</h3>
            <p className="text-3xl font-bold text-indigo-600 mt-2">
              {(docs.reduce((acc, d) => acc + d.size, 0) / (1024 * 1024)).toFixed(2)} MB
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col items-center text-center"
          >
            <div className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 p-4 rounded-2xl mb-4">
              <PieChart className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100">Top Category</h3>
            <p className="text-3xl font-bold text-indigo-600 mt-2">
              {Object.entries(categoryCounts).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || "None"}
            </p>
          </motion.div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm text-center">
        <BarChart3 className="w-16 h-16 text-slate-200 dark:text-slate-700 mx-auto mb-6" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Advanced Reports</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto">
          We're building a powerful analytics engine to help you understand your document workflows better.
        </p>
      </div>
    </div>
  );
}
