const TOKEN_KEY = "token";
const USER_KEY = "user";
const REMEMBER_ME_KEY = "rememberMe";

const shouldPersistAuth = (): boolean => localStorage.getItem(REMEMBER_ME_KEY) === "true";

const getActiveStorage = (): Storage => (shouldPersistAuth() ? localStorage : sessionStorage);

export const normalizeLegacyAuthStorage = (): void => {
  const rememberMe = localStorage.getItem(REMEMBER_ME_KEY);

  if (rememberMe === "true") {
    return;
  }

  // Older builds kept auth in localStorage forever; clear that stale state.
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

export const getAuthToken = (): string | null => getActiveStorage().getItem(TOKEN_KEY);

export const getStoredUser = (): string | null => getActiveStorage().getItem(USER_KEY);

export const saveAuthSession = (token: string, user: unknown, rememberMe: boolean): void => {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);

  localStorage.setItem(REMEMBER_ME_KEY, rememberMe ? "true" : "false");

  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem(TOKEN_KEY, token);
  storage.setItem(USER_KEY, JSON.stringify(user));
};

export const updateStoredUser = (user: unknown): void => {
  const storage = getActiveStorage();
  if (!storage.getItem(TOKEN_KEY)) {
    return;
  }

  storage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearAuthSession = (): void => {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(REMEMBER_ME_KEY);
};
