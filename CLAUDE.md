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
- Frontend: `NEXT_PUBLIC_DEMO_MODE=true` (in demo, `lib/api.ts` serves mock data).

## Google Classroom mapping

- One Veda multi-grade class links **3 Classroom courses** (one per grade).
- Rosters come from Classroom.
- Topic cards post to Classroom as **materials**; quizzes post as **coursework**.
- Veda's own DB stores: syllabus, timetable, attendance, marks, mastery, tutor sessions, alerts.

## Syllabus (KTBS Karnataka, Mathematics, English medium, Part I)

- Grade 3: Shapes · Numbers · Addition · Subtraction · Multiplication
- Grade 4: Perimeter and Area of simple geometrical figures · Numbers · Addition ·
  Subtraction · Multiplication · Division · Circles · Mental Arithmetic ·
  Fractional Numbers (Fractions and Decimals)
- Grade 5: PDF not yet added; mock data uses placeholder topics. Replace them from
  `docs/syllabus/grade5.pdf` once it's there.
- Shared chapter names (Numbers, Addition, Subtraction, Multiplication) are the
  natural candidates for **cross-grade merged sessions** ("one session, three levels").

## Frontend architecture

- `frontend/lib/types.ts`: the API contract types. `frontend/lib/api.ts`: the ONLY place
  screens get data from. Functions return mock data now (`frontend/lib/mock/`); later they
  call the FastAPI backend without the screens changing.
- `docs/api-contract.md` mirrors `types.ts` + `api.ts` for the backend to implement.
  Keep all three in sync whenever the contract changes.
- Teacher routes live under `/teacher/*`, student routes under `/student/*`.

- `frontend/lib/mock/`: seed data (`seed.ts`), planner stand-in (`plan.ts`), demo cards/quizzes/tutor
  replies (`content.ts`), browser-persisted demo state (`store.ts`), mock API (`index.ts`).
  The demo banner's reset button restores the seed.
- Next.js 16 with Cache Components: screens are client components that load through `lib/api.ts`
  in effects. Read `frontend/node_modules/next/dist/docs/` before using a Next API you're unsure of.
  Reading `searchParams` = server `page.tsx` passes the promise to a client component inside `<Suspense>`.

## Running

```
cd frontend
npm run dev        # http://localhost:3000
npx tsc --noEmit; npx eslint .; npx next build   # all three must pass
```

## Status

- Step 0 (this file) and Step 1 (complete frontend on mock data) done.
- Next: Step 2, the backend in `backend/`, implementing `docs/api-contract.md`.
- Grade 5 textbook PDF still to be added; then replace the placeholder Grade 5 topics in
  `frontend/lib/mock/seed.ts` (and the backend seed).

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
