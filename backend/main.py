# coding: utf-8
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
import os

load_dotenv()

from sqlalchemy import text
from database import engine, Base, SessionLocal
import models
from auth import get_password_hash

from routers import admin, invite, candidate, test, monitoring

# Create tables at import time (before app starts)
Base.metadata.create_all(bind=engine)


def run_migrations():
    """Add new columns to existing tables without dropping data."""
    migrations = [
        ("test_sessions", "photo_data", "TEXT"),
        ("test_sessions", "latest_snapshot", "TEXT"),
        ("test_sessions", "snapshot_at", "TIMESTAMP"),
        ("questions", "section_id", "INTEGER REFERENCES sections(id) ON DELETE SET NULL"),
        ("sections", "order", "INTEGER DEFAULT 0"),
    ]
    with engine.connect() as conn:
        for table, col, col_type in migrations:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {col_type}"))
                conn.commit()
                print(f"[MIGRATION] {table}.{col} ready")
            except Exception as e:
                print(f"[MIGRATION] {table}.{col} skipped: {e}")


run_migrations()


def seed_admin():
    db = SessionLocal()
    try:
        admin_email = os.getenv("ADMIN_EMAIL", "admin@buildingdoctor.com")
        admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
        existing = db.query(models.Admin).filter(models.Admin.email == admin_email).first()
        if not existing:
            admin_obj = models.Admin(
                email=admin_email,
                hashed_password=get_password_hash(admin_password)
            )
            db.add(admin_obj)
            db.commit()
            print(f"[OK] Default admin created: {admin_email}")
        else:
            print(f"[INFO] Admin already exists: {admin_email}")
    except Exception as e:
        print(f"[WARN] Could not seed admin: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    seed_admin()
    print("[OK] BD Testify Backend is running!")
    print("   API Docs: http://localhost:8000/docs")
    yield
    # Shutdown (nothing needed)


app = FastAPI(
    title="BD Testify - Building Doctor Exam Platform",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount recordings directory for serving video files
os.makedirs("recordings", exist_ok=True)
app.mount("/recordings", StaticFiles(directory="recordings"), name="recordings")

# Include routers
app.include_router(admin.router)
app.include_router(invite.router)
app.include_router(candidate.router)
app.include_router(test.router)
app.include_router(monitoring.router)


@app.get("/")
def root():
    return {
        "app": "BD Testify - Building Doctor Exam Platform",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs"
    }


@app.get("/health")
def health():
    return {"status": "ok"}
