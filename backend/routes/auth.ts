import { Request, Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { env } from "../config/env";
import {
  createUser,
  findUserById,
  findUserByEmail,
  getUserSecuredPassword,
  setUserSecuredPassword,
  updateUserPassword,
  updateUserProfile,
} from "../db/repository";
import { authenticateToken } from "../middleware/auth";

const router = Router();
const getUserRole = (): "user" => "user";

const buildAuthResponse = (user: {
  id: number;
  name: string;
  email: string;
  role: string;
  phone?: string | null;
  profile_photo?: string | null;
  secured_password?: string | null;
}) => {
  const safeRole = getUserRole();
  const token = jwt.sign(
    { id: user.id, email: user.email, role: safeRole, name: user.name },
    env.jwtSecret,
  );

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: safeRole,
      phone: user.phone ?? null,
      profilePhoto: user.profile_photo ?? null,
      hasSecuredPassword: !!user.secured_password,
    },
  };
};

const buildFrontendUrl = (path: string, frontendBaseUrl = env.frontendBaseUrl): string => {
  const base = frontendBaseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
};

const loginErrorUrl = (message: string, frontendBaseUrl?: string): string => {
  return buildFrontendUrl(`/login?oauth_error=${encodeURIComponent(message)}`, frontendBaseUrl);
};

const loginSuccessUrl = (token: string, user: unknown, frontendBaseUrl?: string): string => {
  const params = new URLSearchParams({
    oauth_token: token,
    oauth_user: JSON.stringify(user),
  });
  return `${buildFrontendUrl("/login", frontendBaseUrl)}#${params.toString()}`;
};

const registerPrefillUrl = (email: string, name: string, frontendBaseUrl?: string): string => {
  const params = new URLSearchParams({
    oauth_provider: "google",
    oauth_email: email,
    oauth_name: name,
  });
  return `${buildFrontendUrl("/register", frontendBaseUrl)}#${params.toString()}`;
};

type OAuthStatePayload = {
  provider?: string;
  kind?: string;
  nonce?: string;
  frontendBaseUrl?: string;
};

const normalizeOrigin = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
};

const isLocalhostOrigin = (origin: string): boolean => {
  return /^https?:\/\/localhost(?::\d+)?$/i.test(origin);
};

const resolveFrontendBaseUrl = (req: Request): string => {
  const headerOrigin = normalizeOrigin(String(req.headers.origin || ""));
  const refererOrigin = normalizeOrigin(String(req.headers.referer || ""));

  const isAllowedOrigin = (origin: string): boolean => {
    if (!origin) {
      return false;
    }

    if (env.corsOrigins.includes("*") || env.corsOrigins.includes(origin)) {
      return true;
    }

    if (env.nodeEnv !== "production" && isLocalhostOrigin(origin)) {
      return true;
    }

    return false;
  };

  if (isAllowedOrigin(headerOrigin)) {
    return headerOrigin;
  }

  if (isAllowedOrigin(refererOrigin)) {
    return refererOrigin;
  }

  return env.frontendBaseUrl;
};

const createOAuthState = (
  provider: "google" | "github",
  options?: { nonce?: string; frontendBaseUrl?: string },
): string => {
  const payload: OAuthStatePayload = { provider, kind: "oauth-state" };
  if (options?.nonce) {
    payload.nonce = options.nonce;
  }
  if (options?.frontendBaseUrl) {
    payload.frontendBaseUrl = options.frontendBaseUrl;
  }

  return jwt.sign(payload, env.jwtSecret, { expiresIn: "10m" });
};

