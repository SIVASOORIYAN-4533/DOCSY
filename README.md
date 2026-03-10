<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/9af9caa9-63da-43e6-9df7-4e834e050969

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

Development commands:

- `npm run dev`: starts backend + frontend together, and auto-selects free ports when defaults are occupied
- `npm run dev:backend`: starts only the backend API
- `npm run dev:frontend`: starts only the frontend Vite app

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

Verify active DB connection at:

- `GET /api/health/db`

## OAuth Login (Google + GitHub)

To enable social login, set these in `.env.local`:

```env
OAUTH_BASE_URL=http://localhost:5001
FRONTEND_BASE_URL=http://localhost:5173

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

Callback URLs to configure in providers:

- Google: `http://localhost:5001/api/auth/google/callback`
- GitHub: `http://localhost:5001/api/auth/github/callback`

## Backend Structure

The backend is split into focused modules under `backend/`:

- `backend/app.ts`: Express app bootstrap and route mounting
- `backend/config/env.ts`: environment loading and config values
- `backend/db/`: SQLite connection and migrations
- `backend/middleware/`: auth and file upload middleware
- `backend/routes/`: auth, documents, and search API routes
- `backend/services/aiProcessing.ts`: Gemini-based background document processing

`server.ts` is now a small entrypoint that starts `backend/app.ts`.
