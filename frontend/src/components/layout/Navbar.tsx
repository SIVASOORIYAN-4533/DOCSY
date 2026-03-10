import { Bell, Search, Sun, Moon, User as UserIcon } from "lucide-react";
import { User } from "../../types";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface NavbarProps {
  user: User;
}

export default function Navbar({ user }: NavbarProps) {
  const [isDark, setIsDark] = useState(localStorage.getItem("theme") === "dark");
  const [search, setSearch] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/search?q=${encodeURIComponent(search)}`);
      setSearch("");
    }
  };

  const handleNotifications = () => {
    setNotificationMessage("No new notifications right now.");
    window.setTimeout(() => setNotificationMessage(""), 2500);
  };

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 transition-colors">
      <div className="flex-1 max-w-xl">
        <form onSubmit={handleSearch} className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Quick search documents..."
            className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-indigo-500 transition-all dark:text-white"
          />
        </form>
      </div>

      <div className="flex items-center gap-4">
        <button 
          onClick={() => setIsDark(!isDark)}
          className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
        
        <div className="relative">
          <button
            onClick={handleNotifications}
            className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors relative"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></span>
          </button>
          {notificationMessage && (
            <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-3 text-xs text-slate-600 dark:text-slate-300 z-20">
              {notificationMessage}
            </div>
          )}
        </div>

        <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-2"></div>

        <div className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 p-1 rounded-lg transition-colors">
          <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm overflow-hidden">
            {user?.profilePhoto ? (
              <img src={user.profilePhoto} alt={user?.name || "User"} className="w-full h-full object-cover" />
            ) : (
              user?.name?.[0]?.toUpperCase() || "U"
            )}
          </div>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200 hidden sm:block">
            {user?.name || "User"}
          </span>
        </div>
      </div>
    </header>
  );
}
