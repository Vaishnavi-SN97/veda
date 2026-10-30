# Veda RuralClass

A teacher-first web app for ONE teacher running a MULTI-GRADE classroom (Grades 3, 4 and 5
in one room), built on top of Google Classroom. Team MergeMates (lead: Shravya; members:
Vaishnavi, Chethana). Proposal: `docs/VEDA-RURALCLASS_3pages.pdf`. Logo: `docs/logo.png`.

**Core rule: AI suggests, the teacher decides.** Nothing AI-generated (plans, cards, quizzes,
alerts, tags) reaches students or records without a teacher action (Approve / Send / Accept).

MVP demo flow: Weekly plan → Topic done → Cards + quiz → Avatar chat → Test marks →
Early alert → Plan adjusts.

## Repository layout

```
.env                  # all keys, root only. NEVER print, hard-code or commit.
CLAUDE.md
docs/
  VEDA-RURALCLASS_3pages.pdf   # proposal
  logo.png
  api-contract.md              # the frontend <-> backend contract (source of truth for backend)
  syllabus/grade3.pdf, grade4.pdf, grade5.pdf   # KTBS Karnataka maths textbooks (English medium, Part I)
frontend/             # Next.js App Router + TypeScript + Tailwind, installable PWA
backend/              # Python FastAPI + SQLAlchemy + Alembic + PostgreSQL
```

## Stack

