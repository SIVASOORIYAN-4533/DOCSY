import { useState, useEffect } from "react";
import { 
  Files, 
  Upload, 
  MessageSquare,
  Share2, 
  Clock, 
  CheckCircle2, 
  TrendingUp,
  ArrowRight
} from "lucide-react";
import { User, Document } from "../../types";
import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { getAuthToken } from "../../utils/authStorage";

interface DashboardProps {
  user: User;
}

export default function Dashboard({ user }: DashboardProps) {
  const [chatbotName, setChatbotName] = useState("Agastiya");
  const [stats, setStats] = useState({
    total: 0,
    recent: 0,
    shared: 0,
    storage: "0 MB"
  });
  const [recentDocs, setRecentDocs] = useState<Document[]>([]);

  useEffect(() => {
    fetchDocs();
  }, []);

  useEffect(() => {
    let active = true;

    const loadChatbotName = async () => {
      try {
        const response = await fetch("/api/chat/name", {
          headers: { "Authorization": `Bearer ${getAuthToken()}` },
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json().catch(() => ({}))) as { name?: string };
        if (!active) {
          return;
        }

        const resolvedName = String(data.name || "").trim() || "Agastiya";
        setChatbotName(resolvedName);
      } catch {
        // Keep fallback name if request fails.
      }
    };

    void loadChatbotName();
    return () => {
      active = false;
    };
  }, [user.id]);

  const fetchDocs = async () => {
    try {
      const response = await fetch("/api/documents", {
        headers: { "Authorization": `Bearer ${getAuthToken()}` }
      });
      if (response.ok) {
        const data: Document[] = await response.json();
        setRecentDocs(data.slice(0, 5));
        
        const totalSize = data.reduce((acc, doc) => acc + doc.size, 0);
        const storageStr = totalSize > 1024 * 1024 
          ? `${(totalSize / (1024 * 1024)).toFixed(1)} MB` 
          : `${(totalSize / 1024).toFixed(1)} KB`;

        // Count shared (where uploaded_by is not current user)
        const sharedCount = data.filter(d => d.user_id !== user.id).length;
        
        // Recent (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const recentCount = data.filter(d => new Date(d.upload_date) > sevenDaysAgo).length;

        setStats({
          total: data.length,
          recent: recentCount,
          shared: sharedCount,
          storage: storageStr
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const statCards = [
    { label: "Total Documents", value: stats.total, icon: Files, color: "bg-blue-500", trend: "+12% this month" },
    { label: "Recently Uploaded", value: stats.recent, icon: Clock, color: "bg-amber-500", trend: "Last 7 days" },
    { label: "Shared Files", value: stats.shared, icon: Share2, color: "bg-indigo-500", trend: "3 active links" },
    { label: "Storage Used", value: stats.storage, icon: TrendingUp, color: "bg-emerald-500", trend: "of 5 GB limit" },
  ];

  return (
    <div className="space-y-8 text-slate-900 dark:text-slate-100">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Welcome back, {user?.name || "User"}!</h1>
        <p className="text-slate-500 dark:text-slate-400">Here's what's happening with your documents today.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`${stat.color} p-3 rounded-xl text-white shadow-lg shadow-${stat.color.split('-')[1]}-500/20`}>
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
            <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium">{stat.label}</h3>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stat.value}</span>
              <span className="text-xs font-medium text-slate-400 dark:text-slate-500">{stat.trend}</span>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Recent Documents</h2>
            <Link to="/documents" className="text-sm font-semibold text-indigo-600 hover:text-indigo-500 flex items-center gap-1">
              View All <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
            {recentDocs.length > 0 ? (
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentDocs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-lg">
                            <Files className="w-4 h-4" />
                          </div>
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[200px]">{doc.title}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {doc.category || "Uncategorized"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                        {new Date(doc.upload_date).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-emerald-600">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-xs font-bold">Processed</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
                <div className="p-12 text-center">
                  <div className="bg-slate-50 dark:bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Files className="w-8 h-8 text-slate-300 dark:text-slate-500" />
                  </div>
                  <h3 className="text-slate-900 dark:text-slate-100 font-bold">No documents yet</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Start by uploading your first document.</p>
                  <Link to="/upload" className="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-2 rounded-xl mt-6 font-bold hover:bg-indigo-500 transition-colors">
                    <Upload className="w-4 h-4" /> Upload Now
                  </Link>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Quick Actions</h2>
          <div className="grid grid-cols-1 gap-4">
            <Link to="/upload" className="group bg-indigo-600 p-6 rounded-2xl text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 transition-all">
              <Upload className="w-8 h-8 mb-4 group-hover:scale-110 transition-transform" />
              <h3 className="font-bold text-lg">Upload Document</h3>
              <p className="text-indigo-100 text-sm mt-1">Drag and drop or browse files to add them to your library.</p>
            </Link>
            
            <Link to="/search" className="group bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-all">
              <MessageSquare className="w-8 h-8 mb-4 text-indigo-600 dark:text-indigo-300 group-hover:scale-110 transition-transform" />
              <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">Chat with {chatbotName}</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Ask questions or upload files for summaries and topic-based answers.</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
