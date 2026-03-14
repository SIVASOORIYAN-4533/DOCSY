import { NavLink } from "react-router-dom";
import { 
  LayoutDashboard, 
  Upload, 
  Files, 
  Search, 
  Share2, 
  BarChart3, 
  Settings, 
  LogOut,
  Lock,
  ChevronLeft,
  ChevronRight,
  Menu
} from "lucide-react";
import { User } from "../../types";
import { motion, AnimatePresence } from "motion/react";

interface SidebarProps {
  user: User;
  onLogout: () => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

export default function Sidebar({ user, onLogout, isCollapsed, setIsCollapsed }: SidebarProps) {
  const roleLabel = "User";

  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/" },
    { icon: Upload, label: "Upload Document", path: "/upload" },
    { icon: Files, label: "My Documents", path: "/documents" },
    { icon: Lock, label: "Secured Documents", path: "/secured" },
    { icon: Search, label: "Smart Search", path: "/search" },
    { icon: Share2, label: "Shared Files", path: "/shared" },
    { icon: BarChart3, label: "Analytics", path: "/analytics" },
    { icon: Settings, label: "Settings", path: "/settings" },
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
        <div className={`flex items-center ${isCollapsed ? "justify-center" : "gap-3"} px-4 py-3 mb-4`}>
          <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-white shrink-0 overflow-hidden">
            {user?.profilePhoto ? (
              <img src={user.profilePhoto} alt={user?.name || "User"} className="w-full h-full object-cover" />
            ) : (
              user?.name?.[0]?.toUpperCase() || "U"
            )}
          </div>
          {!isCollapsed && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="overflow-hidden"
            >
              <p className="text-sm font-semibold truncate">{user?.name || "User"}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{roleLabel}</p>
            </motion.div>
          )}
        </div>
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
