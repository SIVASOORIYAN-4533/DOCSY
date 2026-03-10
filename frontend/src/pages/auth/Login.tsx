import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, FileText, Chrome, Github, ArrowLeft, GraduationCap } from "lucide-react";
import { User } from "../../types";
import { motion } from "motion/react";

interface LoginProps {
  onLogin: (user: User, token: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [forgotQuestion, setForgotQuestion] = useState("");
  const [forgotTeacherAnswer, setForgotTeacherAnswer] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const navigate = useNavigate();

  const parseJsonSafe = async (response: Response): Promise<Record<string, any>> => {
    const raw = await response.text();
    if (!raw) {
      return {};
    }

    try {
      return JSON.parse(raw) as Record<string, any>;
    } catch {
      return { error: raw.includes("<!doctype") ? "Server returned invalid response." : raw };
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("oauth_error");
    if (oauthError) {
      setError(oauthError);
      params.delete("oauth_error");
      const query = params.toString();
      window.history.replaceState({}, "", query ? `/login?${query}` : "/login");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await parseJsonSafe(response);
      if (response.ok) {
        onLogin(data.user, data.token);
        navigate("/");
      } else {
        setError(data.error || "Login failed");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotQuestion = async () => {
    if (!email) {
      setError("Please enter your email first");
      return;
    }

    setError("");
    setInfo("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await parseJsonSafe(response);

      if (!response.ok) {
        setError(data.error || "Unable to load security question.");
        return;
      }

      setForgotQuestion(typeof data.question === "string" ? data.question : "Who is your favourite teacher?");
      setInfo("Answer the security question to set a new password.");
    } catch {
      setError("Unable to load security question.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotQuestion) {
      setError("Get the security question first");
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setError("New password and confirm password do not match");
      return;
    }

    const passwordRegex = /^(?=.*[0-9])(?=.*[!@#$%^&*])[a-zA-Z0-9!@#$%^&*]{8,}$/;
    if (!passwordRegex.test(forgotNewPassword)) {
      setError("Password must be 8+ chars, with 1 number and 1 special char");
      return;
    }

    setLoading(true);
    setError("");
    setInfo("");

    try {
      const response = await fetch("/api/auth/forgot-password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          favouriteTeacher: forgotTeacherAnswer,
          newPassword: forgotNewPassword,
        }),
      });

      const data = await parseJsonSafe(response);
      if (response.ok) {
        setInfo("Password updated successfully. You can now login.");
        setForgotQuestion("");
        setForgotTeacherAnswer("");
        setForgotNewPassword("");
        setForgotConfirmPassword("");
        setIsForgotMode(false);
      } else {
        setError(data.error || `Password reset failed (HTTP ${response.status})`);
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-slate-900 to-purple-900 flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="bg-indigo-600 p-3 rounded-2xl mb-4 shadow-lg shadow-indigo-500/30">
              <FileText className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">DOCSY</h1>
            <p className="text-indigo-200 mt-2 font-medium">Manage your documents intelligently</p>
          </div>

          <form onSubmit={isForgotMode ? handleForgotReset : handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-sm text-center">
                {error}
              </div>
            )}
            {info && (
              <div className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 p-3 rounded-xl text-sm text-center">
                {info}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-semibold text-indigo-100 ml-1">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-300 group-focus-within:text-white transition-colors" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-white placeholder:text-indigo-300/50 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                />
              </div>
            </div>

            {!isForgotMode && (
              <div className="space-y-2">
                <label className="text-sm font-semibold text-indigo-100 ml-1">Password</label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-300 group-focus-within:text-white transition-colors" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-12 text-white placeholder:text-indigo-300/50 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-300 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            )}

            {isForgotMode && !forgotQuestion && (
              <button
                type="button"
                onClick={handleForgotQuestion}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-2xl shadow-lg shadow-indigo-600/30 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
                disabled={loading}
              >
                {loading ? "Loading Question..." : "Show Security Question"}
              </button>
            )}

            {isForgotMode && !!forgotQuestion && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-indigo-100 ml-1">{forgotQuestion}</label>
                  <div className="relative group">
                    <GraduationCap className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-300 group-focus-within:text-white transition-colors" />
                    <input
                      type="text"
                      required
                      value={forgotTeacherAnswer}
                      onChange={(e) => setForgotTeacherAnswer(e.target.value)}
                      placeholder="Enter your answer"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-white placeholder:text-indigo-300/50 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-indigo-100 ml-1">Set New Password</label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-300 group-focus-within:text-white transition-colors" />
                    <input
                      type="password"
                      required
                      value={forgotNewPassword}
                      onChange={(e) => setForgotNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-white placeholder:text-indigo-300/50 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-indigo-100 ml-1">Confirm New Password</label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-300 group-focus-within:text-white transition-colors" />
                    <input
                      type="password"
                      required
                      value={forgotConfirmPassword}
                      onChange={(e) => setForgotConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-white placeholder:text-indigo-300/50 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                    />
                  </div>
                </div>
              </>
            )}

            {!isForgotMode && (
              <div className="flex items-center justify-between text-sm px-1">
                <label className="flex items-center gap-2 text-indigo-200 cursor-pointer">
                  <input type="checkbox" className="rounded border-white/10 bg-white/5 text-indigo-600 focus:ring-indigo-500" />
                  <span>Remember me</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotMode(true);
                    setForgotQuestion("");
                    setForgotTeacherAnswer("");
                    setForgotNewPassword("");
                    setForgotConfirmPassword("");
                    setError("");
                    setInfo("");
                  }}
                  className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            {isForgotMode && (
              <button
                type="button"
                onClick={() => {
                  setIsForgotMode(false);
                  setForgotQuestion("");
                  setForgotTeacherAnswer("");
                  setForgotNewPassword("");
                  setForgotConfirmPassword("");
                  setError("");
                  setInfo("");
                }}
                className="inline-flex items-center gap-2 text-indigo-300 hover:text-white transition-colors text-sm font-medium"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </button>
            )}

            {(!isForgotMode || !!forgotQuestion) && (
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-2xl shadow-lg shadow-indigo-600/30 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
              >
                {isForgotMode ? (loading ? "Updating..." : "Update Password") : (loading ? "Signing in..." : "Login")}
              </button>
            )}
          </form>

          {!isForgotMode && <div className="mt-8">
            <div className="relative flex items-center justify-center mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <span className="relative px-4 bg-transparent text-xs text-indigo-300 uppercase tracking-widest font-bold">Or continue with</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => { window.location.href = "/api/auth/google"; }}
                className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl py-3 text-white transition-all active:scale-[0.98]"
              >
                <Chrome className="w-5 h-5" />
                <span className="text-sm font-medium">Google</span>
              </button>
              <button
                type="button"
                onClick={() => { window.location.href = "/api/auth/github"; }}
                className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl py-3 text-white transition-all active:scale-[0.98]"
              >
                <Github className="w-5 h-5" />
                <span className="text-sm font-medium">GitHub</span>
              </button>
            </div>
          </div>}

          <p className="mt-8 text-center text-indigo-200 text-sm">
            Don't have an account?{" "}
            <Link to="/register" className="text-indigo-400 hover:text-indigo-300 font-bold transition-colors">Create Account</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
