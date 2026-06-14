from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost/examdb")

# Auto-fallback to SQLite for local development if PostgreSQL isn't available
if DATABASE_URL.startswith("postgresql://") or DATABASE_URL.startswith("postgres://"):
    connect_args = {}
    try:
        import psycopg2
        # Test connection quickly
        import urllib.parse as urlparse
        url = urlparse.urlparse(DATABASE_URL)
        test_conn = psycopg2.connect(
            host=url.hostname,
            port=url.port or 5432,
            user=url.username,
            password=url.password,
            dbname=url.path.lstrip("/"),
            connect_timeout=2
        )
        test_conn.close()
    except Exception:
        # PostgreSQL not available — fall back to SQLite
        import pathlib
        db_path = pathlib.Path(__file__).parent / "bd_testify_dev.db"
        DATABASE_URL = f"sqlite:///{db_path}"
        print(f"[INFO] PostgreSQL unavailable — using SQLite dev database: {db_path}")
        connect_args = {"check_same_thread": False}
else:
    connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

if DATABASE_URL.startswith("sqlite"):
    # SQLite: allow multi-thread access for dev load testing
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        pool_size=20,
        max_overflow=40,
        pool_timeout=30,
    )
else:
    # PostgreSQL: production pool settings
    engine = create_engine(
        DATABASE_URL,
        pool_size=20,
        max_overflow=40,
        pool_timeout=30,
        pool_pre_ping=True,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
