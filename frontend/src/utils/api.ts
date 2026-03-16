const rawApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL ?? "").trim();
const normalizedApiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");

const isAbsoluteUrl = (value: string): boolean => {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value) || value.startsWith("//");
};

const normalizePath = (value: string): string => {
  return value.startsWith("/") ? value : `/${value}`;
};

const shouldPrefixApiBase = (value: string): boolean => {
  const path = normalizePath(value);
  return (
    path === "/api" ||
    path.startsWith("/api/") ||
    path === "/uploads" ||
    path.startsWith("/uploads/")
  );
};

export const buildApiUrl = (value: string): string => {
  if (!normalizedApiBaseUrl) {
    return value;
  }

  if (isAbsoluteUrl(value)) {
    return value;
  }

  if (!shouldPrefixApiBase(value)) {
    return value;
  }

  return `${normalizedApiBaseUrl}${normalizePath(value)}`;
};

export const installApiFetchPatch = (): void => {
  if (typeof window === "undefined") {
    return;
  }

  const win = window as typeof window & { __SMARTDOC_FETCH_PATCHED__?: boolean };
  if (win.__SMARTDOC_FETCH_PATCHED__) {
    return;
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (typeof input === "string") {
      return nativeFetch(buildApiUrl(input), init);
    }

    if (input instanceof URL) {
      return nativeFetch(buildApiUrl(input.toString()), init);
    }

    return nativeFetch(input, init);
  }) as typeof window.fetch;

  win.__SMARTDOC_FETCH_PATCHED__ = true;
};
