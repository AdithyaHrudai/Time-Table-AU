# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TimetableGenius — a fully local, offline-capable timetable generator for the **CSE department of Anna University main campus**. A single admin (one professor) drives the whole flow: pick which years to schedule (1–4), enter sections per year per stream (4-yr B.Tech and 6-yr integrated), define subjects, register faculty by designation, optionally record each faculty's subject/section preferences, then generate a clash-free Mon–Sat timetable and export per-master / per-year / per-section / per-faculty PDFs.

## Stack

- **Backend**: FastAPI (Python 3.10), Motor (async MongoDB), Pydantic, JWT + bcrypt auth (optional Google OAuth via external session-id flow), ReportLab for PDFs. Single-file API at `backend/server.py`.
- **Frontend**: React 19 + CRA via CRACO, React Router v7, Tailwind + shadcn/ui (Radix primitives), Axios. Path alias `@/` → `frontend/src/`.
- **DB**: MongoDB 7 in Docker (`mongodb-local` container, port 27017). Single database, name from `DB_NAME`.

## Running locally

```powershell
.\start-dev.ps1   # from app/ root — starts mongo container, backend, frontend as PS jobs
```

Or manually in two terminals:

```powershell
# Terminal 1 — backend
cd backend; .venv\Scripts\activate; uvicorn server:app --reload --port 8000

# Terminal 2 — frontend
cd frontend; npm start
```

MongoDB must be up first: `docker start mongodb-local` (or `docker run -d --name mongodb-local -p 27017:27017 mongo:7` the first time). Backend reads `backend/.env` (`MONGO_URL`, `DB_NAME`). Frontend reads `frontend/.env` (`REACT_APP_BACKEND_URL`).

No test suite. ESLint runs only via CRA build.

## Domain model — what requires reading multiple files

The data model is rigidly shaped by AU's CSE conventions:

