# Deployment

Frontend **Next.js on Vercel** · backend **FastAPI on Render (free tier)** · database **PostgreSQL on Supabase**.
Each service reads only its own environment variables (set in that service's dashboard). No shared root `.env`.

```
browser ──► Vercel (Next.js)  ──/api/backend/* proxy──►  Render (FastAPI)  ──►  Supabase (Postgres)
            NextAuth + Google                              Sarvam AI, Google Classroom API
```

The browser never calls Render directly: it calls the same-origin proxy `/api/backend/*` on Vercel, which
adds the teacher's Google token (kept server-side in the encrypted NextAuth cookie) and an `X-Veda-Proxy`
key derived from `NEXTAUTH_SECRET`, then forwards to `NEXT_PUBLIC_API_URL`.

## 1. Supabase (database)

You need two connection strings from **Project Settings → Database → Connection string**:

| Use | Which string | Port |
|---|---|---|
| App traffic → `DATABASE_URL` | **Transaction pooler** (recommended for Render free; many short connections) | `6543` |
| Migrations → `DIRECT_URL` | **Session pooler** (or the direct connection if your network has IPv6) | `5432` |

The backend switches off server-side prepared statements, so the transaction pooler works. Alembic uses
`DIRECT_URL` when it is set, otherwise `DATABASE_URL`. If the password contains special characters such
as `@`, URL-encode them (the backend also tolerates an un-encoded `@` and Supabase's `[ ]` brackets).

## 2. Render (backend)

New **Web Service** from this GitHub repo:

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Runtime | Python 3 (version from `backend/.python-version` = `3.11.9`) |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/health` (returns `{"ok": true}`) |
| Instance type | Free |

Environment variables (Render → Environment):

| Name | Required | Value |
|---|---|---|
| `DATABASE_URL` | yes | Supabase **transaction pooler** URI (port 6543) |
| `DIRECT_URL` | recommended | Supabase **session pooler** URI (port 5432), used by `alembic upgrade head` |
| `DEMO_MODE` | yes | `true` = seeded demo class, no Google; `false` = real Google Classroom |
| `FRONTEND_URL` | yes | Your Vercel origin, e.g. `https://your-app.vercel.app`. Comma-separate extra origins (preview URLs). Used for CORS; the **first** one builds the student links |
| `NEXTAUTH_SECRET` | yes | Same value as on Vercel (the backend uses it to verify that calls came through the Vercel proxy) |
| `SARVAM_API_KEY` | for AI | Sarvam API subscription key |
| `SARVAM_DISABLED` | no | `true` turns every AI call off (placeholders) |
| `VOICE_PROVIDER` | no | `browser` (default, free) or `sarvam` (Saaras + Bulbul, paid per use) |
| `AI_BUDGET_INR` | no | Budget shown on the AI usage page (default `100`) |
| `PYTHON_VERSION` | no | `3.11.9`, only if Render ignores `.python-version` |

`PORT` is set by Render automatically; don't add it. `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are **not**
needed on Render (the backend only receives the teacher's access token through the proxy).

Notes for the free tier: the service sleeps after ~15 minutes idle, so the first request after a pause can
take ~50 s (open the site a minute before a demo). `opencv-python-headless` is pinned as requested but no
code imports it; removing it from `requirements.txt` makes builds faster.

## 3. Vercel (frontend)

New Project from this GitHub repo:

| Setting | Value |
|---|---|
| Root Directory | `frontend` |
| Framework Preset | Next.js |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output | default (`.next`) |

Environment variables (Vercel → Settings → Environment Variables, for Production and Preview):

| Name | Required | Value |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes | Render service URL, e.g. `https://veda-api.onrender.com` (no trailing slash, no `/api`). Baked in at build time: **redeploy after changing it** |
| `NEXTAUTH_URL` | yes | Your canonical Vercel URL, e.g. `https://your-app.vercel.app` |
| `NEXTAUTH_SECRET` | yes | Long random string (e.g. `openssl rand -base64 32`); must equal Render's `NEXTAUTH_SECRET` |
| `GOOGLE_CLIENT_ID` | real mode | Google OAuth **Web application** client ID |
| `GOOGLE_CLIENT_SECRET` | real mode | Its client secret |

This app uses **NextAuth.js v4 (4.24.15)**, which reads **`NEXTAUTH_URL`** and **`NEXTAUTH_SECRET`**.
It does **not** read Auth.js v5 names (`AUTH_SECRET`, `AUTH_URL`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`).
The Google provider reads `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (see `frontend/lib/auth.ts`).
Whether the app is in demo or real mode is decided by the backend's `DEMO_MODE` (the frontend asks
`/api/meta`); there is no frontend demo variable.

## 4. Google OAuth (real mode)

In Google Cloud Console, for the OAuth client whose ID you put on Vercel:

- **Authorized redirect URI:** `https://<your-vercel-domain>/api/auth/callback/google`
  (the path is always **`/api/auth/callback/google`**; keep `http://localhost:3000/api/auth/callback/google` for local use)
- **Authorized JavaScript origin:** `https://<your-vercel-domain>`
- **APIs & Services → Library:** enable the **Google Classroom API**
- **OAuth consent screen:** add the scopes `classroom.courses`, `classroom.rosters.readonly`,
  `classroom.profile.emails`, `classroom.coursework.students`, `classroom.courseworkmaterials`,
  `classroom.topics` (plus `openid`, `email`, `profile`); while the app is in *Testing*, add each teacher's
  Google account under **Test users**.

## 5. One-time data (from your computer)

The database is shared, so run these once locally (with `backend/.env` pointing at the same Supabase):

```bash
cd backend
.venv/Scripts/python scripts/import_syllabus.py   # needs the textbook PDFs in docs/syllabus/ (not in git)
.venv/Scripts/python scripts/seed_demo.py         # demo class (only touches the demo class)
.venv/Scripts/python scripts/pregenerate.py       # AI cards for demo topics (skips ones already made)
```

If you deploy against the Supabase project you already used locally, this data is already there.

## 6. Order of deployment

1. Render first → copy its URL.
2. Vercel with `NEXT_PUBLIC_API_URL` = that URL → copy the Vercel URL.
3. Back on Render set `FRONTEND_URL` = the Vercel URL (and redeploy); on Vercel set `NEXTAUTH_URL` = the Vercel URL.
4. Add the redirect URI in Google Cloud.
5. Check: `https://<render>/health` → `{"ok":true}`, then open the Vercel site.

## Local development

- `backend/.env` (copy `backend/.env.example`), `frontend/.env.local` (copy `frontend/.env.example`), then
  `npm run dev` or `npm start` from the repo root. Locally use `FRONTEND_URL=http://localhost:3000` and
  `NEXT_PUBLIC_API_URL=http://localhost:8000`.
- Never commit `.env` files. Only `NEXT_PUBLIC_*` values reach the browser; secrets must not use that prefix.
