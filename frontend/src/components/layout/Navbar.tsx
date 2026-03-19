import { Bell, Search, Sun, Moon } from "lucide-react";
import { NotificationItem, User } from "../../types";
import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthToken } from "../../utils/authStorage";
import { buildApiUrl } from "../../utils/api";

interface NavbarProps {
  user: User;
}

export default function Navbar({ user }: NavbarProps) {
  const [isDark, setIsDark] = useState(localStorage.getItem("theme") === "dark");
  const [search, setSearch] = useState("");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const navigate = useNavigate();
  const token = getAuthToken();
  const notificationPanelRef = useRef<HTMLDivElement | null>(null);

  const notificationCountText = useMemo(() => {
    if (unreadCount <= 0) {
      return "";
    }
    if (unreadCount > 99) {
      return "99+";
    }
    return String(unreadCount);
  }, [unreadCount]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  const loadNotifications = async () => {
    if (!token) {
      return;
    }

    setIsLoadingNotifications(true);
    try {
      const response = await fetch("/api/notifications?limit=25", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Unable to load notifications");
      }

      const items = Array.isArray(data?.items) ? (data.items as NotificationItem[]) : [];
      const unreadItems = items.filter((item) => !item.is_read);
      setNotifications(unreadItems);
      setUnreadCount(unreadItems.length);
    } catch (error) {
      console.error("Failed to load notifications:", error);
    } finally {
      setIsLoadingNotifications(false);
    }
  };

  const markSingleAsRead = async (notificationId: number) => {
    if (!token) {
      return;
    }

    try {
      await fetch(`/api/notifications/${notificationId}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, [user.id]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const streamUrl = buildApiUrl(`/api/notifications/stream?token=${encodeURIComponent(token)}`);
    const eventSource = new EventSource(streamUrl);

    const onCreated = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data || "{}");
        const notification = parsed?.notification as NotificationItem | undefined;
        if (!notification || typeof notification.id !== "number") {
          return;
        }

        let inserted = false;
        setNotifications((current) => {
          if (current.some((item) => item.id === notification.id)) {
            return current;
          }
          inserted = true;
          return [notification, ...current].slice(0, 50);
        });
        if (!notification.is_read && inserted) {
          setUnreadCount((count) => count + 1);
        }

        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          const browserNotification = new Notification("SMARTDOC", {
            body: notification.message,
            tag: `smartdoc-notification-${notification.id}`,
          });
          browserNotification.onclick = () => {
            window.focus();
            navigate(notification.link || "/shared");
          };
        }
      } catch (error) {
        console.error("Failed to process realtime notification:", error);
      }
    };

    eventSource.addEventListener("notification.created", onCreated as EventListener);
    eventSource.onerror = () => {
      // EventSource retries automatically.
    };

    return () => {
      eventSource.removeEventListener("notification.created", onCreated as EventListener);
      eventSource.close();
    };
  }, [token, navigate]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!notificationPanelRef.current) {
        return;
      }
      if (!notificationPanelRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocumentClick);
    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/search?q=${encodeURIComponent(search)}`);
      setSearch("");
    }
  };

  const handleNotifications = () => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission().catch(() => undefined);
    }
    setIsNotificationsOpen((current) => !current);
  };

  const handleNotificationClick = (item: NotificationItem) => {
    setIsNotificationsOpen(false);
    navigate(item.link || "/shared");
  };

  const handleMarkAsRead = (item: NotificationItem) => {
    setNotifications((current) => current.filter((existing) => existing.id !== item.id));
    setUnreadCount((count) => Math.max(0, count - 1));
    void markSingleAsRead(item.id);
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
        
        <div ref={notificationPanelRef} className="relative">
          <button
            onClick={handleNotifications}
            className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors relative"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center font-bold border border-white dark:border-slate-900">
                {notificationCountText}
              </span>
            ) : null}
          </button>
          {isNotificationsOpen && (
            <div className="absolute right-0 mt-2 w-96 max-w-[90vw] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-lg z-20 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Notifications</p>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {isLoadingNotifications ? (
                  <div className="px-4 py-6 text-xs text-slate-500 dark:text-slate-300">Loading notifications...</div>
                ) : notifications.length === 0 ? (
                  <div className="px-4 py-6 text-xs text-slate-500 dark:text-slate-300">No notifications yet.</div>
                ) : (
                  notifications.map((item) => (
                    <div
                      key={item.id}
                      className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 last:border-b-0 bg-indigo-50/70 dark:bg-indigo-900/20"
                    >
                      <button
                        type="button"
                        onClick={() => handleNotificationClick(item)}
                        className="w-full text-left hover:opacity-90 transition-opacity"
                      >
                        <p className="text-sm text-slate-700 dark:text-slate-200">{item.message}</p>
                        <p className="text-[11px] mt-1 text-slate-500 dark:text-slate-400">
                          {new Date(item.created_at).toLocaleString()}
                        </p>
                      </button>
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleMarkAsRead(item)}
                          className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:underline"
                        >
                          Mark as read
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
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
