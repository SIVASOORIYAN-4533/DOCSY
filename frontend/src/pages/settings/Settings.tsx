import { User as UserIcon, Shield, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { User } from "../../types";

interface SettingsProps {
  user: User;
}

export default function Settings({ user }: SettingsProps) {
  const [activeTab, setActiveTab] = useState("profile");
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [profilePhoto, setProfilePhoto] = useState<string | null>(user?.profilePhoto || null);
  const [favouriteTeacher, setFavouriteTeacher] = useState("");

  const [securedPassword, setSecuredPassword] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [oldVaultPassword, setOldVaultPassword] = useState("");
  const [isVaultPasswordSet, setIsVaultPasswordSet] = useState<boolean | null>(
    typeof user?.hasSecuredPassword === "boolean" ? user.hasSecuredPassword : null,
  );

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);

  const inferVaultStatusFromVerifyEndpoint = async (): Promise<boolean> => {
    try {
      const probeResponse = await fetch("/api/auth/verify-secured", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ password: "__vault_status_probe__" }),
      });

      if (probeResponse.status === 404) {
        return false;
      }

      if (probeResponse.status === 401 || probeResponse.ok) {
        return true;
      }
    } catch {
      // Ignore and fall back below.
    }

    return !!user?.hasSecuredPassword;
  };

  const loadVaultStatus = async () => {
    try {
      const response = await fetch("/api/auth/secured-password/status", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      if (!response.ok) {
        setIsVaultPasswordSet(await inferVaultStatusFromVerifyEndpoint());
        return;
      }

      const data = await response.json();
      setIsVaultPasswordSet(!!data.isSet);
    } catch {
      setIsVaultPasswordSet(await inferVaultStatusFromVerifyEndpoint());
    }
  };

  useEffect(() => {
    if (activeTab === "security" && isVaultPasswordSet === null) {
      void loadVaultStatus();
    }
  }, [activeTab, isVaultPasswordSet]);

  useEffect(() => {
    setName(user?.name || "");
    setEmail(user?.email || "");
    setProfilePhoto(user?.profilePhoto || null);
    setFavouriteTeacher("");
    if (typeof user?.hasSecuredPassword === "boolean") {
      setIsVaultPasswordSet(user.hasSecuredPassword);
    }
  }, [user]);

  const handleProfilePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError("Profile photo must be 2MB or smaller.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setProfilePhoto(typeof reader.result === "string" ? reader.result : null);
      setMessage("Profile photo selected. Click Save Changes to apply.");
      setError("");
    };
    reader.onerror = () => {
      setError("Failed to read selected file.");
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setLoading(true);
    setError("");
    setSuccess(false);
    setMessage("");

    try {
      if (activeTab === "security" && isVaultPasswordSet) {
        const verifyResponse = await fetch("/api/auth/verify-secured", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({ password: oldVaultPassword }),
        });

        if (!verifyResponse.ok) {
          const verifyData = await verifyResponse.json().catch(() => ({} as { error?: string }));
          setError(verifyData.error || "Current vault password is incorrect");
          setLoading(false);
          return;
        }
      }

      const endpoint = activeTab === "profile" ? "/api/auth/profile" : "/api/auth/secured-password";
      const body =
        activeTab === "profile"
          ? { name, email, profilePhoto, favouriteTeacher }
          : {
              password: securedPassword,
              oldPassword: isVaultPasswordSet ? oldVaultPassword : undefined,
              accountPassword: isVaultPasswordSet ? undefined : accountPassword,
            };

      const response = await fetch(endpoint, {
        method: activeTab === "profile" ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setSuccess(true);
        if (activeTab === "profile") {
          const updatedUser = { ...user, name, email, profilePhoto };
          localStorage.setItem("user", JSON.stringify(updatedUser));
          window.dispatchEvent(new Event("user-updated"));
          setFavouriteTeacher("");
          setMessage("Profile updated successfully.");
        } else {
          setSecuredPassword("");
          setOldVaultPassword("");
          setAccountPassword("");
          setIsVaultPasswordSet(true);
          const updatedUser = { ...user, hasSecuredPassword: true };
          localStorage.setItem("user", JSON.stringify(updatedUser));
          window.dispatchEvent(new Event("user-updated"));
          setMessage("Secured vault password updated successfully.");
        }
      } else {
        let data: { error?: string } = {};
        try {
          data = await response.json();
        } catch {
          data = {};
        }
        setError(data.error || `Update failed (HTTP ${response.status})`);
      }
    } catch {
      setError("An error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const securitySaveDisabled =
    loading ||
    !securedPassword.trim() ||
    isVaultPasswordSet === null ||
    (isVaultPasswordSet ? !oldVaultPassword.trim() : !accountPassword.trim());

  return (
    <div className="max-w-4xl mx-auto space-y-8 text-slate-900 dark:text-slate-100">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-slate-500 dark:text-slate-400">Manage your account and application preferences.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="space-y-2">
          <button
            onClick={() => setActiveTab("profile")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${
              activeTab === "profile"
                ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300"
                : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/70"
            }`}
          >
            <UserIcon className="w-5 h-5" /> Account Profile
          </button>
          <button
            onClick={() => setActiveTab("security")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${
              activeTab === "security"
                ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300"
                : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/70"
            }`}
          >
            <Shield className="w-5 h-5" /> Security & Vault
          </button>
        </div>

        <div className="md:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-6">
            {activeTab === "profile" ? (
              <>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-4">Account Profile</h2>

                {error && <div className="text-red-600 dark:text-red-300 text-sm font-bold">{error}</div>}
                {success && <div className="text-emerald-600 dark:text-emerald-300 text-sm font-bold">Profile updated!</div>}
                {message && <div className="text-indigo-600 dark:text-indigo-300 text-sm font-semibold">{message}</div>}

                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 flex items-center justify-center text-3xl font-bold">
                    {profilePhoto ? (
                      <img src={profilePhoto} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      name[0]?.toUpperCase() || "U"
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-500 transition-colors"
                    >
                      Change Photo
                    </button>
                    {profilePhoto && (
                      <button
                        type="button"
                        onClick={() => setProfilePhoto(null)}
                        className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleProfilePhotoChange}
                      className="hidden"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Full Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-slate-100 dark:placeholder:text-slate-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-slate-100 dark:placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Update Favourite Teacher</label>
                  <input
                    type="text"
                    value={favouriteTeacher}
                    onChange={(e) => setFavouriteTeacher(e.target.value)}
                    placeholder="Enter a new favourite teacher name"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-slate-100 dark:placeholder:text-slate-400"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Leave empty if you do not want to change your current answer.
                  </p>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-4">Security & Vault</h2>

                {error && <div className="text-red-600 dark:text-red-300 text-sm font-bold">{error}</div>}
                {success && <div className="text-emerald-600 dark:text-emerald-300 text-sm font-bold">Security updated!</div>}
                {message && <div className="text-indigo-600 dark:text-indigo-300 text-sm font-semibold">{message}</div>}

                <div className="space-y-4">
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/60 rounded-2xl">
                    <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                      {isVaultPasswordSet
                        ? "To change vault password, enter your current vault password first."
                        : "First-time vault setup requires your account password."}
                    </p>
                  </div>

                  {isVaultPasswordSet === null ? (
                    <div className="text-sm text-slate-500 dark:text-slate-400">Loading vault status...</div>
                  ) : isVaultPasswordSet ? (
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Current Vault Password</label>
                      <input
                        type="password"
                        value={oldVaultPassword}
                        onChange={(e) => setOldVaultPassword(e.target.value)}
                        placeholder="Enter current vault password"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-slate-100 dark:placeholder:text-slate-400"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Account Password</label>
                      <input
                        type="password"
                        value={accountPassword}
                        onChange={(e) => setAccountPassword(e.target.value)}
                        placeholder="Enter account password"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-slate-100 dark:placeholder:text-slate-400"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">New Secured Password</label>
                    <input
                      type="password"
                      value={securedPassword}
                      onChange={(e) => setSecuredPassword(e.target.value)}
                      placeholder="Enter new vault password"
                      minLength={6}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-slate-100 dark:placeholder:text-slate-400"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button
                className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500 transition-colors disabled:opacity-50 flex items-center gap-2"
                onClick={handleSave}
                disabled={activeTab === "security" ? securitySaveDisabled : loading}
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
