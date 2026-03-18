<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# SMARTDOC (Frontend + Backend)

This repo contains:
- `frontend/`: React + Vite client
- `backend/`: Express API
- `server.ts`: backend startup entrypoint

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy [.env.example](.env.example) to `.env.local` and fill values
3. Run the app:
   `npm run dev`

Development commands:

- `npm run dev`: starts backend + frontend together, and auto-selects free ports when defaults are occupied
- `npm run dev:backend`: starts only the backend API
- `npm run dev:frontend`: starts only the frontend Vite app
- `npm run build`: builds frontend into `dist/`
- `npm run start`: starts backend in production mode using `tsx`

## Frontend And Backend Split

- `frontend/`: React app (`src/`, `index.html`, `vite.config.ts`)
- `backend/`: Express API, DB, middleware, routes, and services
- `server.ts`: backend entrypoint
- In development, frontend and backend run as separate processes

## MongoDB Atlas Support

The backend supports two providers:

- `sqlite` (default)
- `mongodb` (MongoDB Atlas)

To run with Atlas, set these in `.env.local`:

```env
DB_PROVIDER=mongodb
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster-url>/?retryWrites=true&w=majority
MONGODB_DB_NAME=smartdoc
```

If `DB_PROVIDER` is not set, the app uses `mongodb` automatically when `MONGODB_URI` is present; otherwise it uses `sqlite`.

`MONGO_URI` is also accepted as an alias for `MONGODB_URI`.

Verify active DB connection at:

- `GET /api/health/db`

## OAuth Login (Google + GitHub)

To enable social login, set these in `.env.local`:

```env
OAUTH_BASE_URL=http://localhost:5001
FRONTEND_BASE_URL=http://localhost:5173

GOOGLE_CLIENT_ID=your_google_client_id
# Optional in current Google flow:
GOOGLE_CLIENT_SECRET=your_google_client_secret

GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

Notes:
- `GOOGLE_CLIENT_ID` is required for Google sign-in.
- `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` are required for GitHub sign-in.
- Avoid trailing spaces/new lines in `FRONTEND_BASE_URL` and `OAUTH_BASE_URL`.

Callback URLs to configure in providers:

- Google: `http://localhost:5001/api/auth/google/callback`
- GitHub: `http://localhost:5001/api/auth/github/callback`

## Deploy: Vercel (Frontend) + Render (Backend)

### 1. Deploy backend on Render

You can use [render.yaml](render.yaml) or configure manually.

Recommended Render env vars:

```env
NODE_ENV=production
PORT_SEARCH_LIMIT=0
JWT_SECRET=<strong-random-secret>
DB_PROVIDER=mongodb
MONGODB_URI=<your-atlas-uri>
MONGODB_DB_NAME=smartdoc
FRONTEND_BASE_URL=https://<your-vercel-domain>
OAUTH_BASE_URL=https://<your-render-domain>
CORS_ORIGIN=https://<your-vercel-domain>
```

If you want Google sign-in, set:

```env
GOOGLE_CLIENT_ID=<your-google-client-id>
```

If you want GitHub sign-in, set:

```env
GITHUB_CLIENT_ID=<your-github-client-id>
GITHUB_CLIENT_SECRET=<your-github-client-secret>
```

Optional backend vars:

```env
GEMINI_API_KEY=
GOOGLE_CLIENT_SECRET=
UPLOAD_DIR=uploads
SQLITE_DB_PATH=smartdoc.db
```

### 2. Deploy frontend on Vercel

This repo includes [vercel.json](vercel.json) for static SPA routing.

Set this Vercel env var:

```env
VITE_API_BASE_URL=https://<your-render-domain>
```

Without `VITE_API_BASE_URL`, frontend `/api/*` calls stay on the Vercel domain and OAuth/login will fail.

Then deploy with:
- Build command: `npm run build`
- Output directory: `dist`

### 3. OAuth provider callbacks (production)

Use your Render domain callbacks:
- Google: `https://<your-render-domain>/api/auth/google/callback`
- GitHub: `https://<your-render-domain>/api/auth/github/callback`

### 4. Post-deploy health check

- `GET https://<your-render-domain>/api/health/db` should return `{"provider":"...","connected":true}`
- Login/register from Vercel UI should call Render APIs successfully
- Upload + download should work without CORS errors

## Backend Structure

The backend is split into focused modules under `backend/`:

- `backend/app.ts`: Express app bootstrap and route mounting
- `backend/config/env.ts`: environment loading and config values
- `backend/db/`: SQLite connection and migrations
- `backend/middleware/`: auth and file upload middleware
- `backend/routes/`: auth, documents, and search API routes
- `backend/services/aiProcessing.ts`: Gemini-based background document processing

`server.ts` is now a small entrypoint that starts `backend/app.ts`.
