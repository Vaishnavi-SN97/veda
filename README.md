# Veda RuralClass

A teacher-first web app for one teacher running a **multi-grade classroom** (Grades 3, 4 and 5
in one room), built on top of Google Classroom. Veda plans the teacher's week (OR-Tools), sends
revision cards and a quiz home the moment a topic is done, gives students a voice tutor ("Vidya"),
and flags who needs help early. **AI suggests, the teacher decides.**

Team **MergeMates**: Shravya (lead), Vaishnavi, Chethana.

| Part | What |
|---|---|
| `frontend/` | Next.js 16 + TypeScript + Tailwind, installable PWA (works offline for students), Bright / Medium / Dark themes, Google sign-in (NextAuth) |
| `backend/` | FastAPI + SQLAlchemy + Alembic on PostgreSQL (Supabase), OR-Tools CP-SAT planner, transparent risk score, Google Classroom, Sarvam AI (`ai_client.py`) |
| `docs/` | API contract, imported syllabus (`syllabus-topics.txt`), proposal |

## 1. Setup (once)

Needs **Node 20+**, **Python 3.11.9**, and separate environment files for the backend and frontend.
Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to
`frontend/.env.local`. Never commit the real files.

Then, from the project root:

```bash
npm run setup     # Python venv + packages, frontend packages, DB tables, syllabus import, demo data
```

## 2. Run

```bash
npm start         # production build: use this for demos (fast, offline mode on)
npm run dev       # development (frontend hot reload; restart after backend edits)
npm test          # backend tests: planner rules, risk score, AI validation, Classroom
```

Open the frontend address shown by Next.js. The API docs are available at `/docs` on the backend host.
Other commands: `npm run seed` (reset the demo class), `npm run pregenerate` (AI cards for demo topics, once),
`npm run import-syllabus` (re-read `docs/syllabus/*.pdf`).

## 3. Demo mode vs real mode

Set `DEMO_MODE` in `backend/.env` and `NEXT_PUBLIC_DEMO_MODE` in
`frontend/.env.local`, then restart (`npm start`).

- **`DEMO_MODE=true`**: the sample class "Hosahalli Multi-grade Room" (25 students, 4 weeks of data,
  Ravi's story). No Google login. "Send to class" uses fake Classroom ids. Student PIN for everyone: **1234**.
  *Reset demo data* in the top-bar menu restores it (real classes are never touched).
- **`DEMO_MODE=false`**: the teacher signs in with Google. Veda lists their real Classroom courses,
  links one per grade (or creates "Grade 3/4/5"), imports the rosters (each child gets a 4-digit PIN),
  posts card decks as **materials** and quizzes as **coursework** under a topic named after the chapter,
  and syncs grades both ways (Marks → *Sync grades with Classroom*).

### Google Cloud setup for real mode (once)

1. In the Google Cloud project of your OAuth client, **enable the Google Classroom API**.
2. OAuth consent screen: add these scopes, and while the app is in *Testing*, add the teacher's
   Google account under **Test users**:
   `classroom.courses`, `classroom.rosters.readonly`, `classroom.profile.emails`,
   `classroom.coursework.students`, `classroom.courseworkmaterials`, `classroom.topics` (+ openid, email, profile).
3. OAuth client → **Authorized redirect URI**: `${NEXTAUTH_URL}/api/auth/callback/google`.
4. Sign in on the Google screen and **tick every Classroom box** (Veda shows a "Sign in again" button if a
   permission is missing or the login expires).

Students don't sign in with Google: the teacher opens the **student link** shown in Class setup → Students
once on the family phone; the phone remembers the class.

## 4. The 2-minute demo script (demo mode)

| # | Click | What it shows |
|---|---|---|
| 1 | **Teacher → Week plan → Next week → Generate my week** | OR-Tools plan: one teaching session per period, merged sessions for shared chapters, balanced teacher time |
| 2 | **Topic done** (Grade 4, *decimals*) → **Mark done & prepare cards** → switch **ಕನ್ನಡ / हिंदी** → **Send to Grade 4** | AI cards + 5-question quiz from the textbook page, in 3 languages, saved (no repeat cost) |
| 3 | **Student → Grade 4 → Ravi → PIN 1234 → New today → Decimals** → swipe cards → **Start quiz** | The child revises at home and takes the quiz |
| 4 | **Ask Vidya → "What is a decimal?"** (or the mic) | Tutor answers simply in the child's language and asks a question back |
| 5 | **Teacher → Marks** (Grade 4, decimals) → give Ravi **4/20** → **Save marks** | Test marks feed the risk score |
| 6 | **Alerts** → *Ravi is falling behind in Fractional Numbers* → read the reasons → **Accept** | Transparent reasons (quiz trend, test, attendance, Vidya time) + a next step |
| 7 | **Week plan → Next week** | The plan adapts: an extra Grade 4 re-teach period, marked *changed* |
| 8 | **Reports → Export PDF** | School-office report |

Offline: open the student screens once, then turn off the internet. Cards and quizzes still open, and a
finished quiz is saved on the phone and sent when it's back online.

## 5. Deploy

See [DEPLOY.md](./DEPLOY.md) for the Vercel, Render, and Supabase setup, commands, environment
variables, and Google OAuth redirect URI.

## 6. Costs

AI uses Sarvam (₹100 budget). Every call is logged; see **AI usage** in the top-bar menu (`/admin`).
Generated cards, activity lines, alert wording and voice clips are cached, so the demo costs ~₹0 to re-run.
