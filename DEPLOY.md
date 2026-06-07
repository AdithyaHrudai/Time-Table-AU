# Deploying TimetableGenius (free, single URL, no login)

The whole app — React frontend **and** FastAPI backend — runs as **one Docker
service on Render**, served at a single URL. The only external piece is the
database (MongoDB Atlas). There is **no login/signup**: anyone with the URL uses
a single shared department workspace.

```
Professor's browser ──► Render (one Docker service: React + API) ──► MongoDB Atlas
                         https://timetablegenius.onrender.com
```

This design removes every problem class we hit before: no CORS, no separate
frontend URL to configure, no auth.

---

## 1. Database — MongoDB Atlas (free M0)

1. Sign up → https://www.mongodb.com/cloud/atlas/register
2. Create a **free M0 cluster** (region near you). Wait ~2 min.
3. **Database Access** → add a user. ⚠️ Use a password with **only letters/numbers**
   (symbols break the connection string). Save user + password.
4. **Network Access** → **Allow access from anywhere** (`0.0.0.0/0`).
5. **Database → Connect → Drivers** → copy the connection string:
   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   Substitute your real user/password. This is your **`MONGO_URL`**.

---

## 2. App — Render (one free Docker service)

> If you deployed an earlier version, **delete the old `timetablegenius-api`
> Render service and the Vercel project** — they're no longer used.

1. Sign up / log in → https://render.com with GitHub, grant access to `Time-Table-AU`.
2. **New → Blueprint** → select the repo. Render reads [`render.yaml`](render.yaml)
   and proposes a Docker service named `timetablegenius`.
3. When prompted, set the one secret:
   | Key | Value |
   |---|---|
   | `MONGO_URL` | your Atlas string from step 1 |

   (`DB_NAME` is set automatically.)
4. **Apply.** The first build takes ~5–8 min (it compiles the React app, then
   builds the Python image). Watch the **Logs** tab.
5. When it's **Live**, you get one URL, e.g.:
   ```
   https://timetablegenius.onrender.com
   ```
   That's the entire app. Open it → you land straight in the app, no login.

✅ **Test:** open the URL → create a session → add subjects + faculty →
generate a timetable → export a PDF.
(Health check, if you want it: `<URL>/api/health` → `{"status":"ok"}`.)

> 💤 **Free-tier nap:** the service sleeps after ~15 min idle; the next visit
> takes ~50 s to wake. To keep it instant, add a free job at
> https://cron-job.org that GETs `<URL>/api/health` every 14 minutes.

---

## 3. Updating the app later

```bash
git add -A
git commit -m "your change"
git push
```
Render auto-rebuilds on push (~5–8 min) and your professors see the update with
zero action on their end.

---

## Run it locally

**Option A — Docker (mirrors production exactly):**
```powershell
docker build -t timetablegenius .
docker run -p 8000:8000 -e MONGO_URL="mongodb://host.docker.internal:27017" -e DB_NAME="timetable_genius" timetablegenius
# open http://localhost:8000
```

**Option B — split dev servers (hot reload while coding):**
```powershell
copy backend\.env.example backend\.env      # then start mongo + backend
copy frontend\.env.example frontend\.env     # REACT_APP_BACKEND_URL=http://localhost:8000
.\start-dev.ps1
```
In split mode the React dev server runs on :3000 and talks to the backend on
:8000; in production they're the same origin so the frontend uses relative URLs.

---

## Notes

- **No accounts:** everyone shares one workspace. This matches the app's
  single-admin design. If you ever need per-user separation, that's a feature to
  add back deliberately — it's not required for a single department.
- **Data lives in Atlas**, so it persists across redeploys.
