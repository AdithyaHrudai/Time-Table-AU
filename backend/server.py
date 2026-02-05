from fastapi import FastAPI, APIRouter, HTTPException, Depends, Response, Request
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
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
from reportlab.lib.units import inch, cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.enums import TA_CENTER, TA_LEFT

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'timetable-genius-secret-key-2024')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 168  # 7 days

app = FastAPI(title="TimetableGenius API")
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

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

# Session Configuration
class SessionConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    session_id: str = Field(default_factory=lambda: f"session_{uuid.uuid4().hex[:12]}")
    user_id: str
    name: str
    working_days: List[str] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    start_time: str = "09:00"
    end_time: str = "17:00"
    slot_duration: int = 60  # minutes
    min_weekly_hours: int = 12
    max_weekly_hours: int = 18
    break_slots: List[str] = []  # e.g., ["12:00-13:00"]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SessionConfigCreate(BaseModel):
    name: str
    working_days: List[str] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    start_time: str = "09:00"
    end_time: str = "17:00"
    slot_duration: int = 60
    min_weekly_hours: int = 12
    max_weekly_hours: int = 18
    break_slots: List[str] = []

# Faculty
class Faculty(BaseModel):
    model_config = ConfigDict(extra="ignore")
    faculty_id: str = Field(default_factory=lambda: f"fac_{uuid.uuid4().hex[:12]}")
    session_id: str
    name: str
    email: Optional[str] = None
    gender: str  # "male" or "female"
    department: Optional[str] = None
    subjects: List[str] = []  # subject_ids they can teach
    unavailable_slots: List[Dict[str, str]] = []  # [{"day": "Monday", "time": "09:00"}]
    priority_slots: List[Dict[str, str]] = []  # preferred slots
    min_hours: int = 12
    max_hours: int = 18
    allocated_hours: int = 0

class FacultyCreate(BaseModel):
    name: str
    email: Optional[str] = None
    gender: str
    department: Optional[str] = None
    subjects: List[str] = []
    unavailable_slots: List[Dict[str, str]] = []
    priority_slots: List[Dict[str, str]] = []
    min_hours: int = 12
    max_hours: int = 18

# Room/Lab
class Room(BaseModel):
    model_config = ConfigDict(extra="ignore")
    room_id: str = Field(default_factory=lambda: f"room_{uuid.uuid4().hex[:12]}")
    session_id: str
    name: str
    room_type: str  # "classroom" or "lab"
    capacity: int = 60
    building: Optional[str] = None

class RoomCreate(BaseModel):
    name: str
    room_type: str
    capacity: int = 60
    building: Optional[str] = None

# Section
class Section(BaseModel):
    model_config = ConfigDict(extra="ignore")
    section_id: str = Field(default_factory=lambda: f"sec_{uuid.uuid4().hex[:12]}")
    session_id: str
    name: str
    year: int  # 1, 2, 3, 4
    department: str
    strength: int = 60

class SectionCreate(BaseModel):
    name: str
    year: int
    department: str
    strength: int = 60

# Subject
class Subject(BaseModel):
    model_config = ConfigDict(extra="ignore")
    subject_id: str = Field(default_factory=lambda: f"sub_{uuid.uuid4().hex[:12]}")
    session_id: str
    name: str
    code: str
    section_id: str
    lecture_hours_per_week: int = 3
    lab_hours_per_week: int = 2
    requires_lab: bool = False

class SubjectCreate(BaseModel):
    name: str
    code: str
    section_id: str
    lecture_hours_per_week: int = 3
    lab_hours_per_week: int = 2
    requires_lab: bool = False

# Timetable Entry
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
    room_id: str
    room_name: str
    is_lab: bool = False
    is_priority: bool = False

class Timetable(BaseModel):
    model_config = ConfigDict(extra="ignore")
    timetable_id: str = Field(default_factory=lambda: f"tt_{uuid.uuid4().hex[:12]}")
    session_id: str
    entries: List[TimetableEntry] = []
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = "draft"  # draft, final
    conflicts: List[Dict[str, Any]] = []

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