- **Session** owns everything; user picks which years (subset of 1,2,3,4).
- **YearConfig** (per session, per year): number of 4-yr sections + number of 6-yr sections + strength per section. Saving a YearConfig **auto-generates Sections** in the DB — frontend never POSTs sections directly. Labels: a single 4-yr section is `{y}/4 CSE`; multiple 4-yr get `{y}/4 CSE - N`; 6-yr always numbered `{y}/6 CSE - N`.
- **Section** carries `year`, `stream` ("4yr"/"6yr"), `section_number`, `name`, `strength`. Sections are read-only in the UI; SectionsManagement is a viewer.
- **Batch** is implicit: every section has Batch-1 and Batch-2 (half strength each). Stored only as an integer column on `TimetableEntry`.
- **Subject** is per-year (not per-section): defining a subject for year 2 applies it to every year-2 section. Each section gets `lectures_per_week` lectures/subject/week (default 2) + (if `requires_lab`) `lab_sessions_per_week` lab sessions per batch/week (default 1). These per-subject counts are customizable in SubjectsManagement for credit-based loads.
- **Faculty** has a `designation` (one of 5) and a `pattern` (one of `2T+1L`, `2T+2L`, `3T+1L`). Pattern dictates how many distinct (subject, section) theory and lab assignments the faculty can hold. Faculty may also have `unavailable_days` (a subset of working days they can't teach — enforced at placement). Designation rules live in `DESIGNATION_*` dicts at the top of `server.py` — single source of truth, exposed via `/api/meta/designations`.
- **FacultyChoice** records `(faculty, subject, section, role)` preferences. For categories 1–3 (Senior/Associate/Assistant Professor) these are **hard** and honored in category order. For categories 4–5 (ADHOC / Research Scholar) they are **soft hints**. Anything not pinned is auto-filled by the generator.

## Generator (`_generate_best` → `_generate_core` in `server.py`)

`_generate_best` is the entry point: it runs `session.generation_attempts` (default 60) independent randomized attempts of `_generate_core`, each seeded deterministically from `"{session_id}-{i}"`, and keeps the best result (fewest `unassigned`, tie-broken by most even faculty load). It stops early once an attempt is fully scheduled. This best-of-N approach is what makes clash-free generation reliable; per-attempt determinism keeps results reproducible.

Each `_generate_core` attempt is a three-stage greedy with a slot board:

1. **Build demand**: every `(subject, section, role[, batch])` instance — `lectures_per_week` theory rows per section/subject; 2 lab rows (one per batch) × `lab_sessions_per_week` per lab-bearing subject/section.
2. **Assign faculty** to each unique `(subject, section, role)`: cat-1 hard choices first, then cat-2, cat-3; then soft cat-4/5 picks; then auto-fill remaining demand from the faculty pool, respecting per-faculty pattern caps. When `balance_faculty_load` is on (default), auto-fill picks the eligible faculty with the *most* remaining capacity (spreads load) rather than strict category order.
3. **Place into slots**: instances are ordered most-constrained-first (pinned → labs → theory). For each, candidate `(day, slot)` pairs are filtered against the faculty's `unavailable_days`; when balancing, pairs are spread-ordered (prefer days where that faculty + section are least busy) to avoid clustering. Placement runs against the `_SlotBoard`, which enforces:
   - Faculty cannot be in two places at the same `(day, slot)`.
   - A section cannot have a lecture if either batch is in a lab; cannot have any lab if there's a lecture.
   - The same batch cannot be in two labs at the same `(day, slot)`.

Failures end up in `timetable.unassigned` (with reasons), surfaced as a warning panel in `TimetableView`. A static **feasibility check** (`/api/sessions/{id}/feasibility`, `_compute_feasibility`) compares weekly demand vs faculty/grid capacity *before* generation and is shown as a panel in `TimetableView`.

## Fixed schedule (AU CSE)

Constants at the top of `server.py`:

- Working days: Mon–Sat
- 3 teaching slots/day: `09:00–10:40`, `10:40–12:20`, `13:30–15:10` (each = 1h 40min, valid for both theory and lab)
- Lunch: `12:20–13:30` (blocked)

These are intentionally hardcoded — the user requested AU's schedule and removed slot-configuration UI. If the schedule ever changes, edit `FIXED_WORKING_DAYS` / `FIXED_TIME_SLOTS` and the generator picks it up.

## Conventions worth knowing

- IDs are app-generated strings (`session_{uuid12}`, `fac_{uuid12}`, etc.), not Mongo `_id`. Pydantic models use `ConfigDict(extra="ignore")` because Mongo docs round-trip with `_id`.
- Mongo has no relational constraints. Cleanup is the caller's job: deleting a session also drops year_configs, sections, subjects, faculty, faculty_choices, and timetables. Deleting a faculty/subject drops their faculty_choices. Replacing a YearConfig deletes orphan section choices.
- Frontend uses `axios.defaults.baseURL = REACT_APP_BACKEND_URL` and `withCredentials = true`. All API calls are relative (`/api/...`).
- One timetable per session: regenerating deletes the previous. No version history.
- Department is **CSE only** — no department field anywhere. Don't reintroduce.
- Rooms are **intentionally not modelled** right now — AU has a known lab-shortage issue; we track only `(section, batch)` busy state for labs, not which lab room.

## Auth model

JWT in `Authorization: Bearer <token>`, 7-day expiry. `get_current_user` dependency wraps every `/api/sessions/...` endpoint. Email/password auth uses bcrypt.

Google OAuth uses the standard OAuth 2.0 authorization-code flow (free — create a client at [console.cloud.google.com](https://console.cloud.google.com), no third-party service):

1. Frontend "Continue with Google" button → `GET {BACKEND}/api/auth/google/login`.
2. Backend redirects to Google's consent screen, Google redirects back to `GET /api/auth/google/callback?code=...`.
3. Backend exchanges the code for a token, fetches the profile, upserts the user, issues our JWT, and redirects to `{FRONTEND_URL}/dashboard#token=<jwt>`.
4. `App.js`'s `AuthCallback` reads `#token=` from the hash, calls `/api/auth/me`, and logs in.

Config lives in `backend/.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (must match the URI registered in Google Cloud), `FRONTEND_URL`, `JWT_SECRET`. If `GOOGLE_CLIENT_ID` is blank, `/api/auth/google/login` returns 503 and only email/password auth works.

## When extending the generator

The greedy core works for the common case. If you hit infeasibility with realistic data, prefer **replacing it with a CSP solver** (Google OR-Tools `cp_model`) rather than adding more heuristics. The board / demand / assignment split in `_generate_core` should map cleanly onto CP-SAT variables.
