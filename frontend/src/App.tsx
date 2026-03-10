/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthState, User } from "./types";
import {
  Login,
  Register,
  Dashboard,
  MyDocuments,
  SecuredDocuments,
  Upload,
  SmartSearch,
  Analytics,
  SharedFiles,
  Settings,
} from "./pages";
import Layout from "./components/layout";

export default function App() {
  const loadAuthFromStorage = (): AuthState => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    let user = null;
    try {
      user = storedUser ? JSON.parse(storedUser) : null;
    } catch (e) {
      console.error("Failed to parse stored user", e);
    }
    return {
      user,
      token,
      isAuthenticated: !!(token && user),
    };
  };

  const [auth, setAuth] = useState<AuthState>(() => {
    return loadAuthFromStorage();
  });

  useEffect(() => {
    const syncAuthState = () => {
      setAuth(loadAuthFromStorage());
    };

    window.addEventListener("storage", syncAuthState);
    window.addEventListener("user-updated", syncAuthState as EventListener);

    return () => {
      window.removeEventListener("storage", syncAuthState);
      window.removeEventListener("user-updated", syncAuthState as EventListener);
    };
  }, []);

  const handleLogin = (user: User, token: string) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    setAuth({ user, token, isAuthenticated: true });
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setAuth({ user: null, token: null, isAuthenticated: false });
  };

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={
            !auth.isAuthenticated ? (
              <Login onLogin={handleLogin} />
            ) : (
              <Navigate to="/" />
            )
          }
        />
        <Route
          path="/register"
          element={
            !auth.isAuthenticated ? (
              <Register />
            ) : (
              <Navigate to="/" />
            )
          }
        />
        <Route
          path="/"
          element={
            auth.isAuthenticated ? (
              <Layout user={auth.user!} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" />
            )
          }
        >
          <Route index element={<Dashboard user={auth.user!} />} />
          <Route path="documents" element={<MyDocuments user={auth.user!} />} />
          <Route path="secured" element={<SecuredDocuments user={auth.user!} />} />
          <Route path="upload" element={<Upload user={auth.user!} />} />
          <Route path="search" element={<SmartSearch user={auth.user!} />} />
          <Route path="shared" element={<SharedFiles user={auth.user!} />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<Settings user={auth.user!} />} />
        </Route>
      </Routes>
    </Router>
  );
}
