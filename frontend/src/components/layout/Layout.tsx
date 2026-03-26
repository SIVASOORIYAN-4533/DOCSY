import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { User } from "../../types";
import { useEffect, useState } from "react";

interface LayoutProps {
  user: User;
  onLogout: () => void;
}

export default function Layout({ user, onLogout }: LayoutProps) {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window === "undefined" || window.matchMedia("(min-width: 1024px)").matches,
  );
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const syncLayout = (matches: boolean) => {
      setIsDesktop(matches);
      if (matches) {
        setIsMobileSidebarOpen(false);
      }
    };

    syncLayout(mediaQuery.matches);
    const handleChange = (event: MediaQueryListEvent) => syncLayout(event.matches);

    mediaQuery.addEventListener("change", handleChange);
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  const handleMenuToggle = () => {
    if (isDesktop) {
      setIsCollapsed((previous) => !previous);
      return;
    }

    setIsMobileSidebarOpen((previous) => !previous);
  };

  return (
    <div className="relative flex h-dvh min-h-0 bg-slate-50 dark:bg-slate-950 overflow-hidden transition-colors">
      {!isDesktop && isMobileSidebarOpen ? (
        <button
          type="button"
          className="absolute inset-0 z-40 bg-slate-900/50 backdrop-blur-[1px]"
          onClick={() => setIsMobileSidebarOpen(false)}
          aria-label="Close navigation menu"
        />
      ) : null}
      <Sidebar
        user={user}
        onLogout={onLogout}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        isDesktop={isDesktop}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Navbar user={user} onMenuToggle={handleMenuToggle} />
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
