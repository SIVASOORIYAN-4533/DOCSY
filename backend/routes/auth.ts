import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
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
      profilePhoto: user.profile_photo ?? null,
      hasSecuredPassword: !!user.secured_password,
    },
  };
};

const buildFrontendUrl = (path: string): string => {
  const base = env.frontendBaseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
};

const loginErrorUrl = (message: string): string => {
  return buildFrontendUrl(`/login?oauth_error=${encodeURIComponent(message)}`);
};

const loginSuccessUrl = (token: string, user: unknown): string => {
  const params = new URLSearchParams({
    oauth_token: token,
    oauth_user: JSON.stringify(user),
  });
  return `${buildFrontendUrl("/login")}#${params.toString()}`;
};

const createOAuthState = (provider: "google" | "github"): string => {
  return jwt.sign({ provider, kind: "oauth-state" }, env.jwtSecret, { expiresIn: "10m" });
};

const verifyOAuthState = (state: string | undefined, provider: "google" | "github"): boolean => {
  if (!state) {
    return false;
  }

  try {
    const payload = jwt.verify(state, env.jwtSecret) as { provider?: string; kind?: string };
    return payload?.provider === provider && payload?.kind === "oauth-state";
  } catch {
    return false;
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
  const { name, email, password, favouriteTeacher } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = String(name || "").trim();

  if (!normalizedName || !normalizedEmail || !password || !favouriteTeacher) {
    res.status(400).json({ error: "Name, email, password, and favourite teacher are required" });
    return;
  }

  if (!isStrongPassword(password)) {
    res.status(400).json({ error: "Password must be 8+ chars, with 1 number and 1 special char" });
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const normalizedFavouriteTeacher = String(favouriteTeacher).trim().toLowerCase();
  const safeRole = getUserRole();

  try {
    const userId = await createUser(
      normalizedName,
      normalizedEmail,
      hashedPassword,
      safeRole,
      normalizedFavouriteTeacher,
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
  if (!env.googleClientId || !env.googleClientSecret) {
    res.redirect(loginErrorUrl("Google sign-in is not configured on server"));
    return;
  }

  const redirectUri = `${env.oauthBaseUrl}/api/auth/google/callback`;
  const state = createOAuthState("google");
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get("/google/callback", async (req, res) => {
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");

  if (!code || !verifyOAuthState(state, "google")) {
    res.redirect(loginErrorUrl("Invalid Google OAuth response"));
    return;
  }

  try {
    const redirectUri = `${env.oauthBaseUrl}/api/auth/google/callback`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenRes.ok || !tokenData.access_token) {
      res.redirect(loginErrorUrl("Google token exchange failed"));
      return;
    }

    const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = (await profileRes.json()) as { email?: string; name?: string };

    if (!profileRes.ok || !profile.email) {
      res.redirect(loginErrorUrl("Google account email not available"));
      return;
    }

    await ensureOAuthUser(profile.email, profile.name || "Google User", "google");
    const user = await findUserByEmail(profile.email);
    if (!user) {
      res.redirect(loginErrorUrl("Failed to create Google user"));
      return;
    }

    const auth = buildAuthResponse(user);
    res.redirect(loginSuccessUrl(auth.token, auth.user));
  } catch {
    res.redirect(loginErrorUrl("Google sign-in failed"));
  }
});

router.get("/github", (req, res) => {
  if (!env.githubClientId || !env.githubClientSecret) {
    res.redirect(loginErrorUrl("GitHub sign-in is not configured on server"));
    return;
  }

  const redirectUri = `${env.oauthBaseUrl}/api/auth/github/callback`;
  const state = createOAuthState("github");
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

  if (!code || !verifyOAuthState(state, "github")) {
    res.redirect(loginErrorUrl("Invalid GitHub OAuth response"));
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
      res.redirect(loginErrorUrl("GitHub token exchange failed"));
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
      res.redirect(loginErrorUrl("GitHub account email not available"));
      return;
    }

    await ensureOAuthUser(chosenEmail, profile.name || profile.login || "GitHub User", "github");
    const user = await findUserByEmail(chosenEmail);
    if (!user) {
      res.redirect(loginErrorUrl("Failed to create GitHub user"));
      return;
    }

    const auth = buildAuthResponse(user);
    res.redirect(loginSuccessUrl(auth.token, auth.user));
  } catch {
    res.redirect(loginErrorUrl("GitHub sign-in failed"));
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
  const { name, email, profilePhoto, favouriteTeacher } = req.body || {};

  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  try {
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = String(name || "").trim();
    if (!normalizedName || !normalizedEmail) {
      res.status(400).json({ error: "Name and email are required" });
      return;
    }

    const normalizedFavouriteTeacher = String(favouriteTeacher || "").trim().toLowerCase();

    await updateUserProfile(
      req.user.id,
      normalizedName,
      normalizedEmail,
      profilePhoto ?? null,
      normalizedFavouriteTeacher || undefined,
    );
    res.json({ success: true });
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
