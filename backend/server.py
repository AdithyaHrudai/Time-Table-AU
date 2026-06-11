from fastapi import FastAPI, APIRouter, HTTPException, Depends, Response, Request
from fastapi.responses import StreamingResponse, RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from urllib.parse import urlencode
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr, model_validator
from typing import List, Optional, Dict, Any, Tuple
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import httpx
import random
from io import BytesIO
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak, Flowable
from reportlab.lib.enums import TA_CENTER
from reportlab.pdfbase.pdfmetrics import stringWidth

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'timetable-genius-secret-key-2024')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 168

# ---- Google OAuth 2.0 (free; create a client at https://console.cloud.google.com) ----
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '')
GOOGLE_REDIRECT_URI = os.environ.get('GOOGLE_REDIRECT_URI', 'http://localhost:8000/api/auth/google/callback')
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

app = FastAPI(title="TimetableGenius API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ==================== CONSTANTS (AU CSE schedule) ====================

FIXED_WORKING_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
FIXED_TIME_SLOTS = ["09:00-10:40", "10:40-12:20", "13:30-15:10"]
LUNCH_SLOT = "12:20-13:30"
# Lunch sits between slot index 1 and 2 — a double-length lab cannot span it.
LUNCH_AFTER_SLOT_INDEX = 1

# Defaults for the official PDF header (all overridable per session).
DEFAULT_DEPT_NAME = "DEPARTMENT OF COMPUTER SCIENCE AND SYSTEMS ENGINEERING"
DEFAULT_COLLEGE_NAME = "ANDHRA UNIVERSITY, COLLEGE OF ENGINEERING, VISAKHAPATNAM"
DEFAULT_MODE_OF_CLASS = "OFFLINE"

DESIGNATIONS = ["senior_professor", "associate_professor", "assistant_professor", "adhoc", "research_scholar"]

DESIGNATION_LABEL = {
    "senior_professor": "Senior Professor",
    "associate_professor": "Associate Professor",
    "assistant_professor": "Assistant Professor",
    "adhoc": "ADHOC / Adjunct",
    "research_scholar": "Research Scholar",
}

DESIGNATION_CATEGORY = {
    "senior_professor": 1,
    "associate_professor": 2,
    "assistant_professor": 3,
    "adhoc": 4,
    "research_scholar": 5,
}

DESIGNATION_PATTERNS = {
    "senior_professor": ["2T+1L"],
    "associate_professor": ["2T+2L"],
    "assistant_professor": ["2T+2L", "3T+1L"],
    "adhoc": ["2T+2L", "3T+1L"],
    "research_scholar": ["2T+2L"],
}

DESIGNATION_MIN_HOURS = {
    "senior_professor": 12,
    "associate_professor": 14,
    "assistant_professor": 18,
    "adhoc": 18,
    "research_scholar": 14,
}

# Cat 1-3 choices are honored as hard preferences; cat 4-5 as soft hints.
DESIGNATION_HARD_CHOICE = {
    "senior_professor": True,
    "associate_professor": True,
    "assistant_professor": True,
    "adhoc": False,
    "research_scholar": False,
}

PATTERN_COUNTS = {
    "2T+1L": {"theory": 2, "lab": 1},
    "2T+2L": {"theory": 2, "lab": 2},
    "3T+1L": {"theory": 3, "lab": 1},
}

# Each theory subject = 2 lectures/week; each lab subject = 1 lab session per batch per week.
LECTURES_PER_THEORY_PER_WEEK = 2
LAB_SESSIONS_PER_BATCH_PER_WEEK = 1
BATCHES_PER_SECTION = 2


# ==================== PYDANTIC MODELS ====================

class UserBase(BaseModel):
    email: EmailStr
    name: str
    picture: Optional[str] = None

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    auth_type: str = "email"

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ---- Session ----

# Generation tuning defaults. `attempts` = how many independent randomized
# tries the generator runs before keeping the best (fewest unassigned) result.
DEFAULT_GENERATION_ATTEMPTS = 60
MAX_GENERATION_ATTEMPTS = 300


class SessionConfigCreate(BaseModel):
    name: str
    years: List[int] = Field(default_factory=list)  # subset of [1,2,3,4]
    # Optional generation tuning — None means "leave unchanged / use default".
    generation_attempts: Optional[int] = None
    balance_faculty_load: Optional[bool] = None
    # Optional PDF-header customization — None means "leave unchanged / use default".
    dept_name: Optional[str] = None
    college_name: Optional[str] = None
    effective_from: Optional[str] = None   # e.g. "01-07-2025"
    semester_label: Optional[str] = None   # e.g. "I-Semester"
    mode_of_class: Optional[str] = None    # e.g. "OFFLINE"

class SessionConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    session_id: str = Field(default_factory=lambda: f"session_{uuid.uuid4().hex[:12]}")
    user_id: str
    name: str
    years: List[int] = Field(default_factory=list)
    working_days: List[str] = Field(default_factory=lambda: list(FIXED_WORKING_DAYS))
    time_slots: List[str] = Field(default_factory=lambda: list(FIXED_TIME_SLOTS))
    lunch_slot: str = LUNCH_SLOT
    # How many randomized attempts the generator runs, keeping the best one.
    # More attempts = higher chance of a fully-scheduled, well-spread timetable.
    generation_attempts: int = DEFAULT_GENERATION_ATTEMPTS
    # When on, auto-fill and slot placement actively spread the workload across
    # faculty and across the week instead of greedily packing the first fit.
    balance_faculty_load: bool = True
    # PDF header customization (official department template).
    dept_name: str = DEFAULT_DEPT_NAME
    college_name: str = DEFAULT_COLLEGE_NAME
    effective_from: Optional[str] = None
    semester_label: Optional[str] = None
    mode_of_class: str = DEFAULT_MODE_OF_CLASS
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---- Year config (sections per stream per year) ----

def _coerce_year_strengths(data: Any) -> Any:
    """Backfill the per-stream strengths from the legacy single
    `strength_per_section` field so older stored docs / API clients keep
    working after the 4-yr vs 6-yr strength split."""
    if isinstance(data, dict):
        legacy = data.get("strength_per_section")
        if legacy is not None:
            data = dict(data)
            data.setdefault("strength_4yr", legacy)
            data.setdefault("strength_6yr", legacy)
    return data


class YearConfigCreate(BaseModel):
    year: int
    sections_4yr: int = 0
    sections_6yr: int = 0
    # 4-yr B.Tech and 6-yr integrated sections can have different strengths.
    strength_4yr: int = 60
    strength_6yr: int = 60

    @model_validator(mode="before")
    @classmethod
    def _backfill_strengths(cls, data):
        return _coerce_year_strengths(data)

class YearConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    year_config_id: str = Field(default_factory=lambda: f"yc_{uuid.uuid4().hex[:12]}")
    session_id: str
    year: int
    sections_4yr: int = 0
    sections_6yr: int = 0
    strength_4yr: int = 60
    strength_6yr: int = 60

    @model_validator(mode="before")
    @classmethod
    def _backfill_strengths(cls, data):
        return _coerce_year_strengths(data)


# ---- Section (auto-generated from YearConfig) ----

class Section(BaseModel):
    model_config = ConfigDict(extra="ignore")
    section_id: str = Field(default_factory=lambda: f"sec_{uuid.uuid4().hex[:12]}")
    session_id: str
    year: int
    stream: str  # "4yr" or "6yr"
    section_number: Optional[int] = None  # null for the single 4yr; 1..N for 6yr
    name: str
    strength: int = 60
    room: Optional[str] = None  # e.g. "GFCL-1"; shown on the official PDF header


class SectionRoomUpdate(BaseModel):
    room: Optional[str] = None


# ---- Faculty ----

class FacultyCreate(BaseModel):
    name: str
    designation: str
    pattern: Optional[str] = None  # required for assistant_professor/adhoc; auto-filled otherwise
    email: Optional[str] = None
    # Subjects this faculty is qualified to teach. Empty list = no restriction.
    subject_ids: List[str] = Field(default_factory=list)
    # Days this faculty is unavailable (e.g. on-leave / off-campus). The generator
    # will never place any of their sessions on these days. Empty = available all week.
    unavailable_days: List[str] = Field(default_factory=list)

class Faculty(BaseModel):
    model_config = ConfigDict(extra="ignore")
    faculty_id: str = Field(default_factory=lambda: f"fac_{uuid.uuid4().hex[:12]}")
    session_id: str
    name: str
    designation: str
    pattern: str
    email: Optional[str] = None
    subject_ids: List[str] = Field(default_factory=list)
    unavailable_days: List[str] = Field(default_factory=list)


# ---- Subject (per-year; applied to all sections of that year) ----

class SubjectCreate(BaseModel):
    name: str
    code: str
    year: int
    requires_lab: bool = False
    # Standalone lab: a lab-credit course not attached to any theory subject
    # (some semesters have these). Implies requires_lab=True and 0 lectures.
    is_lab_only: bool = False
    # How many theory lectures per week this subject needs (credit-dependent).
    # Defaults to 2 to match the previous fixed behaviour.
    lectures_per_week: int = LECTURES_PER_THEORY_PER_WEEK
    # Lab sessions per batch per week (only used when requires_lab is on).
    lab_sessions_per_week: int = LAB_SESSIONS_PER_BATCH_PER_WEEK
    # How many consecutive teaching slots one lab session occupies:
    # 1 = 1h40m, 2 = 3h20m (a full morning block — cannot span lunch).
    lab_duration_slots: int = 1

class Subject(BaseModel):
    model_config = ConfigDict(extra="ignore")
    subject_id: str = Field(default_factory=lambda: f"sub_{uuid.uuid4().hex[:12]}")
    session_id: str
    name: str
    code: str
    year: int
    requires_lab: bool = False
    is_lab_only: bool = False
    lectures_per_week: int = LECTURES_PER_THEORY_PER_WEEK
    lab_sessions_per_week: int = LAB_SESSIONS_PER_BATCH_PER_WEEK
    lab_duration_slots: int = 1


# ---- Faculty Choice (replaces priority allocation) ----

class FacultyChoiceCreate(BaseModel):
    faculty_id: str
    subject_id: str
    section_id: str
    role: str  # "theory" or "lab"
    # Optional slot pinning. If both day and time_slot are given the generator
    # tries to place the session at exactly that slot. If only one is given the
    # generator narrows to that day or that time-slot.
    day: Optional[str] = None
    time_slot: Optional[str] = None

class FacultyChoice(BaseModel):
    model_config = ConfigDict(extra="ignore")
    choice_id: str = Field(default_factory=lambda: f"ch_{uuid.uuid4().hex[:12]}")
    session_id: str
    faculty_id: str
    subject_id: str
    section_id: str
    role: str
    day: Optional[str] = None
    time_slot: Optional[str] = None


# ---- Timetable ----

class TimetableEntry(BaseModel):
    entry_id: str = Field(default_factory=lambda: f"entry_{uuid.uuid4().hex[:12]}")
    day: str
    time_slot: str
    faculty_id: str
    faculty_name: str
    subject_id: str
    subject_name: str
    subject_code: str
    section_id: str
    section_name: str
    section_year: int
    section_stream: str
    batch: Optional[int] = None  # None for theory, 1 or 2 for lab
    is_lab: bool = False
    # Entries belonging to one multi-slot lab session share a group id, so
    # views/exports can merge them into a single block spanning both slots.
    lab_group_id: Optional[str] = None

class Timetable(BaseModel):
    model_config = ConfigDict(extra="ignore")
    timetable_id: str = Field(default_factory=lambda: f"tt_{uuid.uuid4().hex[:12]}")
    session_id: str
    entries: List[TimetableEntry] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = "draft"
    conflicts: List[Dict[str, Any]] = Field(default_factory=list)
    unassigned: List[Dict[str, Any]] = Field(default_factory=list)
    faculty_load: Dict[str, int] = Field(default_factory=dict)


# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_jwt_token(user_id: str, email: str) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

# Authentication has been removed: this is a single shared department workspace.
# Every request acts as the same fixed user, so all sessions/subjects/faculty/
# timetables are visible to anyone who opens the app. This intentionally matches
# the app's single-admin design and removes login/signup entirely.
SHARED_USER = {
    "user_id": "shared",
    "email": "department@local",
    "name": "Department",
    "auth_type": "none",
    "picture": None,
}


async def get_current_user() -> dict:
    return SHARED_USER


# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    existing = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    hashed_password = hash_password(user_data.password)

    user_doc = {
        "user_id": user_id,
        "email": user_data.email,
        "name": user_data.name,
        "password": hashed_password,
        "auth_type": "email",
        "picture": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    await db.users.insert_one(user_doc)
    token = create_jwt_token(user_id, user_data.email)

    return TokenResponse(
        access_token=token,
        user=UserResponse(user_id=user_id, email=user_data.email, name=user_data.name, auth_type="email")
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(user_data: UserLogin):
    user = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user.get("auth_type") == "google":
        raise HTTPException(status_code=400, detail="Please use Google login")

    if not verify_password(user_data.password, user.get("password", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_jwt_token(user["user_id"], user["email"])

    return TokenResponse(
        access_token=token,
        user=UserResponse(
            user_id=user["user_id"], email=user["email"], name=user["name"],
            picture=user.get("picture"), auth_type="email"
        )
    )

@api_router.get("/auth/google/login")
async def google_login():
    """Kick off the Google OAuth 2.0 authorization-code flow by redirecting the
    browser to Google's consent screen."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google login is not configured")

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "online",
        "prompt": "select_account",
    }
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{urlencode(params)}")


@api_router.get("/auth/google/callback")
async def google_callback(code: Optional[str] = None, error: Optional[str] = None):
    """Google redirects back here with an authorization code. We exchange it for
    an access token, fetch the user's profile, upsert the user, issue our own JWT,
    and hand the JWT to the frontend via the URL fragment."""
    if error or not code:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=google_auth_failed")

    try:
        async with httpx.AsyncClient() as client_http:
            token_resp = await client_http.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "redirect_uri": GOOGLE_REDIRECT_URI,
                    "grant_type": "authorization_code",
                },
            )
            if token_resp.status_code != 200:
                logger.error(f"Google token exchange failed: {token_resp.text}")
                return RedirectResponse(f"{FRONTEND_URL}/login?error=token_exchange_failed")

            google_access_token = token_resp.json().get("access_token")
            info_resp = await client_http.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {google_access_token}"},
            )
            if info_resp.status_code != 200:
                return RedirectResponse(f"{FRONTEND_URL}/login?error=userinfo_failed")

            data = info_resp.json()
    except httpx.RequestError as e:
        logger.error(f"Error during Google OAuth: {e}")
        return RedirectResponse(f"{FRONTEND_URL}/login?error=google_auth_error")

    email = data.get("email")
    if not email:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=no_email")
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture")

    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    if existing_user:
        user_id = existing_user["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "name": name,
                "picture": picture,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "auth_type": "google",
            "created_at": datetime.now(timezone.utc).isoformat()
        })

    token = create_jwt_token(user_id, email)
    return RedirectResponse(f"{FRONTEND_URL}/dashboard#token={token}")

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(
        user_id=user["user_id"], email=user["email"], name=user["name"],
        picture=user.get("picture"), auth_type=user.get("auth_type", "email")
    )

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out successfully"}


# ==================== HEALTH ====================

@api_router.get("/health")
async def health_check():
    """Unauthenticated liveness probe (used by the hosting platform)."""
    return {"status": "ok"}


# ==================== META ENDPOINT ====================

@api_router.get("/meta/designations")
async def get_designation_meta(user: dict = Depends(get_current_user)):
    """Returns all faculty designation metadata so the UI can build the dropdown
    without hardcoding the rules."""
    return [
        {
            "value": d,
            "label": DESIGNATION_LABEL[d],
            "category": DESIGNATION_CATEGORY[d],
            "patterns": DESIGNATION_PATTERNS[d],
            "min_hours_per_week": DESIGNATION_MIN_HOURS[d],
            "choice_priority": DESIGNATION_HARD_CHOICE[d],
        }
        for d in DESIGNATIONS
    ]


# ==================== SESSION CONFIG ENDPOINTS ====================

async def _verify_session(session_id: str, user_id: str) -> dict:
    session = await db.sessions.find_one(
        {"session_id": session_id, "user_id": user_id},
        {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def _validate_years(years: List[int]):
    if not years:
        raise HTTPException(status_code=400, detail="Select at least one year")
    for y in years:
        if y not in (1, 2, 3, 4):
            raise HTTPException(status_code=400, detail=f"Invalid year: {y}")


def _clamp_attempts(value: Optional[int], fallback: int) -> int:
    if value is None:
        return fallback
    return max(1, min(MAX_GENERATION_ATTEMPTS, int(value)))


@api_router.post("/sessions", response_model=SessionConfig)
async def create_session(config: SessionConfigCreate, user: dict = Depends(get_current_user)):
    _validate_years(config.years)
    session = SessionConfig(
        user_id=user["user_id"],
        name=config.name,
        years=sorted(set(config.years)),
        generation_attempts=_clamp_attempts(config.generation_attempts, DEFAULT_GENERATION_ATTEMPTS),
        balance_faculty_load=config.balance_faculty_load if config.balance_faculty_load is not None else True,
        dept_name=(config.dept_name or DEFAULT_DEPT_NAME).strip() or DEFAULT_DEPT_NAME,
        college_name=(config.college_name or DEFAULT_COLLEGE_NAME).strip() or DEFAULT_COLLEGE_NAME,
        effective_from=(config.effective_from or "").strip() or None,
        semester_label=(config.semester_label or "").strip() or None,
        mode_of_class=(config.mode_of_class or DEFAULT_MODE_OF_CLASS).strip() or DEFAULT_MODE_OF_CLASS,
    )
    doc = session.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.sessions.insert_one(doc)
    return session

@api_router.get("/sessions", response_model=List[SessionConfig])
async def get_sessions(user: dict = Depends(get_current_user)):
    sessions = await db.sessions.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(100)
    for s in sessions:
        if isinstance(s.get("created_at"), str):
            s["created_at"] = datetime.fromisoformat(s["created_at"])
    return sessions

@api_router.get("/sessions/{session_id}", response_model=SessionConfig)
async def get_session(session_id: str, user: dict = Depends(get_current_user)):
    session = await _verify_session(session_id, user["user_id"])
    if isinstance(session.get("created_at"), str):
        session["created_at"] = datetime.fromisoformat(session["created_at"])
    return session

@api_router.put("/sessions/{session_id}", response_model=SessionConfig)
async def update_session(session_id: str, config: SessionConfigCreate, user: dict = Depends(get_current_user)):
    _validate_years(config.years)
    session = await _verify_session(session_id, user["user_id"])
    updates: Dict[str, Any] = {"name": config.name, "years": sorted(set(config.years))}
    if config.generation_attempts is not None:
        updates["generation_attempts"] = _clamp_attempts(
            config.generation_attempts, session.get("generation_attempts", DEFAULT_GENERATION_ATTEMPTS)
        )
    if config.balance_faculty_load is not None:
        updates["balance_faculty_load"] = bool(config.balance_faculty_load)
    if config.dept_name is not None:
        updates["dept_name"] = config.dept_name.strip() or DEFAULT_DEPT_NAME
    if config.college_name is not None:
        updates["college_name"] = config.college_name.strip() or DEFAULT_COLLEGE_NAME
    if config.effective_from is not None:
        updates["effective_from"] = config.effective_from.strip() or None
    if config.semester_label is not None:
        updates["semester_label"] = config.semester_label.strip() or None
    if config.mode_of_class is not None:
        updates["mode_of_class"] = config.mode_of_class.strip() or DEFAULT_MODE_OF_CLASS
    result = await db.sessions.update_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return await get_session(session_id, user)

@api_router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user: dict = Depends(get_current_user)):
    result = await db.sessions.delete_one({"session_id": session_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.faculty.delete_many({"session_id": session_id})
    await db.sections.delete_many({"session_id": session_id})
    await db.subjects.delete_many({"session_id": session_id})
    await db.year_configs.delete_many({"session_id": session_id})
    await db.faculty_choices.delete_many({"session_id": session_id})
    await db.timetables.delete_many({"session_id": session_id})
    return {"message": "Session deleted"}


# ==================== YEAR CONFIG + AUTO SECTION GENERATION ====================

def _build_sections_for_year(session_id: str, yc: YearConfig) -> List[Section]:
    """Create the canonical Section objects for a YearConfig.

    Labelling:
      - 4-yr stream: if 1 section → "{y}/4 CSE"; if >1 → "{y}/4 CSE - {n}".
      - 6-yr stream: always numbered → "{y}/6 CSE - {n}".
    """
    sections: List[Section] = []

    if yc.sections_4yr == 1:
        sections.append(Section(
            session_id=session_id, year=yc.year, stream="4yr",
            section_number=None, name=f"{yc.year}/4 CSE",
            strength=yc.strength_4yr,
        ))
    elif yc.sections_4yr > 1:
        for i in range(1, yc.sections_4yr + 1):
            sections.append(Section(
                session_id=session_id, year=yc.year, stream="4yr",
                section_number=i, name=f"{yc.year}/4 CSE - {i}",
                strength=yc.strength_4yr,
            ))

    for i in range(1, yc.sections_6yr + 1):
        sections.append(Section(
            session_id=session_id, year=yc.year, stream="6yr",
            section_number=i, name=f"{yc.year}/6 CSE - {i}",
            strength=yc.strength_6yr,
        ))

    return sections


async def _regenerate_sections_for_year(session_id: str, yc: YearConfig):
    """Replace all sections of this (session, year) with freshly generated ones.
    Cascades: deletes faculty_choices that referenced now-deleted sections.
    Room assignments are carried over by section name so re-saving a year
    config doesn't wipe them."""
    old_sections = await db.sections.find(
        {"session_id": session_id, "year": yc.year},
        {"section_id": 1, "name": 1, "room": 1, "_id": 0},
    ).to_list(1000)
    old_section_ids = [s["section_id"] for s in old_sections]
    rooms_by_name = {s["name"]: s.get("room") for s in old_sections if s.get("room")}
    await db.sections.delete_many({"session_id": session_id, "year": yc.year})
    if old_section_ids:
        await db.faculty_choices.delete_many({
            "session_id": session_id,
            "section_id": {"$in": old_section_ids},
        })

    new_sections = _build_sections_for_year(session_id, yc)
    for s in new_sections:
        if s.name in rooms_by_name:
            s.room = rooms_by_name[s.name]
    if new_sections:
        await db.sections.insert_many([s.model_dump() for s in new_sections])


@api_router.get("/sessions/{session_id}/year-configs", response_model=List[YearConfig])
async def get_year_configs(session_id: str, user: dict = Depends(get_current_user)):
    await _verify_session(session_id, user["user_id"])
    rows = await db.year_configs.find({"session_id": session_id}, {"_id": 0}).to_list(100)
    rows.sort(key=lambda x: x.get("year", 0))
    return rows

@api_router.put("/sessions/{session_id}/year-configs/{year}", response_model=YearConfig)
async def upsert_year_config(
    session_id: str,
    year: int,
    payload: YearConfigCreate,
    user: dict = Depends(get_current_user),
):
    session = await _verify_session(session_id, user["user_id"])
    if year not in session.get("years", []):
        raise HTTPException(status_code=400, detail="This year is not selected for the session")
    if payload.year != year:
        raise HTTPException(status_code=400, detail="Year mismatch")
    if payload.sections_4yr < 0 or payload.sections_6yr < 0:
        raise HTTPException(status_code=400, detail="Section counts cannot be negative")
    if payload.sections_4yr + payload.sections_6yr == 0:
        raise HTTPException(status_code=400, detail="Add at least one section (4-yr or 6-yr)")
    if payload.sections_4yr > 0 and payload.strength_4yr < 2:
        raise HTTPException(status_code=400, detail="4-yr section strength must be at least 2 (for 2 batches)")
    if payload.sections_6yr > 0 and payload.strength_6yr < 2:
        raise HTTPException(status_code=400, detail="6-yr section strength must be at least 2 (for 2 batches)")

    existing = await db.year_configs.find_one(
        {"session_id": session_id, "year": year}, {"_id": 0}
    )
    if existing:
        yc = YearConfig(
            year_config_id=existing["year_config_id"],
            session_id=session_id,
            year=year,
            sections_4yr=payload.sections_4yr,
            sections_6yr=payload.sections_6yr,
            strength_4yr=payload.strength_4yr,
            strength_6yr=payload.strength_6yr,
        )
        await db.year_configs.update_one(
            {"session_id": session_id, "year": year},
            {"$set": yc.model_dump()},
        )
    else:
        yc = YearConfig(
            session_id=session_id, year=year,
            sections_4yr=payload.sections_4yr,
            sections_6yr=payload.sections_6yr,
            strength_4yr=payload.strength_4yr,
            strength_6yr=payload.strength_6yr,
        )
        await db.year_configs.insert_one(yc.model_dump())

    await _regenerate_sections_for_year(session_id, yc)
    return yc

@api_router.delete("/sessions/{session_id}/year-configs/{year}")
async def delete_year_config(session_id: str, year: int, user: dict = Depends(get_current_user)):
    await _verify_session(session_id, user["user_id"])
    await db.year_configs.delete_one({"session_id": session_id, "year": year})
    old_section_ids = [
        s["section_id"]
        for s in await db.sections.find(
            {"session_id": session_id, "year": year}, {"section_id": 1, "_id": 0}
        ).to_list(1000)
    ]
    await db.sections.delete_many({"session_id": session_id, "year": year})
    if old_section_ids:
        await db.faculty_choices.delete_many({
            "session_id": session_id,
            "section_id": {"$in": old_section_ids},
        })
    return {"message": "Year config cleared"}


# ==================== SECTION ENDPOINTS (read-only; auto-managed) ====================

@api_router.get("/sessions/{session_id}/sections", response_model=List[Section])
async def get_sections(session_id: str, user: dict = Depends(get_current_user)):
    await _verify_session(session_id, user["user_id"])
    sections = await db.sections.find({"session_id": session_id}, {"_id": 0}).to_list(1000)
    sections.sort(key=lambda s: (s.get("year", 0), s.get("stream", ""), s.get("section_number") or 0))
    return sections


@api_router.put("/sessions/{session_id}/sections/{section_id}/room", response_model=Section)
async def update_section_room(
    session_id: str, section_id: str, payload: SectionRoomUpdate,
    user: dict = Depends(get_current_user),
):
    """Sections themselves are auto-managed, but the room number is a free
    customization shown on the official PDF header."""
    await _verify_session(session_id, user["user_id"])
    room = (payload.room or "").strip() or None
    result = await db.sections.update_one(
        {"section_id": section_id, "session_id": session_id},
        {"$set": {"room": room}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Section not found")
    return await db.sections.find_one({"section_id": section_id}, {"_id": 0})


# ==================== FACULTY ENDPOINTS ====================

def _normalize_faculty_pattern(designation: str, pattern: Optional[str]) -> str:
    if designation not in DESIGNATION_PATTERNS:
        raise HTTPException(status_code=400, detail=f"Unknown designation: {designation}")
    allowed = DESIGNATION_PATTERNS[designation]
    # Empty string / whitespace is treated the same as None — auto-pick allowed[0].
    if pattern is None or not str(pattern).strip():
        return allowed[0]
    if pattern not in allowed:
        # Designations with a single allowed pattern don't really have a choice;
        # accept anything and silently coerce to the allowed one. (Senior /
        # Associate Professors only ever have one pattern.)
        if len(allowed) == 1:
            return allowed[0]
        raise HTTPException(
            status_code=400,
            detail=f"Pattern {pattern!r} not allowed for {DESIGNATION_LABEL[designation]}. Allowed: {allowed}",
        )
    return pattern


async def _validate_subject_ids(session_id: str, subject_ids: List[str]) -> List[str]:
    if not subject_ids:
        return []
    unique = list(dict.fromkeys(subject_ids))  # dedupe, preserve order
    found = await db.subjects.find(
        {"session_id": session_id, "subject_id": {"$in": unique}}, {"subject_id": 1, "_id": 0}
    ).to_list(1000)
    found_ids = {s["subject_id"] for s in found}
    missing = [sid for sid in unique if sid not in found_ids]
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown subject_id(s): {missing}")
    return unique


def _validate_days(session: dict, days: List[str]) -> List[str]:
    """Keep only valid working days, deduped and in canonical order."""
    if not days:
        return []
    working = session.get("working_days", FIXED_WORKING_DAYS)
    invalid = [d for d in days if d not in working]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Not working day(s): {invalid}. Allowed: {working}")
    return [d for d in working if d in set(days)]


@api_router.post("/sessions/{session_id}/faculty", response_model=Faculty)
async def create_faculty(session_id: str, faculty_data: FacultyCreate, user: dict = Depends(get_current_user)):
    session = await _verify_session(session_id, user["user_id"])
    pattern = _normalize_faculty_pattern(faculty_data.designation, faculty_data.pattern)
    subject_ids = await _validate_subject_ids(session_id, faculty_data.subject_ids)
    unavailable_days = _validate_days(session, faculty_data.unavailable_days)
    if len(unavailable_days) >= len(session.get("working_days", FIXED_WORKING_DAYS)):
        raise HTTPException(status_code=400, detail="Faculty must be available on at least one working day")
    faculty = Faculty(
        session_id=session_id,
        name=faculty_data.name,
        designation=faculty_data.designation,
        pattern=pattern,
        email=faculty_data.email,
        subject_ids=subject_ids,
        unavailable_days=unavailable_days,
    )
    await db.faculty.insert_one(faculty.model_dump())
    return faculty

@api_router.get("/sessions/{session_id}/faculty", response_model=List[Faculty])
async def get_faculty(session_id: str, user: dict = Depends(get_current_user)):
    await _verify_session(session_id, user["user_id"])
    faculty = await db.faculty.find({"session_id": session_id}, {"_id": 0}).to_list(1000)
    # Stable ordering: category, then name
    faculty.sort(key=lambda f: (DESIGNATION_CATEGORY.get(f.get("designation", ""), 99), f.get("name", "")))
    return faculty

@api_router.put("/sessions/{session_id}/faculty/{faculty_id}", response_model=Faculty)
async def update_faculty(
    session_id: str, faculty_id: str, faculty_data: FacultyCreate,
    user: dict = Depends(get_current_user)
):
    session = await _verify_session(session_id, user["user_id"])
    pattern = _normalize_faculty_pattern(faculty_data.designation, faculty_data.pattern)
    subject_ids = await _validate_subject_ids(session_id, faculty_data.subject_ids)
    unavailable_days = _validate_days(session, faculty_data.unavailable_days)
    if len(unavailable_days) >= len(session.get("working_days", FIXED_WORKING_DAYS)):
        raise HTTPException(status_code=400, detail="Faculty must be available on at least one working day")
    result = await db.faculty.update_one(
        {"faculty_id": faculty_id, "session_id": session_id},
        {"$set": {
            "name": faculty_data.name,
            "designation": faculty_data.designation,
            "pattern": pattern,
            "email": faculty_data.email,
            "subject_ids": subject_ids,
            "unavailable_days": unavailable_days,
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Faculty not found")
    faculty = await db.faculty.find_one({"faculty_id": faculty_id}, {"_id": 0})
    return faculty

@api_router.delete("/sessions/{session_id}/faculty/{faculty_id}")
async def delete_faculty(session_id: str, faculty_id: str, user: dict = Depends(get_current_user)):
    result = await db.faculty.delete_one({"faculty_id": faculty_id, "session_id": session_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Faculty not found")
    await db.faculty_choices.delete_many({"session_id": session_id, "faculty_id": faculty_id})
    return {"message": "Faculty deleted"}


# ==================== SUBJECT ENDPOINTS ====================

def _normalize_subject_payload(data: SubjectCreate) -> SubjectCreate:
    """Coerce + validate a subject payload. A standalone lab ('Add Lab') is a
    lab-credit course not attached to any theory subject: it always has a lab
    and never has lectures."""
    if data.is_lab_only:
        data.requires_lab = True
        data.lectures_per_week = 0
        if data.lab_sessions_per_week < 1:
            data.lab_sessions_per_week = 1
    if data.lectures_per_week < 0 or data.lectures_per_week > 6:
        raise HTTPException(status_code=400, detail="Lectures/week must be between 0 and 6")
    if data.lab_sessions_per_week < 0 or data.lab_sessions_per_week > 4:
        raise HTTPException(status_code=400, detail="Lab sessions/week must be between 0 and 4")
    if not data.requires_lab and data.lectures_per_week == 0:
        raise HTTPException(status_code=400, detail="A subject with no lab needs at least 1 lecture/week")
    if data.requires_lab and data.lab_sessions_per_week == 0 and data.lectures_per_week == 0:
        raise HTTPException(status_code=400, detail="Subject has neither lectures nor lab sessions")
    if data.lab_duration_slots not in (1, 2):
        raise HTTPException(status_code=400, detail="Lab duration must be 1 slot (1h40m) or 2 slots (3h20m)")
    return data


async def _check_duplicate_subject_code(session_id: str, code: str, year: int, exclude_id: Optional[str] = None):
    query = {"session_id": session_id, "year": year, "code": code}
    if exclude_id:
        query["subject_id"] = {"$ne": exclude_id}
    existing = await db.subjects.find_one(query, {"_id": 0, "subject_id": 1})
    if existing:
        raise HTTPException(status_code=400, detail=f"A year-{year} subject with code {code!r} already exists")


@api_router.post("/sessions/{session_id}/subjects", response_model=Subject)
async def create_subject(session_id: str, subject_data: SubjectCreate, user: dict = Depends(get_current_user)):
    session = await _verify_session(session_id, user["user_id"])
    if subject_data.year not in session.get("years", []):
        raise HTTPException(status_code=400, detail="Subject year not in selected session years")
    subject_data = _normalize_subject_payload(subject_data)
    await _check_duplicate_subject_code(session_id, subject_data.code, subject_data.year)
    subject = Subject(session_id=session_id, **subject_data.model_dump())
    await db.subjects.insert_one(subject.model_dump())
    return subject

@api_router.get("/sessions/{session_id}/subjects", response_model=List[Subject])
async def get_subjects(session_id: str, user: dict = Depends(get_current_user)):
    await _verify_session(session_id, user["user_id"])
    subjects = await db.subjects.find({"session_id": session_id}, {"_id": 0}).to_list(1000)
    subjects.sort(key=lambda s: (s.get("year", 0), s.get("code", "")))
    return subjects

@api_router.put("/sessions/{session_id}/subjects/{subject_id}", response_model=Subject)
async def update_subject(session_id: str, subject_id: str, subject_data: SubjectCreate, user: dict = Depends(get_current_user)):
    session = await _verify_session(session_id, user["user_id"])
    if subject_data.year not in session.get("years", []):
        raise HTTPException(status_code=400, detail="Subject year not in selected session years")
    subject_data = _normalize_subject_payload(subject_data)
    await _check_duplicate_subject_code(session_id, subject_data.code, subject_data.year, exclude_id=subject_id)
    old = await db.subjects.find_one({"subject_id": subject_id, "session_id": session_id}, {"_id": 0})
    if not old:
        raise HTTPException(status_code=404, detail="Subject not found")
    await db.subjects.update_one(
        {"subject_id": subject_id, "session_id": session_id},
        {"$set": subject_data.model_dump()}
    )
    # Cascade-clean faculty choices that the edit made invalid: lab choices for
    # a subject that no longer has a lab, and choices pointing at sections of
    # the old year after the subject moved to another year.
    if old.get("requires_lab") and not subject_data.requires_lab:
        await db.faculty_choices.delete_many(
            {"session_id": session_id, "subject_id": subject_id, "role": "lab"}
        )
    if old.get("year") != subject_data.year:
        valid_section_ids = [
            s["section_id"]
            for s in await db.sections.find(
                {"session_id": session_id, "year": subject_data.year},
                {"section_id": 1, "_id": 0},
            ).to_list(1000)
        ]
        await db.faculty_choices.delete_many({
            "session_id": session_id,
            "subject_id": subject_id,
            "section_id": {"$nin": valid_section_ids},
        })
    subject = await db.subjects.find_one({"subject_id": subject_id}, {"_id": 0})
    return subject

@api_router.delete("/sessions/{session_id}/subjects/{subject_id}")
async def delete_subject(session_id: str, subject_id: str, user: dict = Depends(get_current_user)):
    result = await db.subjects.delete_one({"subject_id": subject_id, "session_id": session_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Subject not found")
    await db.faculty_choices.delete_many({"session_id": session_id, "subject_id": subject_id})
    return {"message": "Subject deleted"}


# ==================== FACULTY CHOICE ENDPOINTS ====================

@api_router.post("/sessions/{session_id}/faculty-choices", response_model=FacultyChoice)
async def create_faculty_choice(session_id: str, payload: FacultyChoiceCreate, user: dict = Depends(get_current_user)):
    session = await _verify_session(session_id, user["user_id"])
    if payload.role not in ("theory", "lab"):
        raise HTTPException(status_code=400, detail="role must be 'theory' or 'lab'")
    faculty = await db.faculty.find_one({"faculty_id": payload.faculty_id, "session_id": session_id}, {"_id": 0})
    subject = await db.subjects.find_one({"subject_id": payload.subject_id, "session_id": session_id}, {"_id": 0})
    section = await db.sections.find_one({"section_id": payload.section_id, "session_id": session_id}, {"_id": 0})
    if not (faculty and subject and section):
        raise HTTPException(status_code=400, detail="Invalid faculty/subject/section reference")
    if subject["year"] != section["year"]:
        raise HTTPException(status_code=400, detail="Subject year and section year mismatch")
    if payload.role == "lab" and not subject.get("requires_lab"):
        raise HTTPException(status_code=400, detail="This subject has no lab")
    if payload.role == "theory" and subject.get("is_lab_only"):
        raise HTTPException(status_code=400, detail="This is a standalone lab — it has no theory sessions")

    days = session.get("working_days", FIXED_WORKING_DAYS)
    slots = session.get("time_slots", FIXED_TIME_SLOTS)
    if payload.day and payload.day not in days:
        raise HTTPException(status_code=400, detail=f"Day {payload.day!r} is not a working day. Allowed: {days}")
    if payload.time_slot and payload.time_slot not in slots:
        raise HTTPException(status_code=400, detail=f"Time slot {payload.time_slot!r} is not configured. Allowed: {slots}")

    existing = await db.faculty_choices.find_one({
        "session_id": session_id,
        "faculty_id": payload.faculty_id,
        "subject_id": payload.subject_id,
        "section_id": payload.section_id,
        "role": payload.role,
        "day": payload.day,
        "time_slot": payload.time_slot,
    }, {"_id": 0})
    if existing:
        return existing
    choice = FacultyChoice(session_id=session_id, **payload.model_dump())
    await db.faculty_choices.insert_one(choice.model_dump())
    return choice

@api_router.get("/sessions/{session_id}/faculty-choices", response_model=List[FacultyChoice])
async def list_faculty_choices(session_id: str, user: dict = Depends(get_current_user)):
    await _verify_session(session_id, user["user_id"])
    return await db.faculty_choices.find({"session_id": session_id}, {"_id": 0}).to_list(2000)

@api_router.delete("/sessions/{session_id}/faculty-choices/{choice_id}")
async def delete_faculty_choice(session_id: str, choice_id: str, user: dict = Depends(get_current_user)):
    result = await db.faculty_choices.delete_one({"choice_id": choice_id, "session_id": session_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Choice not found")
    return {"message": "Choice deleted"}


# ==================== GENERATOR ====================
#
# Demand model:
#   For each (subject, section) where section.year == subject.year:
#     - 2 theory sessions (lecture) — whole section, batch=None
#     - if requires_lab: 1 lab session for batch=1 and 1 for batch=2
#
# Faculty assignment:
#   A faculty's pattern (e.g. "2T+2L") gives a cap on:
#     - number of distinct (subject, section) THEORY assignments
#     - number of distinct (subject, section) LAB assignments
#   For each lab assignment, the same faculty teaches both batches.
#
# Priority of assignment:
#   1. Hard choices: cat 1 → cat 2 → cat 3 (in that order).
#   2. Then fill remaining demand: cat 1..5 in pattern-capacity order, with cat
#      4/5 *soft* choices honored when possible.
#
# Slot placement constraints:
#   - Faculty cannot be in two places at the same (day, slot).
#   - For a section at (day, slot): either a lecture (locks both batches) OR
#     up to two labs (one per batch). No lecture if any batch is in lab; no lab
#     for batch K if a lecture is scheduled.
#   - Batch K of section S cannot be in two labs at the same (day, slot).


def _faculty_pattern_caps(faculty: dict) -> Dict[str, int]:
    counts = PATTERN_COUNTS.get(faculty.get("pattern", ""), {"theory": 0, "lab": 0})
    return {"theory": counts["theory"], "lab": counts["lab"]}


def _build_demand(subjects: List[dict], sections: List[dict]) -> List[dict]:
    """One row per (subject, section, role[, batch])."""
    demand: List[dict] = []
    sections_by_year: Dict[int, List[dict]] = {}
    for s in sections:
        sections_by_year.setdefault(s["year"], []).append(s)

    for subj in subjects:
        secs = sections_by_year.get(subj["year"], [])
        n_theory = int(subj.get("lectures_per_week", LECTURES_PER_THEORY_PER_WEEK))
        n_lab = int(subj.get("lab_sessions_per_week", LAB_SESSIONS_PER_BATCH_PER_WEEK))
        for sec in secs:
            for _ in range(max(0, n_theory)):
                demand.append({
                    "subject_id": subj["subject_id"],
                    "section_id": sec["section_id"],
                    "role": "theory",
                    "batch": None,
                })
            if subj.get("requires_lab"):
                duration = 2 if int(subj.get("lab_duration_slots", 1) or 1) >= 2 else 1
                for batch in range(1, BATCHES_PER_SECTION + 1):
                    for _ in range(max(0, n_lab)):
                        demand.append({
                            "subject_id": subj["subject_id"],
                            "section_id": sec["section_id"],
                            "role": "lab",
                            "batch": batch,
                            "duration": duration,
                        })
    return demand


def _assign_faculty_to_demand(
    demand: List[dict],
    faculty_list: List[dict],
    choices: List[dict],
    rng: random.Random,
    balance: bool = True,
) -> Tuple[Dict[Tuple[str, str, str], str], List[dict]]:
    """Return:
      - mapping: (subject_id, section_id, role) → faculty_id
      - unassigned: list of (subject_id, section_id, role) that couldn't be assigned
    """
    # Unique assignment keys (theory has 2 sessions but counts as 1 assignment).
    assignment_keys = set()
    for d in demand:
        assignment_keys.add((d["subject_id"], d["section_id"], d["role"]))

    # Cap tracker: faculty_id → {"theory": remaining, "lab": remaining}
    caps: Dict[str, Dict[str, int]] = {
        f["faculty_id"]: dict(_faculty_pattern_caps(f)) for f in faculty_list
    }

    assignment: Dict[Tuple[str, str, str], str] = {}

    # 1. Hard choices (cat 1, 2, 3) in priority order. Explicit choices always
    # win over a faculty's subject_ids whitelist.
    by_fac = {f["faculty_id"]: f for f in faculty_list}
    choices_sorted = sorted(
        [c for c in choices if by_fac.get(c["faculty_id"]) and
         DESIGNATION_HARD_CHOICE.get(by_fac[c["faculty_id"]]["designation"], False)],
        key=lambda c: DESIGNATION_CATEGORY[by_fac[c["faculty_id"]]["designation"]],
    )
    for ch in choices_sorted:
        key = (ch["subject_id"], ch["section_id"], ch["role"])
        if key not in assignment_keys or key in assignment:
            continue
        fac_id = ch["faculty_id"]
        if caps.get(fac_id, {}).get(ch["role"], 0) <= 0:
            continue
        assignment[key] = fac_id
        caps[fac_id][ch["role"]] -= 1

    # 2. Soft preferences (cat 4, 5).
    soft_choices = [
        c for c in choices if by_fac.get(c["faculty_id"]) and
        not DESIGNATION_HARD_CHOICE.get(by_fac[c["faculty_id"]]["designation"], False)
    ]
    rng.shuffle(soft_choices)
    for ch in soft_choices:
        key = (ch["subject_id"], ch["section_id"], ch["role"])
        if key not in assignment_keys or key in assignment:
            continue
        fac_id = ch["faculty_id"]
        if caps.get(fac_id, {}).get(ch["role"], 0) <= 0:
            continue
        assignment[key] = fac_id
        caps[fac_id][ch["role"]] -= 1

    # 3. Auto-fill remaining assignments — eligible faculty pool in category order.
    # Faculty with a non-empty `subject_ids` list are restricted: they can only be
    # auto-assigned to subjects on that list. Empty list = can teach anything.
    sorted_faculty = sorted(
        faculty_list,
        key=lambda f: (DESIGNATION_CATEGORY.get(f.get("designation", ""), 99), f.get("name", "")),
    )

    def _eligible(f: dict, subject_id: str) -> bool:
        allowed = f.get("subject_ids") or []
        return (not allowed) or (subject_id in allowed)

    def _pick(candidates: List[dict], role: str) -> Optional[dict]:
        """Pick a faculty from candidates that still has capacity for `role`.

        When balancing, prefer whoever has the MOST remaining capacity for this
        role (spreads load evenly so no one is exhausted while others sit idle);
        category order breaks ties so seniority still gets first refusal. Without
        balancing, fall back to strict category order (the original behaviour)."""
        usable = [f for f in candidates if caps.get(f["faculty_id"], {}).get(role, 0) > 0]
        if not usable:
            return None
        if not balance:
            return usable[0]  # candidates already sorted by category, then name
        return max(
            usable,
            key=lambda f: (
                caps[f["faculty_id"]][role],
                -DESIGNATION_CATEGORY.get(f.get("designation", ""), 99),
                rng.random(),
            ),
        )

    unassigned_keys = [k for k in assignment_keys if k not in assignment]
    rng.shuffle(unassigned_keys)
    for key in unassigned_keys:
        subject_id, _section_id, role = key
        # First pass: respect each faculty's subject whitelist.
        chosen = _pick([f for f in sorted_faculty if _eligible(f, subject_id)], role)
        # Fallback: if no whitelisted faculty has capacity, allow anyone with
        # capacity so the timetable doesn't fail outright. The fallback is
        # surfaced as a warning via faculty_load / unassigned list elsewhere.
        if chosen is None:
            chosen = _pick(sorted_faculty, role)
        if chosen is not None:
            assignment[key] = chosen["faculty_id"]
            caps[chosen["faculty_id"]][role] -= 1

    unassigned = [
        {"subject_id": k[0], "section_id": k[1], "role": k[2],
         "reason": "no faculty with remaining capacity for this role"}
        for k in assignment_keys if k not in assignment
    ]
    return assignment, unassigned


class _SlotBoard:
    """Tracks slot usage to enforce non-overlap constraints."""

    def __init__(self):
        # (faculty_id, day, slot) → entry_id
        self.faculty: Dict[Tuple[str, str, str], str] = {}
        # (section_id, day, slot) → "lecture" or "lab"
        self.section_mode: Dict[Tuple[str, str, str], str] = {}
        # (section_id, batch, day, slot) → entry_id
        self.batch: Dict[Tuple[str, int, str, str], str] = {}

    def can_place(self, *, faculty_id: str, section_id: str, batch: Optional[int],
                  is_lab: bool, day: str, slot: str) -> Optional[str]:
        if (faculty_id, day, slot) in self.faculty:
            return "faculty busy"
        existing_mode = self.section_mode.get((section_id, day, slot))
        if not is_lab:
            # Lecture needs the whole section free.
            if existing_mode is not None:
                return f"section busy ({existing_mode})"
        else:
            if existing_mode == "lecture":
                return "section in lecture"
            # Same batch already in another lab here?
            if (section_id, batch, day, slot) in self.batch:
                return f"batch {batch} busy"
        return None

    def place(self, *, faculty_id: str, section_id: str, batch: Optional[int],
              is_lab: bool, day: str, slot: str, entry_id: str):
        self.faculty[(faculty_id, day, slot)] = entry_id
        if not is_lab:
            self.section_mode[(section_id, day, slot)] = "lecture"
        else:
            self.section_mode[(section_id, day, slot)] = "lab"
            self.batch[(section_id, batch, day, slot)] = entry_id


def _generate_core(
    session: dict,
    faculty_list: List[dict],
    sections: List[dict],
    subjects: List[dict],
    choices: List[dict],
    rng_seed: Any = None,
) -> Timetable:
    rng = random.Random(rng_seed if rng_seed is not None else session["session_id"])
    balance = session.get("balance_faculty_load", True)

    demand = _build_demand(subjects, sections)
    assignment, unassigned = _assign_faculty_to_demand(demand, faculty_list, choices, rng, balance=balance)

    fac_map = {f["faculty_id"]: f for f in faculty_list}
    sub_map = {s["subject_id"]: s for s in subjects}
    sec_map = {s["section_id"]: s for s in sections}

    # Slot pins from choices, indexed by (subject_id, section_id, role) → list of
    # (day, time_slot) pairs (either component may be None for partial pins).
    # Each pin is consumed at most once so two sessions of the same theory subject
    # can each take a different pin.
    pins_by_key: Dict[Tuple[str, str, str], List[Tuple[Optional[str], Optional[str]]]] = {}
    for ch in choices:
        if not (ch.get("day") or ch.get("time_slot")):
            continue
        key = (ch["subject_id"], ch["section_id"], ch["role"])
        pins_by_key.setdefault(key, []).append((ch.get("day"), ch.get("time_slot")))

    # Expand demand into individual session-instances and attach faculty.
    instances: List[dict] = []
    drop = []
    for d in demand:
        key = (d["subject_id"], d["section_id"], d["role"])
        fac_id = assignment.get(key)
        if not fac_id:
            drop.append({
                "subject_id": d["subject_id"], "section_id": d["section_id"],
                "role": d["role"], "batch": d.get("batch"),
                "reason": "faculty not assigned",
            })
            continue
        # Attach one available pin (popped) if any, so each pin maps to a single
        # instance even when the same (subject, section, role) has multiple
        # demand rows (e.g. theory has 2 sessions/week).
        pin_day, pin_slot = (None, None)
        pin_list = pins_by_key.get(key)
        if pin_list:
            pin_day, pin_slot = pin_list.pop(0)
        instances.append({**d, "faculty_id": fac_id, "pin_day": pin_day, "pin_slot": pin_slot})

    # Placement order, most-constrained first so the tight items grab their few
    # legal slots before the grid fills up:
    #   1. pinned (day and/or slot fixed)  2. labs (batch + section locked)
    #   3. theory. Within each bucket we shuffle for per-seed variety.
    def _bucket(i: dict) -> int:
        if i.get("pin_day") or i.get("pin_slot"):
            return 0
        return 1 if i["role"] == "lab" else 2

    for b in (0, 1, 2):
        bucket = [i for i in instances if _bucket(i) == b]
        rng.shuffle(bucket)
        # Double-length labs have far fewer legal slots — place them first.
        bucket.sort(key=lambda i: -int(i.get("duration", 1)))
        if b == 0:
            ordered_pinned = bucket
        elif b == 1:
            ordered_labs = bucket
        else:
            ordered_theory = bucket
    instances = ordered_pinned + ordered_labs + ordered_theory

    board = _SlotBoard()
    entries: List[TimetableEntry] = []
    days = session.get("working_days", FIXED_WORKING_DAYS)
    slots = session.get("time_slots", FIXED_TIME_SLOTS)
    unavailable = {
        f["faculty_id"]: set(f.get("unavailable_days") or []) for f in faculty_list
    }

    day_slot_pairs = [(d, s) for d in days for s in slots]
    # Running per-day counts used to spread sessions across the week instead of
    # piling them onto whichever day happens to be tried first.
    fac_day_count: Dict[Tuple[str, str], int] = {}
    sec_day_count: Dict[Tuple[str, str], int] = {}

    # Slot indices a 2-slot lab may start at: the next slot must exist and the
    # pair must not straddle lunch (lunch sits after LUNCH_AFTER_SLOT_INDEX).
    slot_index = {s: i for i, s in enumerate(slots)}
    double_starts = {
        slots[i] for i in range(len(slots) - 1) if i != LUNCH_AFTER_SLOT_INDEX
    }

    failed: List[dict] = []
    for inst in instances:
        faculty = fac_map[inst["faculty_id"]]
        subject = sub_map[inst["subject_id"]]
        section = sec_map[inst["section_id"]]
        is_lab = (inst["role"] == "lab")
        duration = int(inst.get("duration", 1) or 1)
        fac_id = faculty["faculty_id"]
        sec_id = section["section_id"]

        # Decide which (day, slot) pairs to try, in order:
        #  - Fully-pinned (day + slot): only that one pair.
        #  - Day-only: every slot on that day (in canonical slot order).
        #  - Slot-only: every day at that slot.
        #  - Unpinned: full grid, spread-ordered (or shuffled when balancing off).
        pin_day, pin_slot = inst.get("pin_day"), inst.get("pin_slot")
        if pin_day and pin_slot:
            pairs = [(pin_day, pin_slot)]
        elif pin_day:
            pairs = [(pin_day, s) for s in slots]
        elif pin_slot:
            pairs = [(d, pin_slot) for d in days]
        else:
            pairs = list(day_slot_pairs)
            rng.shuffle(pairs)
            if balance:
                # Prefer days where this faculty AND this section are least busy
                # so the week stays evenly loaded; random tiebreak keeps variety.
                pairs.sort(
                    key=lambda ds: fac_day_count.get((fac_id, ds[0]), 0)
                    + sec_day_count.get((sec_id, ds[0]), 0)
                )

        # Never place on a day the faculty is unavailable.
        bad_days = unavailable.get(fac_id)
        if bad_days:
            pairs = [p for p in pairs if p[0] not in bad_days]

        # A double-length lab can only start where a contiguous second slot
        # exists on the same side of lunch.
        if duration == 2:
            pairs = [p for p in pairs if p[1] in double_starts]

        placed = False
        for day, slot in pairs:
            covered = [slot]
            if duration == 2:
                covered.append(slots[slot_index[slot] + 1])
            if any(
                board.can_place(
                    faculty_id=fac_id, section_id=sec_id, batch=inst.get("batch"),
                    is_lab=is_lab, day=day, slot=s,
                ) is not None
                for s in covered
            ):
                continue
            group_id = f"grp_{uuid.uuid4().hex[:12]}" if duration == 2 else None
            for s in covered:
                entry = TimetableEntry(
                    day=day, time_slot=s,
                    faculty_id=fac_id, faculty_name=faculty["name"],
                    subject_id=subject["subject_id"], subject_name=subject["name"],
                    subject_code=subject["code"],
                    section_id=sec_id, section_name=section["name"],
                    section_year=section["year"], section_stream=section["stream"],
                    batch=inst.get("batch"),
                    is_lab=is_lab,
                    lab_group_id=group_id,
                )
                board.place(
                    faculty_id=fac_id,
                    section_id=sec_id,
                    batch=inst.get("batch"),
                    is_lab=is_lab, day=day, slot=s, entry_id=entry.entry_id,
                )
                entries.append(entry)
            fac_day_count[(fac_id, day)] = fac_day_count.get((fac_id, day), 0) + duration
            sec_day_count[(sec_id, day)] = sec_day_count.get((sec_id, day), 0) + duration
            placed = True
            break

        if not placed:
            reason = "no free slot satisfies faculty + section + batch constraints"
            if duration == 2:
                reason = "no contiguous double slot (lab needs 2 back-to-back periods on one side of lunch)"
            if bad_days:
                reason += " (faculty has limited availability)"
            failed.append({
                "subject_id": inst["subject_id"], "section_id": inst["section_id"],
                "role": inst["role"], "batch": inst.get("batch"),
                "faculty_id": fac_id,
                "reason": reason,
            })

    unassigned.extend(drop)
    unassigned.extend(failed)

    faculty_load: Dict[str, int] = {f["faculty_id"]: 0 for f in faculty_list}
    for e in entries:
        faculty_load[e.faculty_id] = faculty_load.get(e.faculty_id, 0) + 1

    return Timetable(
        session_id=session["session_id"],
        entries=entries,
        conflicts=[],
        unassigned=unassigned,
        faculty_load=faculty_load,
    )


def _timetable_score(tt: Timetable) -> Tuple[int, int]:
    """Lower is better. Primary: fewest unscheduled demand items. Secondary:
    most even faculty load (sum of squares — minimised when load is balanced)."""
    load_spread = sum(v * v for v in tt.faculty_load.values())
    return (len(tt.unassigned), load_spread)


def _generate_best(
    session: dict,
    faculty_list: List[dict],
    sections: List[dict],
    subjects: List[dict],
    choices: List[dict],
) -> Timetable:
    """Run several independent randomized attempts and keep the best result.

    Each attempt is fully deterministic for its seed, and the seeds are derived
    from the session id, so the same inputs always produce the same timetable —
    but trying many seeds dramatically raises the chance of a clash-free,
    fully-scheduled outcome compared to a single greedy pass."""
    attempts = max(1, min(MAX_GENERATION_ATTEMPTS, int(session.get("generation_attempts", DEFAULT_GENERATION_ATTEMPTS))))
    session_id = session["session_id"]

    best: Optional[Timetable] = None
    best_score: Optional[Tuple[int, int]] = None
    for i in range(attempts):
        # String seeds keep every attempt reproducible across restarts while
        # still exploring a different randomized layout each time.
        candidate = _generate_core(
            session, faculty_list, sections, subjects, choices, rng_seed=f"{session_id}-{i}"
        )
        score = _timetable_score(candidate)
        if best_score is None or score < best_score:
            best, best_score = candidate, score
        if score[0] == 0:
            break  # fully scheduled — no need to keep searching
    return best


@api_router.post("/sessions/{session_id}/generate-timetable")
async def generate_timetable(session_id: str, user: dict = Depends(get_current_user)):
    session = await _verify_session(session_id, user["user_id"])
    faculty_list = await db.faculty.find({"session_id": session_id}, {"_id": 0}).to_list(1000)
    sections = await db.sections.find({"session_id": session_id}, {"_id": 0}).to_list(1000)
    subjects = await db.subjects.find({"session_id": session_id}, {"_id": 0}).to_list(1000)
    choices = await db.faculty_choices.find({"session_id": session_id}, {"_id": 0}).to_list(2000)

    if not faculty_list:
        raise HTTPException(status_code=400, detail="Add faculty before generating")
    if not sections:
        raise HTTPException(status_code=400, detail="Configure year sections before generating")
    if not subjects:
        raise HTTPException(status_code=400, detail="Add subjects before generating")

    timetable = _generate_best(session, faculty_list, sections, subjects, choices)

    doc = timetable.model_dump()
    doc["generated_at"] = doc["generated_at"].isoformat()
    # Entries already serialized via model_dump
    await db.timetables.delete_many({"session_id": session_id})
    await db.timetables.insert_one(doc)

    return {
        "timetable_id": timetable.timetable_id,
        "entries_count": len(timetable.entries),
        "unassigned_count": len(timetable.unassigned),
        "unassigned": timetable.unassigned,
        "faculty_load": timetable.faculty_load,
    }


def _compute_feasibility(
    session: dict,
    faculty_list: List[dict],
    sections: List[dict],
    subjects: List[dict],
) -> dict:
    """Static, pre-generation capacity check. Compares the weekly demand the
    inputs imply against what the faculty pool and the weekly grid can hold, and
    returns human-readable warnings the professor can act on before generating."""
    days = session.get("working_days", FIXED_WORKING_DAYS)
    slots = session.get("time_slots", FIXED_TIME_SLOTS)
    cells_per_section = len(days) * len(slots)

    sections_by_year: Dict[int, List[dict]] = {}
    for s in sections:
        sections_by_year.setdefault(s["year"], []).append(s)

    theory_assignments = 0   # unique (subject, section) theory pairings
    lab_assignments = 0      # unique (subject, section) lab pairings
    total_theory_cells = 0
    total_lab_cells = 0
    per_section_cells: Dict[str, int] = {}

    for subj in subjects:
        secs = sections_by_year.get(subj["year"], [])
        n_theory = max(0, int(subj.get("lectures_per_week", LECTURES_PER_THEORY_PER_WEEK)))
        n_lab = max(0, int(subj.get("lab_sessions_per_week", LAB_SESSIONS_PER_BATCH_PER_WEEK)))
        for sec in secs:
            cells = n_theory
            if n_theory > 0:
                theory_assignments += 1
                total_theory_cells += n_theory
            if subj.get("requires_lab"):
                lab_assignments += 1
                # The same faculty teaches both batches of a lab, so the two
                # batch sessions can't run in parallel — each needs its own cell.
                # Double-length labs occupy 2 grid cells per session.
                duration = 2 if int(subj.get("lab_duration_slots", 1) or 1) >= 2 else 1
                lab_cells = BATCHES_PER_SECTION * n_lab * duration
                total_lab_cells += lab_cells
                cells += lab_cells
            per_section_cells[sec["section_id"]] = per_section_cells.get(sec["section_id"], 0) + cells

    theory_capacity = sum(_faculty_pattern_caps(f)["theory"] for f in faculty_list)
    lab_capacity = sum(_faculty_pattern_caps(f)["lab"] for f in faculty_list)
    total_demand_cells = total_theory_cells + total_lab_cells

    warnings: List[str] = []
    if theory_assignments > theory_capacity:
        warnings.append(
            f"Theory capacity short: {theory_assignments} subject-section theory slots needed, "
            f"but faculty can cover only {theory_capacity}. Add faculty (or raise patterns)."
        )
    if lab_assignments > lab_capacity:
        warnings.append(
            f"Lab capacity short: {lab_assignments} lab assignments needed, "
            f"but faculty lab-capacity is only {lab_capacity}. Add lab-capable faculty."
        )

    overbooked = [
        {"section": sec["name"], "required": per_section_cells.get(sec["section_id"], 0), "available": cells_per_section}
        for sec in sections
        if per_section_cells.get(sec["section_id"], 0) > cells_per_section
    ]
    if overbooked:
        warnings.append(
            f"{len(overbooked)} section(s) need more weekly periods than the timetable has "
            f"({cells_per_section}/week). Reduce subjects or lectures/week for those years."
        )

    limited = [f["name"] for f in faculty_list if f.get("unavailable_days")]
    if limited:
        warnings.append(
            f"{len(limited)} faculty have unavailable days set — this lowers their effective "
            f"placement capacity and can cause unscheduled items if too tight."
        )

    status = "feasible" if not warnings else "at_risk"
    return {
        "status": status,
        "warnings": warnings,
        "demand": {
            "theory_assignments": theory_assignments,
            "lab_assignments": lab_assignments,
            "total_weekly_sessions": total_demand_cells,
        },
        "capacity": {
            "theory_capacity": theory_capacity,
            "lab_capacity": lab_capacity,
            "cells_per_section": cells_per_section,
            "faculty_count": len(faculty_list),
        },
        "headroom": {
            "theory": theory_capacity - theory_assignments,
            "lab": lab_capacity - lab_assignments,
        },
    }


@api_router.get("/sessions/{session_id}/feasibility")
async def get_feasibility(session_id: str, user: dict = Depends(get_current_user)):
    session = await _verify_session(session_id, user["user_id"])
    faculty_list = await db.faculty.find({"session_id": session_id}, {"_id": 0}).to_list(1000)
    sections = await db.sections.find({"session_id": session_id}, {"_id": 0}).to_list(1000)
    subjects = await db.subjects.find({"session_id": session_id}, {"_id": 0}).to_list(1000)
    return _compute_feasibility(session, faculty_list, sections, subjects)


@api_router.get("/sessions/{session_id}/timetable")
async def get_timetable(session_id: str, user: dict = Depends(get_current_user)):
    await _verify_session(session_id, user["user_id"])
    timetable = await db.timetables.find_one({"session_id": session_id}, {"_id": 0})
    if not timetable:
        return {"entries": [], "unassigned": [], "faculty_load": {}}
    return timetable


# ==================== PDF EXPORT ====================

# ---- Official department template (per-section pages) ----

def _slot_to_minutes(t: str) -> int:
    hh, mm = t.split(":")
    return int(hh) * 60 + int(mm)


def _fmt_ampm(minutes: int) -> str:
    h, m = divmod(minutes, 60)
    suffix = "AM" if h < 12 else "PM"
    h12 = h % 12 or 12
    return f"{h12:02d}:{m:02d}{suffix}"


def _split_slot_halves(slot: str) -> List[str]:
    """Split one 1h40m teaching slot into the two 50-minute period labels the
    official template uses (e.g. '09:00-10:40' → '09:00AM-09:50AM', '09:50AM-10:40AM')."""
    start_s, end_s = slot.split("-")
    start, end = _slot_to_minutes(start_s), _slot_to_minutes(end_s)
    mid = start + (end - start) // 2
    return [f"{_fmt_ampm(start)}-{_fmt_ampm(mid)}", f"{_fmt_ampm(mid)}-{_fmt_ampm(end)}"]


class _VerticalText(Flowable):
    """Bottom-to-top rotated text, used for the LUNCH BREAK column."""

    def __init__(self, text: str, font: str = "Helvetica-Bold", size: float = 7.5):
        Flowable.__init__(self)
        self.text = text
        self.font = font
        self.size = size
        self._text_w = stringWidth(text, font, size)

    def wrap(self, availWidth, availHeight):
        return (self.size + 2, self._text_w)

    def draw(self):
        c = self.canv
        c.saveState()
        c.setFont(self.font, self.size)
        c.rotate(90)
        c.drawString(0, -self.size + 1, self.text)
        c.restoreState()


def _template_cell_text(cell_entries: List[dict]) -> str:
    """What goes inside one grid cell on the official template: the subject
    code, with a LAB-B{n} tag for lab batches."""
    parts = []
    for e in sorted(cell_entries, key=lambda x: (x.get("batch") or 0, x.get("subject_code", ""))):
        code = e.get("subject_code", "")
        if e.get("is_lab"):
            b = e.get("batch")
            parts.append(f"{code} LAB-B{b}" if b else f"{code} LAB")
        else:
            parts.append(code)
    return " / ".join(parts)


def _build_section_template_page(
    session: dict,
    section: dict,
    entries: List[dict],
    year_subjects: List[dict],
    styles,
) -> List[Any]:
    """One page in the official department layout (timetable_template.png):
    header rows, an AM/PM period grid with merged class blocks and a vertical
    LUNCH BREAK column, then the subject → faculty legend with HOD column."""
    days = session.get("working_days", FIXED_WORKING_DAYS)
    slots = session.get("time_slots", FIXED_TIME_SLOTS)
    sec_entries = [e for e in entries if e["section_id"] == section["section_id"]]

    # ---- column layout: TIME/DAY + 2 halves per slot + lunch column ----
    # columns[i] = ("time",) | ("half", slot_idx, half_idx, label) | ("lunch",)
    columns: List[Tuple] = [("time",)]
    for i, slot in enumerate(slots):
        for j, label in enumerate(_split_slot_halves(slot)):
            columns.append(("half", i, j, label))
        if i == LUNCH_AFTER_SLOT_INDEX:
            columns.append(("lunch",))
    ncols = len(columns)
    lunch_col = next(ci for ci, c in enumerate(columns) if c[0] == "lunch")
    slot_start_col = {  # slot index → first of its two columns
        c[1]: ci for ci, c in reversed(list(enumerate(columns))) if c[0] == "half" and c[2] == 0
    }

    wef = (session.get("effective_from") or "").strip()
    title3 = f"TENTATIVE TIME TABLE WITH EFFECT FROM: W.E.F. {wef}" if wef else "TENTATIVE TIME TABLE"
    semester = (session.get("semester_label") or "").strip()
    class_label = section["name"] + (f", {semester}" if semester else "")
    room = (section.get("room") or "").strip()
    mode = (session.get("mode_of_class") or DEFAULT_MODE_OF_CLASS).strip()

    cs = ParagraphStyle("tplCell", parent=styles["Normal"], fontSize=7.5,
                        alignment=TA_CENTER, leading=9)

    data: List[List[Any]] = []
    span_cmds: List[Tuple] = []

    def full_row(text, row_idx):
        data.append([text] + [""] * (ncols - 1))
        span_cmds.append(('SPAN', (0, row_idx), (-1, row_idx)))

    full_row(session.get("dept_name") or DEFAULT_DEPT_NAME, 0)
    full_row(session.get("college_name") or DEFAULT_COLLEGE_NAME, 1)
    full_row(title3, 2)

    # CLASS / Mode / Room row — three blocks across the full width, with the
    # CLASS block taking half (it holds the longest text).
    info_row = [""] * ncols
    b1 = max(2, ncols // 2)              # CLASS: cols 0 .. b1-1
    b2 = b1 + max(1, (ncols - b1) // 2)  # Mode:  cols b1 .. b2-1; Room: rest
    info_row[0] = f"CLASS: {class_label}"
    info_row[b1] = f"Mode of Class: {mode}"
    info_row[b2] = f"ROOM NO: {room}" if room else "ROOM NO: ______"
    data.append(info_row)
    span_cmds.append(('SPAN', (0, 3), (b1 - 1, 3)))
    span_cmds.append(('SPAN', (b1, 3), (b2 - 1, 3)))
    span_cmds.append(('SPAN', (b2, 3), (-1, 3)))

    # Period header row.
    header_row: List[Any] = []
    for c in columns:
        if c[0] == "time":
            header_row.append("TIME →\nDAY ↓")
        elif c[0] == "half":
            header_row.append(c[3].replace("-", "-\n"))
        else:
            header_row.append(_VerticalText("LUNCH BREAK"))
    data.append(header_row)
    header_row_idx = 4
    first_day_row = 5

    # The vertical LUNCH BREAK spans the header row + all day rows.
    span_cmds.append(('SPAN', (lunch_col, header_row_idx), (lunch_col, first_day_row + len(days) - 1)))

    # Day rows with merged class blocks.
    for di, day in enumerate(days):
        row: List[Any] = [""] * ncols
        row[0] = day[:3].upper()
        r = first_day_row + di
        per_slot_entries = [
            [e for e in sec_entries if e["day"] == day and e["time_slot"] == s]
            for s in slots
        ]
        si = 0
        while si < len(slots):
            cell = per_slot_entries[si]
            start_col = slot_start_col[si]
            end_col = start_col + 1
            # Merge with the next slot when it holds the same multi-slot lab
            # group(s) and sits on the same side of lunch.
            if si + 1 < len(slots) and si != LUNCH_AFTER_SLOT_INDEX and cell:
                groups_here = {e.get("lab_group_id") for e in cell}
                groups_next = {e.get("lab_group_id") for e in per_slot_entries[si + 1]}
                if None not in groups_here and groups_here and groups_here == groups_next:
                    end_col = slot_start_col[si + 1] + 1
                    si += 1
            text = _template_cell_text(cell)
            row[start_col] = Paragraph(text, cs) if text else ""
            if end_col > start_col:
                span_cmds.append(('SPAN', (start_col, r), (end_col, r)))
            si += 1
        data.append(row)

    # ---- column widths (portrait A4, ~7.4in usable) ----
    usable = 7.4 * inch
    time_w, lunch_w = 0.55 * inch, 0.26 * inch
    half_w = (usable - time_w - lunch_w) / (ncols - 2)
    col_widths = []
    for c in columns:
        col_widths.append(time_w if c[0] == "time" else (lunch_w if c[0] == "lunch" else half_w))

    grid = Table(data, colWidths=col_widths,
                 rowHeights=[None] * first_day_row + [0.34 * inch] * len(days))
    grid_style = [
        ('GRID', (0, 0), (-1, -1), 0.7, colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('FONTNAME', (0, 1), (-1, 1), 'Helvetica-Oblique'),
        ('FONTSIZE', (0, 1), (-1, 1), 9.5),
        ('FONTNAME', (0, 2), (-1, 2), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 2), (-1, 2), 8.5),
        ('FONTNAME', (0, 3), (-1, 3), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 3), (-1, 3), 8),
        ('FONTNAME', (0, header_row_idx), (-1, header_row_idx), 'Helvetica-Bold'),
        ('FONTSIZE', (0, header_row_idx), (-1, header_row_idx), 6.5),
        ('FONTNAME', (0, first_day_row), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, first_day_row), (-1, -1), 7.5),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 2),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
    ] + span_cmds
    grid.setStyle(TableStyle(grid_style))

    elements: List[Any] = [grid, Spacer(1, 10)]

    # ---- legend: subject → faculty, with HOD signature column ----
    theory_fac: Dict[str, set] = {}
    lab_fac: Dict[str, set] = {}
    for e in sec_entries:
        target = lab_fac if e.get("is_lab") else theory_fac
        target.setdefault(e["subject_id"], set()).add(e.get("faculty_name", ""))

    legend_cell = ParagraphStyle("tplLegend", parent=styles["Normal"], fontSize=7.5, leading=9)
    legend_rows: List[List[Any]] = [["CODE", "SUBJECT NAME", "FACULTY NAME", ""]]
    subjects_sorted = sorted(year_subjects, key=lambda s: s.get("code", ""))
    for subj in subjects_sorted:
        sid = subj["subject_id"]
        names = sorted(theory_fac.get(sid, set()))
        lab_names = sorted(lab_fac.get(sid, set()))
        if subj.get("is_lab_only"):
            fac_text = ", ".join(lab_names) or "—"
            subj_name = f"{subj['name']} (LAB)"
        else:
            fac_text = ", ".join(names) or "—"
            if lab_names and lab_names != names:
                fac_text += f" | Lab: {', '.join(lab_names)}"
            subj_name = subj["name"]
        legend_rows.append([
            subj.get("code", ""),
            Paragraph(subj_name, legend_cell),
            Paragraph(fac_text, legend_cell),
            "",
        ])

    if len(legend_rows) > 1:
        legend_rows[1][3] = "HEAD OF THE\nDEPARTMENT"
        legend = Table(
            legend_rows,
            colWidths=[0.8 * inch, 2.7 * inch, 2.6 * inch, 1.3 * inch],
        )
        legend.setStyle(TableStyle([
            ('GRID', (0, 0), (2, -1), 0.7, colors.black),
            ('BOX', (3, 0), (3, -1), 0.7, colors.black),
            ('SPAN', (3, 1), (3, -1)),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 8),
            ('FONTSIZE', (0, 1), (-1, -1), 7.5),
            ('FONTNAME', (3, 1), (3, -1), 'Helvetica-Bold'),
            ('ALIGN', (0, 0), (0, -1), 'CENTER'),
            ('ALIGN', (3, 0), (3, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        elements.append(legend)

    return elements


def _cell_text_for_entry(e: dict, view_type: str = "master") -> str:
    code = e.get("subject_code", "")
    name = e.get("subject_name", "")
    fac = e.get("faculty_name", "")
    sec = e.get("section_name", "")
    is_lab = e.get("is_lab")
    b = e.get("batch")
    lab_tag = f" [LAB B{b}]" if (is_lab and b) else (" [LAB]" if is_lab else "")
    if view_type == "section":
        # Section view: subject name only — faculty + code live in the legend.
        return f"{name}{lab_tag}"
    return f"{code}{lab_tag}\n{fac}\n{sec}"


@api_router.get("/sessions/{session_id}/export-pdf")
async def export_pdf(
    session_id: str,
    view_type: str = "master",          # master | faculty | section | year | all_sections
    filter_id: Optional[str] = None,    # faculty_id, section_id, or year (as str) depending on view_type
    user: dict = Depends(get_current_user)
):
    session = await _verify_session(session_id, user["user_id"])
    timetable = await db.timetables.find_one({"session_id": session_id}, {"_id": 0})
    if not timetable:
        raise HTTPException(status_code=404, detail="No timetable generated")

    entries = timetable.get("entries", [])

    if view_type in ("faculty", "section", "year") and not filter_id:
        raise HTTPException(status_code=400, detail=f"filter_id is required for the {view_type} view")

    # Section exports use the official department template — one page per
    # section, in the exact layout of the physical notice-board timetable.
    if view_type in ("section", "all_sections"):
        if view_type == "section":
            sec = await db.sections.find_one(
                {"section_id": filter_id, "session_id": session_id}, {"_id": 0}
            )
            if not sec:
                raise HTTPException(status_code=404, detail="Section not found")
            target_sections = [sec]
        else:
            target_sections = await db.sections.find({"session_id": session_id}, {"_id": 0}).to_list(1000)
            target_sections.sort(
                key=lambda s: (s.get("year", 0), s.get("stream", ""), s.get("section_number") or 0)
            )
            if not target_sections:
                raise HTTPException(status_code=404, detail="No sections configured")

        all_subjects = await db.subjects.find({"session_id": session_id}, {"_id": 0}).to_list(1000)
        styles = getSampleStyleSheet()
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer, pagesize=A4,
            rightMargin=0.45 * inch, leftMargin=0.45 * inch,
            topMargin=0.5 * inch, bottomMargin=0.5 * inch,
        )
        elements: List[Any] = []
        for idx, sec in enumerate(target_sections):
            if idx:
                elements.append(PageBreak())
            year_subjects = [s for s in all_subjects if s.get("year") == sec.get("year")]
            elements.extend(
                _build_section_template_page(session, sec, entries, year_subjects, styles)
            )
        doc.build(elements)
        buffer.seek(0)
        safe_name = session['name'].replace(' ', '_')
        suffix = target_sections[0]['name'].replace(' ', '_').replace('/', '-') if view_type == "section" else "all_sections"
        filename = f"timetable_{safe_name}_{suffix}.pdf"
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    title = f"Master Timetable - {session['name']}"

    if view_type == "faculty":
        entries = [e for e in entries if e["faculty_id"] == filter_id]
        f = await db.faculty.find_one({"faculty_id": filter_id, "session_id": session_id}, {"_id": 0})
        title = f"Faculty Timetable - {f['name'] if f else 'Faculty'}"
    elif view_type == "year":
        try:
            yr = int(filter_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Year filter must be an integer")
        entries = [e for e in entries if e.get("section_year") == yr]
        title = f"Year {yr} Timetable - {session['name']}"

    days = session.get("working_days", FIXED_WORKING_DAYS)
    slots = session.get("time_slots", FIXED_TIME_SLOTS)
    lunch = session.get("lunch_slot", LUNCH_SLOT)

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=landscape(A4),
        rightMargin=0.4*inch, leftMargin=0.4*inch,
        topMargin=0.4*inch, bottomMargin=0.4*inch,
    )
    elements: List[Any] = []
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'CustomTitle', parent=styles['Heading1'],
        fontSize=15, alignment=TA_CENTER, spaceAfter=14,
    )
    elements.append(Paragraph(title, title_style))

    header = ["Time"] + days
    table_data = [header]

    # Interleave teaching slots with the lunch row for clarity.
    display_slots: List[Tuple[str, bool]] = []
    for i, s in enumerate(slots):
        display_slots.append((s, False))
        if i == 1:  # after the 2nd teaching slot, insert lunch
            display_slots.append((lunch, True))

    for slot, is_lunch in display_slots:
        if is_lunch:
            row = [slot] + ["LUNCH"] * len(days)
            table_data.append(row)
            continue
        row = [slot]
        for day in days:
            cell_entries = [e for e in entries if e["day"] == day and e["time_slot"] == slot]
            if not cell_entries:
                row.append("")
            else:
                row.append("\n———\n".join(_cell_text_for_entry(e, view_type) for e in cell_entries))
        table_data.append(row)

    col_widths = [1.1*inch] + [1.45*inch] * len(days)
    table = Table(table_data, colWidths=col_widths)

    style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0f172a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('FONTSIZE', (0, 1), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#64748b')),
        ('BACKGROUND', (0, 1), (0, -1), colors.HexColor('#f1f5f9')),
    ])
    # Lunch row styling
    for idx, (_, is_lunch) in enumerate(display_slots, start=1):
        if is_lunch:
            style.add('BACKGROUND', (0, idx), (-1, idx), colors.HexColor('#fef3c7'))
            style.add('FONTNAME', (0, idx), (-1, idx), 'Helvetica-Bold')

    table.setStyle(style)
    elements.append(table)

    footer_style = ParagraphStyle(
        'Footer', parent=styles['Normal'],
        fontSize=8, alignment=TA_CENTER, spaceBefore=14,
    )
    elements.append(Spacer(1, 14))
    elements.append(Paragraph(
        f"Generated on {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        footer_style,
    ))

    doc.build(elements)
    buffer.seek(0)

    safe_name = session['name'].replace(' ', '_')
    filename = f"timetable_{safe_name}_{view_type}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ==================== STATS ====================

@api_router.get("/sessions/{session_id}/stats")
async def get_session_stats(session_id: str, user: dict = Depends(get_current_user)):
    await _verify_session(session_id, user["user_id"])
    faculty_count = await db.faculty.count_documents({"session_id": session_id})
    sections_count = await db.sections.count_documents({"session_id": session_id})
    subjects_count = await db.subjects.count_documents({"session_id": session_id})
    choices_count = await db.faculty_choices.count_documents({"session_id": session_id})

    timetable = await db.timetables.find_one({"session_id": session_id}, {"_id": 0})
    timetable_status = "generated" if timetable else "not_generated"
    entries_count = len(timetable.get("entries", [])) if timetable else 0
    unassigned_count = len(timetable.get("unassigned", [])) if timetable else 0

    return {
        "faculty_count": faculty_count,
        "sections_count": sections_count,
        "subjects_count": subjects_count,
        "choices_count": choices_count,
        "timetable_status": timetable_status,
        "entries_count": entries_count,
        "unassigned_count": unassigned_count,
    }


# ==================== APP WIRING ====================

app.include_router(api_router)

# CORS_ORIGINS controls which sites may call the API. In production set it to your
# frontend URL(s), comma-separated (e.g. "https://timetablegenius.vercel.app").
# Leave it as "*" (or unset) for local dev — we then echo any origin via regex so
# credentialed requests (withCredentials=true) still work, which a literal "*"
# Access-Control-Allow-Origin can't do.
_cors_origins = os.environ.get("CORS_ORIGINS", "*").strip()
if _cors_origins and _cors_origins != "*":
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=[o.strip() for o in _cors_origins.split(",") if o.strip()],
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origin_regex=".*",
        allow_methods=["*"],
        allow_headers=["*"],
    )

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


# ==================== SERVE REACT BUILD (single-origin) ====================
# When a built frontend is present, FastAPI serves it directly so the whole app
# lives at one URL — no CORS, no separate backend URL to configure. The /api
# routes above always take precedence; everything else falls back to index.html
# so client-side routing works.

FRONTEND_BUILD = Path(
    os.environ.get("FRONTEND_BUILD_DIR", str(ROOT_DIR.parent / "frontend" / "build"))
)

if FRONTEND_BUILD.is_dir():
    app.mount(
        "/static",
        StaticFiles(directory=str(FRONTEND_BUILD / "static")),
        name="static",
    )

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = FRONTEND_BUILD / full_path
        if full_path and candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(FRONTEND_BUILD / "index.html"))
else:
    logger.warning(
        "Frontend build not found at %s — serving API only. "
        "Build the frontend (yarn build) for single-origin hosting.",
        FRONTEND_BUILD,
    )
