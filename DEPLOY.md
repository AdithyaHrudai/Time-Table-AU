# Deploying TimetableGenius (all free tiers)

Architecture: **Frontend on Vercel**, **Backend on Render**, **Database on MongoDB Atlas**.
Everything below uses free tiers. Do the steps in order — each one produces a URL
the next step needs.

```
Professor's browser
        │
        ▼
  Vercel (React)  ──API calls──►  Render (FastAPI)  ──►  MongoDB Atlas
```

---

## 1. Database — MongoDB Atlas (free M0)

1. Sign up at <https://www.mongodb.com/cloud/atlas/register>.
2. Create a **free M0 cluster** (any cloud/region near you).
3. **Database Access** → Add a database user (username + password). Save them.
4. **Network Access** → Add IP `0.0.0.0/0` (allow from anywhere — Render's IPs are dynamic).
5. **Connect → Drivers** → copy the connection string. It looks like:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   Replace `<user>`/`<password>` with the ones from step 3. Keep this as your `MONGO_URL`.

---

## 2. Backend — Render (free web service)

1. Sign up at <https://render.com> with GitHub and grant access to this repo.
2. **New → Blueprint**, pick this repo. Render reads [`render.yaml`](render.yaml) and
   creates a service named `timetablegenius-api`.
3. When prompted (or under the service's **Environment** tab) fill the secrets:
   | Key | Value |
   |---|---|
   | `MONGO_URL` | your Atlas string from step 1 |
   | `CORS_ORIGINS` | *(leave blank for now — set in step 4)* |
   | `FRONTEND_URL` | *(leave blank for now — set in step 4)* |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | *(leave blank for now — step 5; Google login is optional)* |

   `JWT_SECRET` and `DB_NAME` are filled automatically by the blueprint.
4. Deploy. When it's live you'll get a URL like
   `https://timetablegenius-api.onrender.com`. Test it:
   `https://timetablegenius-api.onrender.com/api/health` should return `{"status":"ok"}`.

> **Free-tier note:** the backend sleeps after ~15 min idle; the first request after
> that takes ~50 s to wake. To avoid this, add a free cron at
> <https://cron-job.org> that GETs `/api/health` every 14 minutes.

---

## 3. Frontend — Vercel

1. Sign up at <https://vercel.com> with GitHub and import this repo.
2. **Set Root Directory to `frontend`** (Vercel → project → Settings → General → Root
   Directory). This is important — the React app lives in the `frontend/` subfolder.
   Vercel auto-detects Create React App; [`frontend/vercel.json`](frontend/vercel.json)
   handles client-side routing.
3. Under **Environment Variables** add:
   | Key | Value |
   |---|---|
   | `REACT_APP_BACKEND_URL` | your Render URL, e.g. `https://timetablegenius-api.onrender.com` |
4. Deploy. You'll get a URL like `https://timetablegenius.vercel.app`.

---

## 4. Wire the two together (CORS)

Back in **Render → Environment**, set and save (this redeploys the backend):

| Key | Value |
|---|---|
| `CORS_ORIGINS` | your Vercel URL, e.g. `https://timetablegenius.vercel.app` |
| `FRONTEND_URL` | same Vercel URL |

Now open the Vercel URL, **register an account, add subjects, and generate a
timetable** to confirm the full flow works.

---

## 5. (Optional) Google login — free

1. <https://console.cloud.google.com> → create a project.
2. **APIs & Services → OAuth consent screen** → External → add your email as a test
   user (or publish).
3. **Credentials → Create OAuth client ID → Web application**:
   - Authorized redirect URI:
     `https://timetablegenius-api.onrender.com/api/auth/google/callback`
4. Copy the **Client ID** and **Client secret** into Render env vars:
   | Key | Value |
   |---|---|
   | `GOOGLE_CLIENT_ID` | the client ID |
   | `GOOGLE_CLIENT_SECRET` | the client secret |
   | `GOOGLE_REDIRECT_URI` | `https://timetablegenius-api.onrender.com/api/auth/google/callback` |
5. Save → backend redeploys → "Continue with Google" now works.

If you skip this, email/password sign-up still works fully; the Google button just
shows a friendly error if clicked.

---

## 6. Updating the app later

```bash
# edit code locally, then:
git add -A
git commit -m "your change"
git push
```

Render and Vercel both auto-deploy on push to the default branch. Your professors
see the change in ~1–2 minutes — they don't have to do anything.

---

## Local development

```powershell
# from app/ — copy the env templates, then start everything
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
.\start-dev.ps1
```

(`start-dev.ps1` brings up the local MongoDB container, backend, and frontend.)