async def get_current_user(request: Request) -> dict:
    # Check cookie first
    session_token = request.cookies.get("session_token")
    
    # Then check Authorization header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        session_token = auth_header.split(" ")[1]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Check if it's a Google OAuth session
    session = await db.user_sessions.find_one(
        {"session_token": session_token},
        {"_id": 0}
    )
    
    if session:
        # Check expiry
        expires_at = session.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
        
        user = await db.users.find_one(
            {"user_id": session["user_id"]},
            {"_id": 0}
        )
        if user:
            return user
    
    # Try JWT token
    try:
        payload = jwt.decode(session_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one(
            {"user_id": payload["user_id"]},
            {"_id": 0}
        )
        if user:
            return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        pass
    
    raise HTTPException(status_code=401, detail="Invalid token")

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if user exists
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
        user=UserResponse(
            user_id=user_id,
            email=user_data.email,
            name=user_data.name,
            auth_type="email"
        )
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
            user_id=user["user_id"],
            email=user["email"],
            name=user["name"],
            picture=user.get("picture"),
            auth_type="email"
        )
    )

@api_router.get("/auth/session")
async def process_google_session(request: Request, response: Response, session_id: str):
    """Process Google OAuth session_id and return user data"""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )
            
            if resp.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid session")
            
            data = resp.json()
            
            # Check if user exists
            existing_user = await db.users.find_one({"email": data["email"]}, {"_id": 0})
            
            if existing_user:
                user_id = existing_user["user_id"]
                # Update user data
                await db.users.update_one(
                    {"user_id": user_id},
                    {"$set": {
                        "name": data["name"],
                        "picture": data.get("picture"),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
            else:
                user_id = f"user_{uuid.uuid4().hex[:12]}"
                user_doc = {
                    "user_id": user_id,
                    "email": data["email"],
                    "name": data["name"],
                    "picture": data.get("picture"),
                    "auth_type": "google",
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.users.insert_one(user_doc)
            
            # Create session
            session_token = data.get("session_token", f"sess_{uuid.uuid4().hex}")
            expires_at = datetime.now(timezone.utc) + timedelta(days=7)
            
            await db.user_sessions.insert_one({
                "user_id": user_id,
                "session_token": session_token,
                "expires_at": expires_at.isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            
            # Set cookie
            response.set_cookie(
                key="session_token",
                value=session_token,
                httponly=True,
                secure=True,
                samesite="none",
                path="/",
                max_age=7 * 24 * 60 * 60
            )
            
            return {
                "user_id": user_id,
                "email": data["email"],
                "name": data["name"],
                "picture": data.get("picture"),
                "session_token": session_token
            }
            
    except httpx.RequestError as e:
        logger.error(f"Error processing session: {e}")
        raise HTTPException(status_code=500, detail="Failed to process session")

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(
        user_id=user["user_id"],
        email=user["email"],
        name=user["name"],
        picture=user.get("picture"),
        auth_type=user.get("auth_type", "email")
    )

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out successfully"}

# ==================== SESSION CONFIG ENDPOINTS ====================

@api_router.post("/sessions", response_model=SessionConfig)
async def create_session(
    config: SessionConfigCreate,
    user: dict = Depends(get_current_user)
):
    session = SessionConfig(
        user_id=user["user_id"],
        **config.model_dump()
    )
    doc = session.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.sessions.insert_one(doc)
    return session

@api_router.get("/sessions", response_model=List[SessionConfig])
async def get_sessions(user: dict = Depends(get_current_user)):
    sessions = await db.sessions.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).to_list(100)
    
    for s in sessions:
        if isinstance(s.get("created_at"), str):
            s["created_at"] = datetime.fromisoformat(s["created_at"])
    
    return sessions

@api_router.get("/sessions/{session_id}", response_model=SessionConfig)
async def get_session(session_id: str, user: dict = Depends(get_current_user)):
    session = await db.sessions.find_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if isinstance(session.get("created_at"), str):
        session["created_at"] = datetime.fromisoformat(session["created_at"])
    
    return session

@api_router.put("/sessions/{session_id}", response_model=SessionConfig)
async def update_session(
    session_id: str,
    config: SessionConfigCreate,
    user: dict = Depends(get_current_user)
):
    result = await db.sessions.update_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"$set": config.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return await get_session(session_id, user)

@api_router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user: dict = Depends(get_current_user)):
    result = await db.sessions.delete_one(
        {"session_id": session_id, "user_id": user["user_id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Delete related data
    await db.faculty.delete_many({"session_id": session_id})
    await db.rooms.delete_many({"session_id": session_id})
    await db.sections.delete_many({"session_id": session_id})
    await db.subjects.delete_many({"session_id": session_id})
    await db.timetables.delete_many({"session_id": session_id})
    
    return {"message": "Session deleted"}

# ==================== FACULTY ENDPOINTS ====================

@api_router.post("/sessions/{session_id}/faculty", response_model=Faculty)
async def create_faculty(
    session_id: str,
    faculty_data: FacultyCreate,
    user: dict = Depends(get_current_user)
):
    # Verify session ownership
    session = await db.sessions.find_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    faculty = Faculty(session_id=session_id, **faculty_data.model_dump())
    await db.faculty.insert_one(faculty.model_dump())
    return faculty

@api_router.get("/sessions/{session_id}/faculty", response_model=List[Faculty])
async def get_faculty(session_id: str, user: dict = Depends(get_current_user)):
    # Verify session ownership
    session = await db.sessions.find_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    faculty = await db.faculty.find(
        {"session_id": session_id},
        {"_id": 0}
    ).to_list(1000)
    return faculty

@api_router.put("/sessions/{session_id}/faculty/{faculty_id}", response_model=Faculty)
async def update_faculty(
    session_id: str,
    faculty_id: str,
    faculty_data: FacultyCreate,
    user: dict = Depends(get_current_user)
):
    result = await db.faculty.update_one(
        {"faculty_id": faculty_id, "session_id": session_id},
        {"$set": faculty_data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Faculty not found")
    
    faculty = await db.faculty.find_one(
        {"faculty_id": faculty_id},
        {"_id": 0}
    )
    return faculty

@api_router.delete("/sessions/{session_id}/faculty/{faculty_id}")
async def delete_faculty(
    session_id: str,
    faculty_id: str,
    user: dict = Depends(get_current_user)
):
    result = await db.faculty.delete_one(
        {"faculty_id": faculty_id, "session_id": session_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Faculty not found")
    return {"message": "Faculty deleted"}

# ==================== ROOM ENDPOINTS ====================

@api_router.post("/sessions/{session_id}/rooms", response_model=Room)
async def create_room(
    session_id: str,
    room_data: RoomCreate,
    user: dict = Depends(get_current_user)
):
    session = await db.sessions.find_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    room = Room(session_id=session_id, **room_data.model_dump())
    await db.rooms.insert_one(room.model_dump())
    return room

@api_router.get("/sessions/{session_id}/rooms", response_model=List[Room])
async def get_rooms(session_id: str, user: dict = Depends(get_current_user)):
    session = await db.sessions.find_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    rooms = await db.rooms.find(
        {"session_id": session_id},
        {"_id": 0}
    ).to_list(1000)
    return rooms

@api_router.put("/sessions/{session_id}/rooms/{room_id}", response_model=Room)
async def update_room(
    session_id: str,
    room_id: str,
    room_data: RoomCreate,
    user: dict = Depends(get_current_user)
):
    result = await db.rooms.update_one(
        {"room_id": room_id, "session_id": session_id},
        {"$set": room_data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Room not found")
    
    room = await db.rooms.find_one({"room_id": room_id}, {"_id": 0})
    return room

@api_router.delete("/sessions/{session_id}/rooms/{room_id}")
async def delete_room(session_id: str, room_id: str, user: dict = Depends(get_current_user)):
    result = await db.rooms.delete_one(
        {"room_id": room_id, "session_id": session_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"message": "Room deleted"}

# ==================== SECTION ENDPOINTS ====================

@api_router.post("/sessions/{session_id}/sections", response_model=Section)
async def create_section(
    session_id: str,
    section_data: SectionCreate,
    user: dict = Depends(get_current_user)
):
    session = await db.sessions.find_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    section = Section(session_id=session_id, **section_data.model_dump())
    await db.sections.insert_one(section.model_dump())
    return section

@api_router.get("/sessions/{session_id}/sections", response_model=List[Section])
async def get_sections(session_id: str, user: dict = Depends(get_current_user)):
    session = await db.sessions.find_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    sections = await db.sections.find(
        {"session_id": session_id},
        {"_id": 0}
    ).to_list(1000)
    return sections

@api_router.put("/sessions/{session_id}/sections/{section_id}", response_model=Section)
async def update_section(
    session_id: str,
    section_id: str,
    section_data: SectionCreate,
    user: dict = Depends(get_current_user)
):
    result = await db.sections.update_one(
        {"section_id": section_id, "session_id": session_id},
        {"$set": section_data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Section not found")
    
    section = await db.sections.find_one({"section_id": section_id}, {"_id": 0})
    return section

@api_router.delete("/sessions/{session_id}/sections/{section_id}")
async def delete_section(session_id: str, section_id: str, user: dict = Depends(get_current_user)):
    result = await db.sections.delete_one(
        {"section_id": section_id, "session_id": session_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Section not found")
    return {"message": "Section deleted"}

# ==================== SUBJECT ENDPOINTS ====================

@api_router.post("/sessions/{session_id}/subjects", response_model=Subject)
async def create_subject(
    session_id: str,
    subject_data: SubjectCreate,
    user: dict = Depends(get_current_user)
):
    session = await db.sessions.find_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    subject = Subject(session_id=session_id, **subject_data.model_dump())
    await db.subjects.insert_one(subject.model_dump())
    return subject

@api_router.get("/sessions/{session_id}/subjects", response_model=List[Subject])
async def get_subjects(session_id: str, user: dict = Depends(get_current_user)):
    session = await db.sessions.find_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    subjects = await db.subjects.find(
        {"session_id": session_id},
        {"_id": 0}
    ).to_list(1000)
    return subjects

@api_router.put("/sessions/{session_id}/subjects/{subject_id}", response_model=Subject)
async def update_subject(
    session_id: str,
    subject_id: str,
    subject_data: SubjectCreate,
    user: dict = Depends(get_current_user)
):
    result = await db.subjects.update_one(
        {"subject_id": subject_id, "session_id": session_id},
        {"$set": subject_data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Subject not found")
    
    subject = await db.subjects.find_one({"subject_id": subject_id}, {"_id": 0})
    return subject

@api_router.delete("/sessions/{session_id}/subjects/{subject_id}")
async def delete_subject(session_id: str, subject_id: str, user: dict = Depends(get_current_user)):
    result = await db.subjects.delete_one(
        {"subject_id": subject_id, "session_id": session_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Subject not found")
    return {"message": "Subject deleted"}

# ==================== TIMETABLE GENERATION ====================

def generate_time_slots(start_time: str, end_time: str, duration: int) -> List[str]:
    """Generate time slots between start and end time"""
    slots = []
    start_hour, start_min = map(int, start_time.split(":"))
    end_hour, end_min = map(int, end_time.split(":"))
    
    current_hour = start_hour
    current_min = start_min
    
    while (current_hour < end_hour) or (current_hour == end_hour and current_min < end_min):
        slot_start = f"{current_hour:02d}:{current_min:02d}"
        
        # Add duration
        current_min += duration
        if current_min >= 60:
            current_hour += current_min // 60
            current_min = current_min % 60
        
        slot_end = f"{current_hour:02d}:{current_min:02d}"
        slots.append(f"{slot_start}-{slot_end}")
    
    return slots

def check_conflict(entries: List[TimetableEntry], new_entry: TimetableEntry) -> Optional[str]:
    """Check if new entry conflicts with existing entries"""
    for entry in entries:
        if entry.day != new_entry.day or entry.time_slot != new_entry.time_slot:
            continue
        
        # Same faculty teaching at same time
        if entry.faculty_id == new_entry.faculty_id:
            return f"Faculty {entry.faculty_name} already has a class at this time"
        
        # Same section at same time
        if entry.section_id == new_entry.section_id:
            return f"Section {entry.section_name} already has a class at this time"
        
        # Same room at same time
        if entry.room_id == new_entry.room_id:
            return f"Room {entry.room_name} already occupied at this time"
    
    return None

def check_back_to_back(entries: List[TimetableEntry], new_entry: TimetableEntry, time_slots: List[str]) -> bool:
    """Check if adding this entry creates back-to-back classes for faculty"""
    faculty_entries = [e for e in entries if e.faculty_id == new_entry.faculty_id and e.day == new_entry.day]
    
    if not faculty_entries:
        return False
    
    new_slot_idx = time_slots.index(new_entry.time_slot) if new_entry.time_slot in time_slots else -1
    
    for entry in faculty_entries:
        entry_slot_idx = time_slots.index(entry.time_slot) if entry.time_slot in time_slots else -1
        if abs(new_slot_idx - entry_slot_idx) == 1:
            return True
    
    return False

@api_router.post("/sessions/{session_id}/generate-timetable")
async def generate_timetable(
    session_id: str,
    priority_entries: List[Dict[str, Any]] = [],
    user: dict = Depends(get_current_user)
):
    """Generate timetable with constraint satisfaction"""
    
    # Fetch all data
    session = await db.sessions.find_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    faculty_list = await db.faculty.find({"session_id": session_id}, {"_id": 0}).to_list(1000)
    rooms = await db.rooms.find({"session_id": session_id}, {"_id": 0}).to_list(1000)
    sections = await db.sections.find({"session_id": session_id}, {"_id": 0}).to_list(1000)
    subjects = await db.subjects.find({"session_id": session_id}, {"_id": 0}).to_list(1000)
    
    if not faculty_list or not rooms or not sections or not subjects:
        raise HTTPException(status_code=400, detail="Please add faculty, rooms, sections and subjects first")
    
    # Generate time slots
    time_slots = generate_time_slots(
        session["start_time"],
        session["end_time"],
        session["slot_duration"]
    )
    
    # Filter out break slots
    break_slots = session.get("break_slots", [])
    time_slots = [slot for slot in time_slots if slot not in break_slots]
    
    working_days = session["working_days"]
    
    # Create lookup maps
    faculty_map = {f["faculty_id"]: f for f in faculty_list}
    room_map = {r["room_id"]: r for r in rooms}
    section_map = {s["section_id"]: s for s in sections}
    subject_map = {s["subject_id"]: s for s in subjects}
    
    # Separate classrooms and labs
    classrooms = [r for r in rooms if r["room_type"] == "classroom"]
    labs = [r for r in rooms if r["room_type"] == "lab"]
    
    entries = []
    conflicts = []
    faculty_hours = {f["faculty_id"]: 0 for f in faculty_list}
    subject_lab_allocated = {s["subject_id"]: False for s in subjects}
    
    # Process priority entries first
    for pe in priority_entries:
        faculty = faculty_map.get(pe.get("faculty_id"))
        subject = subject_map.get(pe.get("subject_id"))
        section = section_map.get(pe.get("section_id"))
        
        if not all([faculty, subject, section]):
            continue
        
        is_lab = pe.get("is_lab", False)
        room = None
        
        if is_lab and labs:
            room = labs[0]
        elif classrooms:
            room = classrooms[0]
        
        if not room:
            continue
        
        entry = TimetableEntry(
            day=pe["day"],
            time_slot=pe["time_slot"],
            faculty_id=faculty["faculty_id"],
            faculty_name=faculty["name"],
            subject_id=subject["subject_id"],
            subject_name=subject["name"],
            subject_code=subject["code"],
            section_id=section["section_id"],
            section_name=section["name"],
            room_id=room["room_id"],
            room_name=room["name"],
            is_lab=is_lab,
            is_priority=True
        )
        
        conflict = check_conflict(entries, entry)
        if conflict:
            conflicts.append({"entry": pe, "reason": conflict})
        else:
            entries.append(entry)
            faculty_hours[faculty["faculty_id"]] += 1
            if is_lab:
                subject_lab_allocated[subject["subject_id"]] = True
    
    # Auto-allocate remaining slots
    for subject in subjects:
        section = section_map.get(subject["section_id"])
        if not section:
            continue
        
        # Find faculty who can teach this subject
        eligible_faculty = [
            f for f in faculty_list 
            if subject["subject_id"] in f.get("subjects", []) or not f.get("subjects")
        ]
        
        if not eligible_faculty:
            eligible_faculty = faculty_list  # Fallback to all faculty
        
        # Allocate lecture hours
        lecture_hours_needed = subject["lecture_hours_per_week"]
        allocated_lectures = sum(
            1 for e in entries 
            if e.subject_id == subject["subject_id"] and not e.is_lab
        )
        
        for _ in range(lecture_hours_needed - allocated_lectures):
            # Find available slot
            allocated = False
            random.shuffle(eligible_faculty)
            
            for faculty in eligible_faculty:
                if faculty_hours[faculty["faculty_id"]] >= faculty.get("max_hours", 18):
                    continue
                
                for day in working_days:
                    for slot in time_slots:
                        # Check faculty unavailability
                        unavailable = any(
                            u["day"] == day and u["time"] == slot.split("-")[0]
                            for u in faculty.get("unavailable_slots", [])
                        )
                        if unavailable:
                            continue
                        
                        # Find available classroom
                        for room in classrooms:
                            entry = TimetableEntry(
                                day=day,
                                time_slot=slot,
                                faculty_id=faculty["faculty_id"],
                                faculty_name=faculty["name"],
                                subject_id=subject["subject_id"],
                                subject_name=subject["name"],
                                subject_code=subject["code"],
                                section_id=section["section_id"],
                                section_name=section["name"],
                                room_id=room["room_id"],
                                room_name=room["name"],
                                is_lab=False,
                                is_priority=False
                            )
                            
                            # Check conflicts
                            conflict = check_conflict(entries, entry)
                            if conflict:
                                continue
                            
                            # Check back-to-back
                            if check_back_to_back(entries, entry, time_slots):
                                continue
                            
                            entries.append(entry)
                            faculty_hours[faculty["faculty_id"]] += 1
                            allocated = True
                            break
                        
                        if allocated:
                            break
                    if allocated:
                        break
                if allocated:
                    break
        
        # Allocate lab hours (1 lab per subject per section)
        if subject["requires_lab"] and not subject_lab_allocated.get(subject["subject_id"]):
            if labs:
                for faculty in eligible_faculty:
                    if faculty_hours[faculty["faculty_id"]] >= faculty.get("max_hours", 18):
                        continue
                    
                    for day in working_days:
                        for slot in time_slots:
                            for lab in labs:
                                entry = TimetableEntry(
                                    day=day,
                                    time_slot=slot,
                                    faculty_id=faculty["faculty_id"],
                                    faculty_name=faculty["name"],
                                    subject_id=subject["subject_id"],
                                    subject_name=subject["name"],
                                    subject_code=subject["code"],
                                    section_id=section["section_id"],
                                    section_name=section["name"],
                                    room_id=lab["room_id"],
                                    room_name=lab["name"],
                                    is_lab=True,
                                    is_priority=False
                                )
                                
                                conflict = check_conflict(entries, entry)
                                if conflict:
                                    continue
                                
                                if check_back_to_back(entries, entry, time_slots):
                                    continue
                                
                                entries.append(entry)
                                faculty_hours[faculty["faculty_id"]] += 1
                                subject_lab_allocated[subject["subject_id"]] = True
                                break
                            
                            if subject_lab_allocated.get(subject["subject_id"]):
                                break
                        if subject_lab_allocated.get(subject["subject_id"]):
                            break
                    if subject_lab_allocated.get(subject["subject_id"]):
                        break
    
    # Create timetable document
    timetable = Timetable(
        session_id=session_id,
        entries=[e.model_dump() for e in entries],
        conflicts=conflicts,
        status="draft"
    )
    
    doc = timetable.model_dump()
    doc["generated_at"] = doc["generated_at"].isoformat()
    
    # Delete old timetable for this session
    await db.timetables.delete_many({"session_id": session_id})
    await db.timetables.insert_one(doc)
    
    return {
        "timetable_id": timetable.timetable_id,
        "entries_count": len(entries),
        "conflicts": conflicts,
        "faculty_hours": faculty_hours
    }

@api_router.get("/sessions/{session_id}/timetable")
async def get_timetable(session_id: str, user: dict = Depends(get_current_user)):
    """Get generated timetable"""
    session = await db.sessions.find_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    timetable = await db.timetables.find_one(
        {"session_id": session_id},
        {"_id": 0}
    )
    
    if not timetable:
        return {"entries": [], "conflicts": []}
    
    return timetable

# ==================== PDF EXPORT ====================

@api_router.get("/sessions/{session_id}/export-pdf")
async def export_pdf(
    session_id: str,
    view_type: str = "master",  # master, faculty, section
    filter_id: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Export timetable as PDF"""
    session = await db.sessions.find_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    timetable = await db.timetables.find_one(
        {"session_id": session_id},
        {"_id": 0}
    )
    
    if not timetable:
        raise HTTPException(status_code=404, detail="No timetable generated")
    
    entries = timetable.get("entries", [])
    
    # Filter entries based on view type
    if view_type == "faculty" and filter_id:
        entries = [e for e in entries if e["faculty_id"] == filter_id]
        faculty = await db.faculty.find_one({"faculty_id": filter_id}, {"_id": 0})
        title = f"Timetable - {faculty['name'] if faculty else 'Faculty'}"
    elif view_type == "section" and filter_id:
        entries = [e for e in entries if e["section_id"] == filter_id]
        section = await db.sections.find_one({"section_id": filter_id}, {"_id": 0})
        title = f"Timetable - {section['name'] if section else 'Section'}"
    else:
        title = f"Master Timetable - {session['name']}"
    
    # Generate time slots
    time_slots = generate_time_slots(
        session["start_time"],
        session["end_time"],
        session["slot_duration"]
    )
    break_slots = session.get("break_slots", [])
    time_slots = [slot for slot in time_slots if slot not in break_slots]
    
    working_days = session["working_days"]
    
    # Create PDF
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        rightMargin=0.5*inch,
        leftMargin=0.5*inch,
        topMargin=0.5*inch,
        bottomMargin=0.5*inch
    )
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=16,
        alignment=TA_CENTER,
        spaceAfter=20
    )
    elements.append(Paragraph(title, title_style))
    
    # Build table data
    header = ["Time"] + working_days
    table_data = [header]
    
    for slot in time_slots:
        row = [slot]
        for day in working_days:
            cell_entries = [e for e in entries if e["day"] == day and e["time_slot"] == slot]
            if cell_entries:
                cell_text = []
                for e in cell_entries:
                    lab_marker = " [LAB]" if e.get("is_lab") else ""
                    cell_text.append(f"{e['subject_code']}{lab_marker}\n{e['faculty_name']}\n{e['room_name']}\n({e['section_name']})")
                row.append("\n---\n".join(cell_text))
            else:
                row.append("")
        table_data.append(row)
    
    # Create table
    col_widths = [1.2*inch] + [1.5*inch] * len(working_days)
    table = Table(table_data, colWidths=col_widths)
    
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0f172a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('FONTSIZE', (0, 1), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('TOPPADDING', (0, 0), (-1, 0), 10),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#64748b')),
        ('BACKGROUND', (0, 1), (0, -1), colors.HexColor('#f1f5f9')),
        ('ROWBACKGROUNDS', (1, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
    ]))
    
    elements.append(table)
    
    # Footer
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=8,
        alignment=TA_CENTER,
        spaceBefore=20
    )
    elements.append(Spacer(1, 20))
    elements.append(Paragraph(f"Generated on {datetime.now().strftime('%Y-%m-%d %H:%M')}", footer_style))
    
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"timetable_{session['name'].replace(' ', '_')}_{view_type}.pdf"
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ==================== STATS ENDPOINTS ====================

@api_router.get("/sessions/{session_id}/stats")
async def get_session_stats(session_id: str, user: dict = Depends(get_current_user)):
    """Get statistics for a session"""
    session = await db.sessions.find_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    faculty_count = await db.faculty.count_documents({"session_id": session_id})
    rooms_count = await db.rooms.count_documents({"session_id": session_id})
    labs_count = await db.rooms.count_documents({"session_id": session_id, "room_type": "lab"})
    sections_count = await db.sections.count_documents({"session_id": session_id})
    subjects_count = await db.subjects.count_documents({"session_id": session_id})
    
    timetable = await db.timetables.find_one({"session_id": session_id}, {"_id": 0})
    timetable_status = "generated" if timetable else "not_generated"
    entries_count = len(timetable.get("entries", [])) if timetable else 0
    
    return {
        "faculty_count": faculty_count,
        "rooms_count": rooms_count,
        "labs_count": labs_count,
        "sections_count": sections_count,
        "subjects_count": subjects_count,
        "timetable_status": timetable_status,
        "entries_count": entries_count
    }

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