- **frontend/**: Next.js (App Router) + TypeScript + Tailwind, installable PWA (manifest +
  service worker, offline-friendly). Google login via NextAuth.
- **backend/**: Python FastAPI + SQLAlchemy + Alembic + PostgreSQL (`DATABASE_URL`, hosted on
  Supabase). Google Classroom via `google-api-python-client`.
- **AI = Sarvam only** (`SARVAM_API_KEY`). Every Sarvam call lives in `backend/ai_client.py`:
  - `sarvam-105b`: text (topic cards, quizzes, alert wording, plan explanations)
  - `sarvam-105b-conversations`: the "Vidya" student tutor
  - Saaras: speech-to-text (teacher voice notes, student mic)
  - Bulbul: text-to-speech (Vidya's voice)
- **Weekly timetable = Google OR-Tools CP-SAT** (no LLM). The LLM may only explain a plan.

## Secrets

- Keys live only in the root `.env`. Never print, log, echo, hard-code or commit them.
- Don't `cat`/Read `.env`. Refer to variables by name only.
- `.gitignore` must always cover `.env*`.

## Sarvam budget (₹100 total credit)

- Cache ALL generated content (keyed by grade + topic + language + kind). Never regenerate
  something that already exists in the DB; the teacher edits the cached copy.
- Send only ONE topic's textbook text per AI call; never whole chapters or books.
- Log every Sarvam call (model, purpose, input/output tokens or chars, cost estimate,
  cache hit/miss) to a DB table and to stdout.
- Prefer the free browser Web Speech API in the frontend until Saaras/Bulbul are wired.

## DEMO_MODE

`DEMO_MODE=true` runs the whole app on seeded fake data with no Google login:
- 25 students across Grades 3–5.
- 4 weeks of attendance, marks and quizzes.
- Includes **Ravi** (Grade 4): fraction scores down 3 weeks in a row and missed 4 days,
  which drives an early-warning alert.
- The UI shows a demo-mode banner and a teacher/student switch.
- Seed: `backend/app/demo_seed.py` (run `npm run seed`, or "Reset demo data" in the top-bar menu).
  "Today" is fixed to Fri 30 Oct 2026; the frontend reads dates from `GET /api/meta`.
- `NEXT_PUBLIC_DEMO_MODE` only controls the frontend's demo banner; the backend's `DEMO_MODE` decides behaviour.

## Google Classroom mapping

- Sign-in: NextAuth v4 (`frontend/lib/auth.ts`), Google provider, `access_type=offline`, `prompt=consent`.
  Scopes: `openid email profile` + `classroom.courses`, `classroom.rosters.readonly`,
  `classroom.profile.emails`, `classroom.coursework.students`, `classroom.courseworkmaterials`, `classroom.topics`.
- Tokens stay in the encrypted NextAuth cookie. The browser calls `/api/backend/*` (Next route handler),
  which adds `Authorization: Bearer <access token>` and `X-Veda-Proxy` (sha256 of NEXTAUTH_SECRET) and
  forwards to FastAPI. In real mode the backend rejects calls without the proxy key and checks tokens
  with Google's tokeninfo (`backend/app/auth.py`). Classroom calls: `backend/app/classroom.py`.
- Each teacher (Google account) has their own class. Syllabus topics + AI decks are shared; progress
  (`topic_progress`) and sends (`deck_send`) are per class. Demo reset touches only `class-hosahalli`.
- One Veda multi-grade class links **3 Classroom courses** (one per grade).
- Rosters come from Classroom.
- Topic cards post to Classroom as **materials**; quizzes post as **coursework**.
- Veda's own DB stores: syllabus, timetable, attendance, marks, mastery, tutor sessions, alerts.

## Syllabus (KTBS Karnataka, Mathematics, English medium)

- Imported from the PDFs by `backend/scripts/import_syllabus.py` into the `topic` table:
  chapters + page ranges from each book's CONTENTS page, topics from each chapter's
  "After studying this chapter you can…" outcomes, `source_text` = only that topic's pages.
  Full list: `docs/syllabus-topics.txt`. Re-running keeps ids and progress.
- Grade 3 (Part I, 5 chapters, 34 topics) · Grade 4 (Part I, 9 chapters, 44 topics) ·
  Grade 5 (**Part II**, 10 chapters, 53 topics).
- Merge candidates are found automatically: a chapter concept that is current for one grade and
  current or done for another (e.g. Multiplication for all three, Fractions/Decimals for 4 + 5).

## Backend architecture (backend/)

- `app/main.py` routes (every endpoint in `docs/api-contract.md`), `app/schemas.py` (camelCase,
  mirrors `frontend/lib/types.ts`), `app/models.py` (SQLAlchemy), `alembic/` migrations.
- `app/planner.py`: CP-SAT weekly planner (pure function, rules in its docstring). Tests: `tests/test_planner.py`.
- `app/risk.py`: transparent risk score (formula in its docstring). Tests: `tests/test_risk.py`.
- `app/services.py`: shared logic. **Supabase is ~150 ms per round trip**: class-wide numbers come
  from `snapshot()` (a handful of queries), never one query per student. GET requests use an
  autocommit session (no BEGIN/ROLLBACK round trips). `Topic.source_text` is deferred in lists.
- `ai_client.py`: the only place for AI (Sarvam, endpoints checked against docs.sarvam.ai Oct 2026):
  `POST /v1/chat/completions` (sarvam-105b, sarvam-105b-conversations), `POST /speech-to-text`
  (saaras:v4, ≤30 s), `POST /text-to-speech` (bulbul:v3, speaker priya, mp3). Header `api-subscription-key`.
  - Cards + quiz: strict JSON from ONE topic's source_text, validated with Pydantic, retried once.
    Quiz answers come back as the correct option's TEXT (models get indexes wrong), options with equal
    values (3/6 vs 1/2) are rejected, options are shuffled in code. Kannada/Hindi = one translation call
    from the saved English deck. Saved decks are never regenerated except by the Regenerate button.
  - Reasoning is OFF (`reasoning_effort: null`): with it on, hidden thinking used the whole token budget
    and returned empty content.
  - Planner activity lines and alert wording: one batched call, cached in `ai_cache` (bump
    `ALERT_PROMPT_VERSION` after changing that prompt).
  - Every paid call is logged on its own committed connection with a running count (`/admin` page).
    Each whole call has a 120 s deadline (a trickling reply once took 19 minutes).
  - TTS is the expensive part (~₹0.003/char): cached by exact text; voice defaults to the free browser.
  - `SARVAM_DISABLED=true` → placeholders (textbook quotes) everywhere; nothing breaks.
  - `scripts/pregenerate.py` writes the demo decks once; `scripts/live_check.py` tests every feature (~12 calls).
- `.env` URLs: the loader tolerates Supabase's `[password]` brackets, an un-encoded `@` in the
  password and Prisma's `?pgbouncer=true`. Migrations use `DIRECT_URL`, the app `DATABASE_URL`.

## Frontend architecture

- `frontend/lib/types.ts`: the API contract types. `frontend/lib/api.ts`: the ONLY place
  screens get data from; it calls the backend (`NEXT_PUBLIC_API_URL`, default http://localhost:8000).
- `docs/api-contract.md` mirrors `types.ts` + `api.ts` + `backend/app/schemas.py`.
  Keep all four in sync whenever the contract changes.
- Failed calls dispatch an event that `components/ApiStatus.tsx` shows as a banner with the server's reason.
- Teacher routes live under `/teacher/*`, student routes under `/student/*`.
- Next.js 16 with Cache Components: screens are client components that load through `lib/api.ts`
  in effects. Read `frontend/node_modules/next/dist/docs/` before using a Next API you're unsure of.
  Reading `searchParams` = server `page.tsx` passes the promise to a client component inside `<Suspense>`.

## Running

```
npm run setup      # first time: venv + packages, DB tables, syllabus import, demo seed
npm run dev        # backend :8000 + frontend :3000 together (Ctrl+C stops both)
npm test           # backend planner + risk tests
cd frontend; npx tsc --noEmit; npx eslint .; npx next build   # must pass
```

## Status

- Steps 0–3 done: frontend, backend, and Sarvam AI (cards/quiz, planner activities, Vidya tutor,
  Saaras/Bulbul voice, alert wording, admin usage page). 41 Sarvam calls ≈ ₹3.5 used while building.
- `.env` options: `VOICE_PROVIDER=browser|sarvam` (default browser, free), `SARVAM_DISABLED=true`,
  `AI_BUDGET_INR` (default 100).
- Step 4 done: Google sign-in, real Classroom (courses, rosters, materials, coursework, topics, two-way
  grade sync), kind errors (expired login / missing permission / offline with cached data), PDF report
  (reportlab), offline student cards + queued quizzes. `npm start` = production demo run.
- Not done: student token enforcement on student routes; real-mode end-to-end needs a human Google login.
  The API runs without auto-reload (uvicorn's reloader stopped the server on Windows).

## Design

- Background `#0B0A0C`, cards `#1A1920`, borders `#3D3D47`, text `#F0F0F5` / `#CCCCD6`,
  ONE accent `#F0A070`. (Status colours only where meaning needs them, used sparingly.)
- Three display themes, picked from the top-bar menu and remembered per device: **Dark** (the
  palette above, default), **Medium** (dim grey) and **Bright** (warm off-white, accent darkened
  to `#B95C2A` so orange text stays readable). All values live as CSS variables in
  `frontend/app/globals.css`; components use only the tokens (`bg-card`, `text-ink-2`, `text-accent`…),
  never raw hex, so every screen follows the theme.
- Fonts: **Oxanium** (bold headings), **Onest** (body).
- Line icons, generous spacing.
- Mobile-first for low-end Android phones: large tap targets (≥ 48px), light pages, few
  heavy libraries, works on slow networks.
- Plain language everywhere; the teacher and families are not tech users.
