import { Loader2, ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { User } from "../../types";
import { getAuthToken, updateStoredUser } from "../../utils/authStorage";

interface SettingsProps {
  user: User;
}

type SettingsTab = "profile" | "security";
const DEFAULT_CHATBOT_NAME = "Agastiya";
const MAX_CHATBOT_NAME_LENGTH = 40;

const normalizeChatbotNameInput = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

const resolveTab = (search: string): SettingsTab => {
  const tab = new URLSearchParams(search).get("tab");
  return tab === "security" ? "security" : "profile";
};

export default function Settings({ user }: SettingsProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<SettingsTab>(() => resolveTab(location.search));
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showFavouriteTeacherEditor, setShowFavouriteTeacherEditor] = useState(false);

  const [profileName, setProfileName] = useState(user?.name || "");
  const [profileEmail, setProfileEmail] = useState(user?.email || "");
  const [profilePhone, setProfilePhone] = useState(user?.phone || "");
  const [profilePhoto, setProfilePhoto] = useState<string | null>(user?.profilePhoto || null);
  const [favouriteTeacher, setFavouriteTeacher] = useState("");
  const [chatbotName, setChatbotName] = useState(DEFAULT_CHATBOT_NAME);
  const [chatbotNameDraft, setChatbotNameDraft] = useState(DEFAULT_CHATBOT_NAME);
  const [chatbotLoading, setChatbotLoading] = useState(false);
  const [chatbotSaving, setChatbotSaving] = useState(false);
  const [chatbotMessage, setChatbotMessage] = useState("");
  const [chatbotError, setChatbotError] = useState("");

  const [securedPassword, setSecuredPassword] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [oldVaultPassword, setOldVaultPassword] = useState("");
  const [isVaultPasswordSet, setIsVaultPasswordSet] = useState<boolean | null>(
    typeof user?.hasSecuredPassword === "boolean" ? user.hasSecuredPassword : null,
  );

  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityMessage, setSecurityMessage] = useState("");
  const [securityError, setSecurityError] = useState("");

  const photoInputRef = useRef<HTMLInputElement>(null);

  const switchTab = (tab: SettingsTab) => {
    setActiveTab(tab);
    navigate(`/settings?tab=${tab}`, { replace: true });
  };

  const inferVaultStatusFromVerifyEndpoint = async (): Promise<boolean> => {
    try {
      const probeResponse = await fetch("/api/auth/verify-secured", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
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
        headers: { Authorization: `Bearer ${getAuthToken()}` },
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
    setActiveTab(resolveTab(location.search));
  }, [location.search]);

  useEffect(() => {
    if (activeTab === "security" && isVaultPasswordSet === null) {
      void loadVaultStatus();
    }
  }, [activeTab, isVaultPasswordSet]);

  useEffect(() => {
    setProfileName(user?.name || "");
    setProfileEmail(user?.email || "");
    setProfilePhone(user?.phone || "");
    setProfilePhoto(user?.profilePhoto || null);
    setFavouriteTeacher("");
    setIsEditingProfile(false);
    setShowFavouriteTeacherEditor(false);
    setProfileError("");
    setProfileMessage("");
    setSecurityError("");
    setSecurityMessage("");
    setChatbotError("");
    setChatbotMessage("");
    if (typeof user?.hasSecuredPassword === "boolean") {
      setIsVaultPasswordSet(user.hasSecuredPassword);
    }
  }, [user]);

  useEffect(() => {
    let active = true;

    const loadChatbotName = async () => {
      setChatbotLoading(true);
      try {
        const response = await fetch("/api/chat/name", {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json().catch(() => ({}))) as { name?: string };
        const resolvedName = normalizeChatbotNameInput(data.name || "") || DEFAULT_CHATBOT_NAME;
        if (!active) {
          return;
        }

        setChatbotName(resolvedName);
        setChatbotNameDraft(resolvedName);
      } catch {
        // Keep default/fallback chatbot name when request fails.
      } finally {
        if (active) {
          setChatbotLoading(false);
        }
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

  const handleProfilePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setProfileError("Please choose an image file.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setProfileError("Profile photo must be 2MB or smaller.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setProfilePhoto(typeof reader.result === "string" ? reader.result : null);
      setProfileMessage("Profile photo selected.");
      setProfileError("");
    };
    reader.onerror = () => {
      setProfileError("Failed to read selected file.");
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    setProfileLoading(true);
    setProfileError("");
    setProfileMessage("");

    try {
      const normalizedName = profileName.trim();
      const normalizedEmail = profileEmail.trim();
      const normalizedPhone = profilePhone.trim();

      if (!normalizedName || !normalizedEmail) {
        setProfileError("Name and email are required.");
        setProfileLoading(false);
        return;
      }

      const response = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          name: normalizedName,
          email: normalizedEmail,
          phone: normalizedPhone,
          profilePhoto,
          favouriteTeacher: favouriteTeacher.trim() || undefined,
        }),
      });

      if (response.ok) {
        const data = (await response.json().catch(() => ({}))) as { user?: User };
        const updatedUser = data.user
          ? { ...user, ...data.user }
          : {
              ...user,
              name: normalizedName,
              email: normalizedEmail,
              phone: normalizedPhone || null,
              profilePhoto,
            };
        updateStoredUser(updatedUser);
        window.dispatchEvent(new Event("user-updated"));
        setProfileName(updatedUser.name || normalizedName);
        setProfileEmail(updatedUser.email || normalizedEmail);
        setProfilePhone(updatedUser.phone || "");
        setProfilePhoto(updatedUser.profilePhoto ?? null);
        setFavouriteTeacher("");
        setShowFavouriteTeacherEditor(false);
        setIsEditingProfile(false);
        setProfileMessage("Profile updated successfully.");
      } else {
        let data: { error?: string } = {};
        try {
          data = await response.json();
        } catch {
          data = {};
        }
        setProfileError(data.error || `Update failed (HTTP ${response.status})`);
      }
    } catch {
      setProfileError("An error occurred.");
    } finally {
      setProfileLoading(false);
    }
  };

  const handleSaveSecurity = async () => {
    setSecurityLoading(true);
    setSecurityError("");
    setSecurityMessage("");

    try {
      if (isVaultPasswordSet) {
        const verifyResponse = await fetch("/api/auth/verify-secured", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAuthToken()}`,
          },
          body: JSON.stringify({ password: oldVaultPassword }),
        });

        if (!verifyResponse.ok) {
          const verifyData = await verifyResponse.json().catch(() => ({} as { error?: string }));
          setSecurityError(verifyData.error || "Current vault password is incorrect");
          setSecurityLoading(false);
          return;
        }
      }

      const response = await fetch("/api/auth/secured-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          password: securedPassword,
          oldPassword: isVaultPasswordSet ? oldVaultPassword : undefined,
          accountPassword: isVaultPasswordSet ? undefined : accountPassword,
        }),
      });

      if (response.ok) {
        setSecuredPassword("");
        setOldVaultPassword("");
        setAccountPassword("");
        setIsVaultPasswordSet(true);
        const updatedUser = { ...user, hasSecuredPassword: true };
        updateStoredUser(updatedUser);
        window.dispatchEvent(new Event("user-updated"));
        setSecurityMessage("Secured vault password updated successfully.");
      } else {
        let data: { error?: string } = {};
        try {
          data = await response.json();
        } catch {
          data = {};
        }
        setSecurityError(data.error || `Update failed (HTTP ${response.status})`);
      }
    } catch {
      setSecurityError("An error occurred.");
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleSaveChatbotName = async () => {
    const normalizedName = normalizeChatbotNameInput(chatbotNameDraft);

    setChatbotError("");
    setChatbotMessage("");

    if (!normalizedName) {
      setChatbotError("Chatbot name is required.");
      return;
    }

    if (normalizedName.length > MAX_CHATBOT_NAME_LENGTH) {
      setChatbotError(`Chatbot name must be ${MAX_CHATBOT_NAME_LENGTH} characters or less.`);
      return;
    }

    setChatbotSaving(true);
    try {
      const response = await fetch("/api/chat/name", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ name: normalizedName }),
      });

      const data = (await response.json().catch(() => ({}))) as { name?: string; error?: string };
      if (!response.ok) {
        setChatbotError(data.error || `Rename failed (HTTP ${response.status})`);
        return;
      }

      const savedName = normalizeChatbotNameInput(data.name || normalizedName) || DEFAULT_CHATBOT_NAME;
      setChatbotName(savedName);
      setChatbotNameDraft(savedName);
      setChatbotMessage("Chatbot name updated successfully.");
      window.dispatchEvent(new Event("chatbot-name-updated"));
    } catch {
      setChatbotError("An error occurred while renaming the chatbot.");
    } finally {
      setChatbotSaving(false);
    }
  };

  const resetProfileEditing = () => {
    setProfileName(user?.name || "");
    setProfileEmail(user?.email || "");
    setProfilePhone(user?.phone || "");
    setProfilePhoto(user?.profilePhoto || null);
    setFavouriteTeacher("");
    setShowFavouriteTeacherEditor(false);
    setIsEditingProfile(false);
    setProfileError("");
    setProfileMessage("");
  };

  const hasProfileChanges =
    profileName.trim() !== (user?.name || "").trim() ||
    profileEmail.trim() !== (user?.email || "").trim() ||
    profilePhone.trim() !== (user?.phone || "").trim() ||
    profilePhoto !== (user?.profilePhoto || null) ||
    favouriteTeacher.trim().length > 0;

  const securitySaveDisabled =
    securityLoading ||
    !securedPassword.trim() ||
    isVaultPasswordSet === null ||
    (isVaultPasswordSet ? !oldVaultPassword.trim() : !accountPassword.trim());
  const normalizedChatbotNameDraft = normalizeChatbotNameInput(chatbotNameDraft);
  const hasChatbotNameChanges = normalizedChatbotNameDraft !== chatbotName;

  const displayName = profileName.trim() || "-";
  const displayEmail = profileEmail.trim() || "-";
  const displayPhone = profilePhone.trim() || "Not provided";

  return (
    <div className="mx-auto max-w-5xl space-y-6 text-slate-900 dark:text-slate-100">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Profile</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Manage your account details and vault security settings.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-8">
          <div className="space-y-6">
            {activeTab === "profile" ? (
              <>
                <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Profile Details</h2>
                  {!isEditingProfile && (
                    <button
                      type="button"
                      onClick={() => setIsEditingProfile(true)}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
                    >
                      Edit
                    </button>
                  )}
                </div>

                {profileError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                    {profileError}
                  </div>
                )}
                {profileMessage && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300">
                    {profileMessage}
                  </div>
                )}

                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 dark:border-indigo-900/50 dark:bg-indigo-950/20">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Chatbot Name</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          This name is saved to your account and used in chat.
                        </p>
                      </div>
                      {chatbotLoading && (
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Loading...</span>
                      )}
                    </div>

                    {chatbotError && (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                        {chatbotError}
                      </div>
                    )}
                    {chatbotMessage && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                        {chatbotMessage}
                      </div>
                    )}

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <div className="w-full space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Assistant Name
                        </label>
                        <input
                          type="text"
                          value={chatbotNameDraft}
                          maxLength={MAX_CHATBOT_NAME_LENGTH}
                          onChange={(event) => {
                            setChatbotNameDraft(event.target.value);
                            setChatbotError("");
                            setChatbotMessage("");
                          }}
                          placeholder="Enter chatbot name"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40"
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {normalizedChatbotNameDraft.length}/{MAX_CHATBOT_NAME_LENGTH} characters
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleSaveChatbotName}
                        disabled={chatbotSaving || chatbotLoading || !hasChatbotNameChanges}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {chatbotSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Save Name
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                    <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-indigo-100 text-3xl font-bold text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
                      {profilePhoto ? (
                        <img src={profilePhoto} alt="Profile" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          {displayName[0]?.toUpperCase() || "U"}
                        </div>
                      )}
                    </div>

                    <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Name</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{displayName}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Email</p>
                        <p className="mt-1 break-all text-sm font-semibold text-slate-900 dark:text-slate-100">{displayEmail}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Phone</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{displayPhone}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {isEditingProfile && (
                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 dark:border-indigo-900/50 dark:bg-indigo-950/20">
                    <div className="space-y-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Edit Profile</h3>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">
                          Editing Mode
                        </span>
                      </div>

                      <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
                        <div className="space-y-3">
                          <div className="mx-auto h-24 w-24 overflow-hidden rounded-full bg-indigo-100 text-3xl font-bold text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
                            {profilePhoto ? (
                              <img src={profilePhoto} alt="Profile" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                {displayName[0]?.toUpperCase() || "U"}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => photoInputRef.current?.click()}
                              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
                            >
                              Change Photo
                            </button>
                            {profilePhoto && (
                              <button
                                type="button"
                                onClick={() => setProfilePhoto(null)}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                              >
                                Remove Photo
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Name
                              </label>
                              <input
                                type="text"
                                value={profileName}
                                onChange={(e) => setProfileName(e.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Phone
                              </label>
                              <input
                                type="text"
                                value={profilePhone}
                                onChange={(e) => setProfilePhone(e.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Email
                            </label>
                            <input
                              type="email"
                              value={profileEmail}
                              onChange={(e) => setProfileEmail(e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40"
                            />
                          </div>
                        </div>
                      </div>

                      {showFavouriteTeacherEditor && (
                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            Update Your Favourite Teacher
                          </label>
                          <input
                            type="text"
                            value={favouriteTeacher}
                            onChange={(e) => setFavouriteTeacher(e.target.value)}
                            placeholder="Enter favourite teacher name"
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40"
                          />
                        </div>
                      )}

                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleProfilePhotoChange}
                        className="hidden"
                      />

                      <div className="flex flex-wrap justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => switchTab("security")}
                          className="rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-50 dark:border-indigo-700 dark:bg-slate-800 dark:text-indigo-300 dark:hover:bg-slate-700"
                        >
                          Set Security PIN
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowFavouriteTeacherEditor(true)}
                          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          Set Favourite Teacher
                        </button>
                        <button
                          type="button"
                          onClick={resetProfileEditing}
                          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveProfile}
                          disabled={profileLoading || !hasProfileChanges}
                          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {profileLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                          Save Profile Changes
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Security & Vault</h2>
                  <button
                    type="button"
                    onClick={() => switchTab("profile")}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back To Profile
                  </button>
                </div>

                {securityError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                    {securityError}
                  </div>
                )}
                {securityMessage && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300">
                    {securityMessage}
                  </div>
                )}

                <div className="space-y-4">
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/60 dark:bg-amber-900/20">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      {isVaultPasswordSet
                        ? "To change vault password, enter your current vault password first."
                        : "First-time vault setup requires your account password."}
                    </p>
                  </div>

                  {isVaultPasswordSet === null ? (
                    <div className="text-sm text-slate-500 dark:text-slate-400">Loading vault status...</div>
                  ) : isVaultPasswordSet ? (
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Current Vault Password</label>
                      <input
                        type="password"
                        value={oldVaultPassword}
                        onChange={(e) => setOldVaultPassword(e.target.value)}
                        placeholder="Enter current vault password"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Account Password</label>
                      <input
                        type="password"
                        value={accountPassword}
                        onChange={(e) => setAccountPassword(e.target.value)}
                        placeholder="Enter account password"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">New Secured Password</label>
                    <input
                      type="password"
                      value={securedPassword}
                      onChange={(e) => setSecuredPassword(e.target.value)}
                      placeholder="Enter new vault password"
                      minLength={6}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40"
                    />
                  </div>
                </div>
              </>
            )}

            {activeTab === "security" && (
              <div className="flex justify-end border-t border-slate-200 pt-6 dark:border-slate-800">
                <button
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handleSaveSecurity}
                  disabled={securitySaveDisabled}
                >
                  {securityLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Changes
                </button>
              </div>
            )}
          </div>
      </section>
    </div>
  );
}
