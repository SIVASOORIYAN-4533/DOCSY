import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { 
  LayoutDashboard, 
  Upload, 
  Files, 
  MessageSquare, 
  Share2, 
  BarChart3, 
  User as ProfileIcon, 
  LogOut,
  Lock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { User } from "../../types";
import { motion } from "motion/react";
import { getAuthToken } from "../../utils/authStorage";

interface SidebarProps {
  user: User;
  onLogout: () => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

export default function Sidebar({ user, onLogout, isCollapsed, setIsCollapsed }: SidebarProps) {
  const [chatbotName, setChatbotName] = useState("Agastiya");

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

        const data = (await response.json().catch(() => ({}))) as { name?: string };
        const resolvedName = String(data.name || "").trim() || "Agastiya";
        if (!active) {
          return;
        }

        setChatbotName(resolvedName);
      } catch {
        // Keep default sidebar label when request fails.
      }
    };

    const handleNameUpdated = () => {
      void loadChatbotName();
    };

    void loadChatbotName();
    window.addEventListener("chatbot-name-updated", handleNameUpdated);
    return () => {
      active = false;
      window.removeEventListener("chatbot-name-updated", handleNameUpdated);
    };
  }, [user?.id]);

  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/" },
    { icon: Upload, label: "Upload Document", path: "/upload" },
    { icon: Files, label: "My Documents", path: "/documents" },
    { icon: Lock, label: "Secured Documents", path: "/secured" },
    { icon: MessageSquare, label: `Chat with ${chatbotName}`, path: "/search" },
    { icon: Share2, label: "Shared Files", path: "/shared" },
    { icon: BarChart3, label: "Analytics", path: "/analytics" },
    { icon: ProfileIcon, label: "Profile", path: "/settings" },
  ];

  return (
    <aside
      className={`${isCollapsed ? "w-20" : "w-64"} bg-white dark:bg-slate-900 text-slate-700 dark:text-white border-r border-slate-200 dark:border-slate-800 flex flex-col h-full transition-all duration-300 relative`}
    >
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-20 bg-indigo-600 text-white p-1 rounded-full border-2 border-white dark:border-slate-950 shadow-lg z-50 hover:bg-indigo-500 transition-colors"
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      <div className={`p-6 flex items-center ${isCollapsed ? "justify-center" : "gap-3"} border-b border-slate-200 dark:border-slate-800`}>
        <div className="bg-indigo-600 p-2 rounded-full shrink-0 overflow-hidden">
          <img src="/docsylogo-mark.png" alt="DOCSY logo" className="w-6 h-6 object-cover rounded-full" />
        </div>
        {!isCollapsed && (
          <motion.h1 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-xl font-bold tracking-tight whitespace-nowrap"
          >
            DOCSY
          </motion.h1>
        )}
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            title={isCollapsed ? item.label : ""}
            className={({ isActive }) =>
              `flex items-center ${isCollapsed ? "justify-center" : "gap-3"} px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              }`
            }
          >
            <item.icon className="w-5 h-5 shrink-0" />
            {!isCollapsed && (
              <motion.span 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="font-medium whitespace-nowrap"
              >
                {item.label}
              </motion.span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800">
        <button
          onClick={onLogout}
          title={isCollapsed ? "Logout" : ""}
          className={`flex items-center ${isCollapsed ? "justify-center" : "gap-3"} px-4 py-3 w-full text-left text-slate-600 dark:text-slate-400 hover:bg-red-500/10 hover:text-red-500 rounded-xl transition-colors`}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!isCollapsed && (
            <motion.span 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="font-medium whitespace-nowrap"
            >
              Logout
            </motion.span>
          )}
        </button>
      </div>
    </aside>
  );
}
