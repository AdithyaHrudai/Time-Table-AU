# Here are your Instructions


Every time you want to run the app, open 2 terminals and run:

Terminal 1 — Backend
cd c:\Users\hruda\OneDrive\Desktop\adithya\TT\app\backend
.venv\Scripts\activate
uvicorn server:app --reload --port 8000
Terminal 2 — Frontend
cd c:\Users\hruda\OneDrive\Desktop\adithya\TT\app\frontend
npm start
Open in Browser
http://localhost:3000
That's it — just 4 commands split across 2 terminals. No need to reinstall packages unless you add new dependencies.



Stop MongoDB Docker Container
docker ps
This shows running containers. Then stop it:
docker stop <container_id_or_name>
Or if you used docker-compose:
cd c:\Users\hruda\OneDrive\Desktop\adithya\TT
docker-compose down

Quick Reference
Action	Command
List running containers	docker ps
Stop a specific container	docker stop <name>
Stop ALL containers	docker stop $(docker ps -q)
Stop & remove (compose)	docker-compose down
Check if stopped	docker ps (should be empty)




### Every Time You Open VS Code — Do This in Order
Step 1 — Start Docker Desktop
Open Docker Desktop app from your Windows Start Menu. Wait until it shows "Running" (green icon in system tray).

Docker does NOT start automatically. You must open it manually every time you restart your PC.

Step 2 — Start MongoDB Container
Open a terminal in VS Code:
cd c:\Users\hruda\OneDrive\Desktop\adithya\TT
docker-compose up -d

This starts MongoDB in the background. You only need to do this once per session.

Step 3 — Start Backend (Terminal 1)
cd app\backend
.venv\Scripts\activate
uvicorn server:app --reload --port 8000
Step 4 — Start Frontend (Terminal 2)
Open a new terminal:
cd app\frontend
npm start

Step 5 — Open Browser
http://localhost:3000
When You're Done — Shut Everything Down
Then close Docker Desktop if you want.
# Press Ctrl+C in both Terminal 1 and Terminal 2
# Then stop MongoDB:
cd c:\Users\hruda\OneDrive\Desktop\adithya\TT
docker-compose down

Summary Cheat Sheet
Order	What	Command
1	Open Docker Desktop	From Start Menu (manual)
2	Start MongoDB	docker-compose up -d
3	Start Backend	.venv\Scripts\activate → uvicorn server:app --reload --port 8000
4	Start Frontend	npm start
5	Stop all when done	Ctrl+C both terminals → docker-compose down