const readOAuthState = (
  state: string | undefined,
  provider: "google" | "github",
): OAuthStatePayload | null => {
  if (!state) {
    return null;
  }

  try {
    const payload = jwt.verify(state, env.jwtSecret) as OAuthStatePayload;
    if (payload?.provider !== provider || payload?.kind !== "oauth-state") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};

const isBcryptHash = (value: string): boolean => {
  return /^\$2[aby]\$\d{2}\$/.test(value);
};

const normalizeEmail = (value: unknown): string => {
  return String(value || "").trim().toLowerCase();
};

const isStrongPassword = (value: unknown): boolean => {
  const password = String(value || "");
  const passwordRegex = /^(?=.*[0-9])(?=.*[!@#$%^&*])[a-zA-Z0-9!@#$%^&*]{8,}$/;
  return passwordRegex.test(password);
};

const ensureOAuthUser = async (
  email: string,
  name: string,
  provider: "google" | "github",
): Promise<void> => {
  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    return;
  }

  const randomPassword = await bcrypt.hash(`oauth-${provider}-${Date.now()}-${Math.random()}`, 10);
  const oauthTeacherAnswer = await bcrypt.hash(`oauth-${provider}-${email}`.toLowerCase(), 10);
  await createUser(name || email.split("@")[0], email, randomPassword, "user", oauthTeacherAnswer);
};

router.post("/register", async (req, res) => {
  const { name, email, phone, password, favouriteTeacher } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = String(name || "").trim();
  const normalizedPhone = String(phone || "").trim();
  const normalizedFavouriteTeacher = String(favouriteTeacher || "").trim().toLowerCase();

  if (!normalizedName || !normalizedEmail || !normalizedPhone || !password || !normalizedFavouriteTeacher) {
    res.status(400).json({
      error: "Name, email, phone, password, and favourite teacher are required",
    });
    return;
  }

  if (!isStrongPassword(password)) {
    res.status(400).json({ error: "Password must be 8+ chars, with 1 number and 1 special char" });
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const safeRole = getUserRole();

  try {
    const userId = await createUser(
      normalizedName,
      normalizedEmail,
      hashedPassword,
      safeRole,
      normalizedFavouriteTeacher,
      normalizedPhone,
    );
    res.status(201).json({ id: userId });
  } catch {
    res.status(400).json({ error: "Email already exists" });
  }
});

router.post("/forgot-password/question", async (req, res) => {
  try {
    const { email } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    const user = await findUserByEmail(normalizedEmail);

    if (!user) {
      res.status(404).json({ error: "Account not found for this email" });
      return;
    }

    if (!user.favourite_teacher) {
      res.status(400).json({
        error: "Security question not set. Login and update favourite teacher in Settings > Account Profile.",
      });
      return;
    }

    res.json({ question: "Who is your favourite teacher?" });
  } catch {
    res.status(500).json({ error: "Unable to load security question right now" });
  }
});

router.post("/forgot-password/reset", async (req, res) => {
  try {
    const { email, favouriteTeacher, newPassword } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    const normalizedInput = String(favouriteTeacher).trim().toLowerCase();
    const nextPassword = String(newPassword || "");

    if (!normalizedEmail) {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    if (!normalizedInput || !nextPassword) {
      res.status(400).json({ error: "Favourite teacher answer and new password are required" });
      return;
    }

    if (!isStrongPassword(nextPassword)) {
      res.status(400).json({ error: "Password must be 8+ chars, with 1 number and 1 special char" });
      return;
    }

    const user = await findUserByEmail(normalizedEmail);

    if (!user) {
      res.status(404).json({ error: "Account not found for this email" });
      return;
    }

    if (!user.favourite_teacher) {
      res.status(400).json({
        error: "Security question not set. Login and update favourite teacher in Settings > Account Profile.",
      });
      return;
    }

    const storedAnswer = String(user.favourite_teacher || "").trim();
    let isAnswerValid = false;

    if (storedAnswer) {
      if (isBcryptHash(storedAnswer)) {
        isAnswerValid = await bcrypt.compare(normalizedInput, storedAnswer);
      } else {
        // Backward compatibility for old rows that stored plain text answers.
        isAnswerValid = storedAnswer.toLowerCase() === normalizedInput;
      }
    }

    if (!isAnswerValid) {
      res.status(401).json({ error: "Incorrect favourite teacher answer" });
      return;
    }

    const hashedPassword = await bcrypt.hash(nextPassword, 10);
    await updateUserPassword(user.id, hashedPassword);
    res.json({ success: true, message: "Password updated successfully" });
  } catch {
    res.status(500).json({ error: "Unable to reset password right now" });
  }
});

router.get("/google", (req, res) => {
  if (!env.googleClientId) {
    res.redirect(loginErrorUrl("Google sign-in is not configured (missing GOOGLE_CLIENT_ID)"));
    return;
  }

  const redirectUri = `${env.oauthBaseUrl}/api/auth/google/callback`;
  const nonce = randomUUID();
  const frontendBaseUrl = resolveFrontendBaseUrl(req);
  const state = createOAuthState("google", { nonce, frontendBaseUrl });
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: redirectUri,
    response_type: "id_token",
    response_mode: "form_post",
    scope: "openid email profile",
    nonce,
    state,
    prompt: "select_account",
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.all("/google/callback", async (req, res) => {
  const stateRaw = req.method === "POST" ? req.body?.state : req.query.state;
  const idTokenRaw = req.method === "POST" ? req.body?.id_token : req.query.id_token;
  const state = String(stateRaw || "");
  const idToken = String(idTokenRaw || "");
  const statePayload = readOAuthState(state, "google");
  const frontendBaseUrl = statePayload?.frontendBaseUrl || env.frontendBaseUrl;

  if (!idToken || !statePayload) {
    res.redirect(loginErrorUrl("Invalid Google OAuth response", frontendBaseUrl));
    return;
  }

  try {
    const tokenInfoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?${new URLSearchParams({ id_token: idToken }).toString()}`,
    );
    const tokenInfo = (await tokenInfoRes.json()) as {
      aud?: string;
      email?: string;
      email_verified?: boolean | string;
      name?: string;
      nonce?: string;
      error_description?: string;
    };

    const isEmailVerified = tokenInfo.email_verified === true || tokenInfo.email_verified === "true";
    if (!tokenInfoRes.ok || !tokenInfo.email || !isEmailVerified) {
      res.redirect(loginErrorUrl("Google account validation failed", frontendBaseUrl));
      return;
    }

    if (tokenInfo.aud !== env.googleClientId) {
      res.redirect(loginErrorUrl("Google token audience mismatch", frontendBaseUrl));
      return;
    }

    if (statePayload.nonce && tokenInfo.nonce !== statePayload.nonce) {
      res.redirect(loginErrorUrl("Google nonce validation failed", frontendBaseUrl));
      return;
    }

    const normalizedEmail = normalizeEmail(tokenInfo.email);
    const user = await findUserByEmail(normalizedEmail);
    if (!user) {
      res.redirect(registerPrefillUrl(normalizedEmail, String(tokenInfo.name || "").trim(), frontendBaseUrl));
      return;
    }

    const auth = buildAuthResponse(user);
    res.redirect(loginSuccessUrl(auth.token, auth.user, frontendBaseUrl));
  } catch {
    res.redirect(loginErrorUrl("Google sign-in failed", frontendBaseUrl));
  }
});

router.get("/github", (req, res) => {
  if (!env.githubClientId || !env.githubClientSecret) {
    res.redirect(loginErrorUrl("GitHub sign-in is not configured on server"));
    return;
  }

  const redirectUri = `${env.oauthBaseUrl}/api/auth/github/callback`;
  const frontendBaseUrl = resolveFrontendBaseUrl(req);
  const state = createOAuthState("github", { frontendBaseUrl });
  const params = new URLSearchParams({
    client_id: env.githubClientId,
    redirect_uri: redirectUri,
    scope: "read:user user:email",
    state,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

router.get("/github/callback", async (req, res) => {
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");
  const statePayload = readOAuthState(state, "github");
  const frontendBaseUrl = statePayload?.frontendBaseUrl || env.frontendBaseUrl;

  if (!code || !statePayload) {
    res.redirect(loginErrorUrl("Invalid GitHub OAuth response", frontendBaseUrl));
    return;
  }

  try {
    const redirectUri = `${env.oauthBaseUrl}/api/auth/github/callback`;
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env.githubClientId,
        client_secret: env.githubClientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenRes.ok || !tokenData.access_token) {
      res.redirect(loginErrorUrl("GitHub token exchange failed", frontendBaseUrl));
      return;
    }

    const headers = {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "smartdoc-app",
    };

    const profileRes = await fetch("https://api.github.com/user", { headers });
    const profile = (await profileRes.json()) as { name?: string; login?: string };
    const emailsRes = await fetch("https://api.github.com/user/emails", { headers });
    const emails = (await emailsRes.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;

    const chosenEmail =
      emails.find((emailEntry) => emailEntry.primary && emailEntry.verified)?.email ||
      emails.find((emailEntry) => emailEntry.verified)?.email ||
      emails[0]?.email;

    if (!profileRes.ok || !emailsRes.ok || !chosenEmail) {
      res.redirect(loginErrorUrl("GitHub account email not available", frontendBaseUrl));
      return;
    }

    await ensureOAuthUser(chosenEmail, profile.name || profile.login || "GitHub User", "github");
    const user = await findUserByEmail(chosenEmail);
    if (!user) {
      res.redirect(loginErrorUrl("Failed to create GitHub user", frontendBaseUrl));
      return;
    }

    const auth = buildAuthResponse(user);
    res.redirect(loginSuccessUrl(auth.token, auth.user, frontendBaseUrl));
  } catch {
    res.redirect(loginErrorUrl("GitHub sign-in failed", frontendBaseUrl));
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  const user = await findUserByEmail(normalizeEmail(email));

  if (!user || !(await bcrypt.compare(password || "", user.password || ""))) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  res.json(buildAuthResponse(user));
});

router.put("/profile", authenticateToken, async (req, res) => {
  const { name, email, phone, profilePhoto, favouriteTeacher } = req.body || {};

  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  try {
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = String(name || "").trim();
    const normalizedPhone = String(phone || "").trim();
    if (!normalizedName || !normalizedEmail) {
      res.status(400).json({ error: "Name and email are required" });
      return;
    }

    const normalizedFavouriteTeacher = String(favouriteTeacher || "").trim().toLowerCase();

    await updateUserProfile(
      req.user.id,
      normalizedName,
      normalizedEmail,
      normalizedPhone || null,
      profilePhoto ?? null,
      normalizedFavouriteTeacher || undefined,
    );

    const refreshedUser = await findUserById(req.user.id);
    if (!refreshedUser) {
      res.json({ success: true });
      return;
    }

    res.json({
      success: true,
      user: buildAuthResponse(refreshedUser).user,
    });
  } catch {
    res.status(400).json({ error: "Email already exists" });
  }
});

router.post("/secured-password", authenticateToken, async (req, res) => {
  const { password, accountPassword, oldPassword } = req.body || {};

  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  if (!password) {
    res.status(400).json({ error: "Password is required" });
    return;
  }

  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const existingSecuredPassword = user.secured_password ?? null;
  if (existingSecuredPassword) {
    if (!oldPassword) {
      res.status(400).json({ error: "Current vault password is required" });
      return;
    }

    const isCurrentVaultPasswordValid = await bcrypt.compare(oldPassword, existingSecuredPassword);
    if (!isCurrentVaultPasswordValid) {
      res.status(401).json({ error: "Current vault password is incorrect" });
      return;
    }
  } else {
    if (!accountPassword) {
      res.status(400).json({ error: "Account password is required for first-time vault setup" });
      return;
    }

    const isAccountPasswordValid = await bcrypt.compare(accountPassword, user.password || "");
    if (!isAccountPasswordValid) {
      res.status(401).json({ error: "Account password is incorrect" });
      return;
    }
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  await setUserSecuredPassword(req.user.id, hashedPassword);
  res.json({ success: true });
});

router.get("/secured-password/status", authenticateToken, async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  const securedPassword = await getUserSecuredPassword(req.user.id);
  res.json({ isSet: !!securedPassword });
});

router.post("/verify-secured", authenticateToken, async (req, res) => {
  const { password } = req.body || {};

  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  const securedPassword = await getUserSecuredPassword(req.user.id);
  if (!securedPassword) {
    res.status(404).json({ error: "Secured password not set", notSet: true });
    return;
  }

  const isMatch = await bcrypt.compare(password || "", securedPassword);
  if (!isMatch) {
    res.status(401).json({ error: "Invalid secured password" });
    return;
  }

  res.json({ success: true });
});

export default router;
