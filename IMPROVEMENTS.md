# IMPROVEMENTS.md

Planning doc for the next major iteration of TimetableGenius. Fill in the **Faculty Answers** section as you collect responses, then point Claude at this file (e.g. *"Read IMPROVEMENTS.md and implement Phase 1"*).

> **How to use this file**
> - Sections marked `[FILL IN]` need your input before work starts.
> - Sections marked `[SPEC]` are concrete change descriptions Claude can act on.
> - Move items between **Backlog → In Progress → Done** as work proceeds.
> - When a gap is closed, also update `CLAUDE.md` to remove it from the "known gaps" list.

---

## 1. Faculty Answers `[FILL IN]`
> - I want you to  to design timetables simultaneously for 1st,2nd, 3rd, 4th year students’ semesters selected by the users’ choice.
First ask if 1,2,3,4 years of students' as a choice for user to design after selecting the year of study, ask the user to return the number of sections and strength per each section. 
while filling the faculty details, you must ask users the designation of the faculty. These are MINIMUM hours of work per week for each designation: 
1. Senior Professor – 12 hours / week -> 2 theory+1lab
2. Associate Professor – 14 hours / week -> 2 theory + 2 lab
3. Assistant Professor – 18 hours / week -> 2 theory + 2 lab or 3 theory + 1 lab
4. ADHOC & ADJUNCT – 18 hours / week -> 2 theory + 2 lab or 3 theory + 1 lab
5. Research Scholar – 14 hours / week -> 2 theory + 2 lab

These are the minimum hours of work required for each faculty designation. You need to remember that only 1,2,3 category faculty have the choice to select subject + sections of any year students, but 4,5 category faculty's schedule must only be designed to be without overlapping. they don't have the choice to select subject + sections of any year students. You need to design the timetable in such a way that the faculty's schedule is without overlapping and also meets the minimum hours of work per week for their respective designations.

Remember that each lecture is 1:40 minutes long and each lab is also 1:40 minutes long. 
Our software project must be able to design time tables for 1st, 2,3,4th year students simultaneusly at a time without overlapping and any errors. 
Only after filling the choices of 1,2,3 category faculty, the other lecturers can be assigned on random basis. But remember to assign only based on priority bases from 1 -> 2 -> 3. 

And also provide optional choice or preferences for 4,5 option but the priority will be given to 1,2,3 category faculty. After satisfying the choices of 1,2,3 category faculty, then you can assign the remaining subjects to 4,5 category faculty based on their preferences but without overlapping. If the preferences of 4,5 category faculty cannot be satisfied without overlapping, then you can assign them to any remaining subjects without considering their preferences. 

Take all the required important data from the user to design the timetable without any errors for 4 years student sections. 
We need to design timetables for all the sections of selected years simultaneously at a time without overlapping and any errors.

And also add any extra feature(s) that you think will be useful for the users while designing the timetable. but explain what it is to the end user when the app is live and also add the option to select the extra feature(s) or not. Which will increase the accuracy of the schedules for all sections. 

Our main motive is to design  a fully local, offline-capable university timetable generator. Professors define sessions, years of study(1,2,3,4) sections, faculty, subjects, rooms/labs, and (optionally) priority slot allocations; the backend generates a clash-free weekly schedule and exports printable PDFs (master / per-faculty / per-section)

label sections as it is eg: 1st sections have one 1/4 cse and all the remaining go like 1/6 cse - 1, 1/6 cse - 2, 1/6 cse - 3, 1/6 cse - 4. etc upto wherever how many sections are there in that year of study. same for 2nd,3rd,4th year sections.

Do the best improvements and if there are any doubts, ask me for clarification before implementing.
## 2. In Progress
- _(nothing yet)_

## 3. Done — Phase B: reliability + customization (2026-05-30)
Goal: generate clash-free timetables for all sections/years simultaneously with fewer failures, and give professors more control.

- **Reliability core (`server.py`)**:
  - `_generate_best` runs N randomized attempts (`generation_attempts`, default 60) and keeps the best (fewest unassigned, then most balanced load); stops early on a perfect fit. Deterministic per seed.
  - Load-balanced auto-fill: assigns leftover demand to the faculty with the most spare capacity (toggle: `balance_faculty_load`).
  - Spread-aware placement: most-constrained-first ordering (pinned → labs → theory) + prefer least-busy day for each faculty/section to avoid clustering.
- **Customization** (all optional, backward-compatible defaults):
  - Per-subject `lectures_per_week` + `lab_sessions_per_week` (credit-based loads) — SubjectsManagement.
  - Faculty `unavailable_days` (day-off availability, enforced at placement) — FacultyManagement.
  - Session `generation_attempts` + `balance_faculty_load` — SessionSetup "Smart Generation Settings" card.
- **Feasibility analyzer**: `/api/sessions/{id}/feasibility` compares weekly demand vs faculty/grid capacity and returns actionable warnings; shown as a green/amber panel in TimetableView before generating.

## 4. Done — Phase A: AU CSE rebuild (2026-05-12)
Complete rewrite to match Anna University main campus CSE rules:

- Backend `server.py` rebuilt: new models (SessionConfig with `years`, YearConfig, Section auto-generation with 4-yr/6-yr labelling, FacultyDesignation+pattern, Subject by year, FacultyChoice), new `_generate_core` allocator with `_SlotBoard`, fixed AU schedule (Mon–Sat × 3 slots × 1h40, lunch 12:20–13:30), `/api/meta/designations` endpoint for UI dropdown rules.
- Generator priority: Cat 1 hard choices → Cat 2 → Cat 3 → soft Cat 4/5 hints → auto-fill within pattern caps. Section + batch + faculty non-overlap enforced strictly.
- Removed `RoomsManagement.jsx` and `PriorityAllocation.jsx` pages (functionality replaced).
- New page `FacultyChoices.jsx` (subject + section + role picker per faculty).
- Rewrote `SessionSetup.jsx` (year multi-select + per-year section counts), `Dashboard.jsx`, `Sidebar.jsx`, `FacultyManagement.jsx` (designation/pattern), `SubjectsManagement.jsx` (per-year, lab toggle), `SectionsManagement.jsx` (read-only grouped viewer), `TimetableView.jsx` (year/section/faculty filters, batch-aware cells, lunch row, unassigned-demand warnings, faculty load summary).
- Updated `App.js` routes: removed `/rooms`, replaced `/priority` with `/faculty-choices`.
