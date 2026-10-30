# Veda RuralClass

A teacher-first web app for one teacher running a **multi-grade classroom** (Grades 3, 4 and 5
in one room), built on top of Google Classroom. Veda plans the teacher's week, sends revision
cards and a quiz home the moment a topic is done, gives students a voice tutor ("Vidya"), and
flags who needs help early. **AI suggests, the teacher decides.**

Team **MergeMates**: Shravya (lead), Vaishnavi, Chethana.

## Status

- `frontend/`: complete, running on realistic demo data (Next.js + TypeScript + Tailwind, installable PWA,
  Bright / Medium / Dark themes).
- `backend/`: next step (FastAPI + PostgreSQL + OR-Tools + Sarvam AI), following `docs/api-contract.md`.

## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. Demo mode needs no login or keys. Student demo PIN: `1234`.

## Repository

| Path | What |
|---|---|
| `frontend/` | Teacher and student screens; `lib/api.ts` is the single data layer, `lib/mock/` the demo data |
| `docs/api-contract.md` | API the backend implements |
| `docs/VEDA-RURALCLASS_3pages.pdf` | Proposal |
| `CLAUDE.md` | Full project plan and conventions |

The KTBS textbook PDFs used for the syllabus are kept locally in `docs/syllabus/` and are not
committed (they are marked "Not to be republished"). Secrets live in a root `.env` that is never committed.
