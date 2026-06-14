# BD Testify — Building Doctor Assessment Platform

A production-ready online exam platform with AI proctoring, webcam recording, and a full admin panel.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React.js + TailwindCSS (Vite) |
| Backend | FastAPI (Python) |
| Database | PostgreSQL + SQLAlchemy ORM |
| Auth | JWT tokens |
| Email | SMTP (Gmail/SendGrid compatible) |
| Queue | Redis + Celery |
| Proctoring | face-api.js + MediaRecorder API |
| QR Code | qrcode (Python) |

---

## Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL (running locally or remote)
- Redis (for Celery email queue)

---

## Setup & Installation

### 1. Clone / navigate to project

```bash
cd "BD Testify"
```

### 2. Configure environment

Edit `backend/.env` with your credentials:

```env
DATABASE_URL=postgresql://user:password@localhost/examdb
SECRET_KEY=your_strong_secret_key_here
ADMIN_EMAIL=admin@buildingdoctor.com
ADMIN_PASSWORD=admin123
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_gmail_app_password
FRONTEND_URL=http://localhost:3000
REDIS_URL=redis://localhost:6379
MAX_ATTEMPTS=1
TEST_TIME_LIMIT_MINUTES=60
QUESTIONS_PER_TEST=30
```

Edit `frontend/.env`:

```env
VITE_API_URL=http://localhost:8000
```

### 3. Backend setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

pip install -r requirements.txt
```

### 4. Frontend setup

```bash
cd frontend
npm install
```

---

## Running the Application

### Start PostgreSQL
Make sure PostgreSQL is running and the `examdb` database exists:
```sql
CREATE DATABASE examdb;
```

### Start Redis (for email queue)
```bash
redis-server
```

### Start Backend
```bash
cd backend
uvicorn main:app --reload --port 8000
```

The backend auto-creates all tables and seeds the default admin on first run.

### Start Frontend
```bash
cd frontend
npm run dev
```

### Start Celery Worker (optional, for bulk email)
```bash
cd backend
celery -A services.email_service.celery_app worker --loglevel=info
```

---

## Access URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |

---

## Admin Login

Use the credentials from your `.env`:
- **Email:** `admin@buildingdoctor.com`
- **Password:** `admin123`

---

## Test Flow

```
1. Admin creates Questions
       ↓
2. Admin creates Test Set (assign questions, set time limit)
       ↓
3. Admin sends Email Invite (or generates QR code)
       ↓
4. Candidate clicks link → Register page
       ↓
5. Candidate fills registration form → Test Room
       ↓
6. System check (camera + mic) → Fullscreen enforced
       ↓
7. Candidate takes test (webcam recorded, AI face detection active)
       ↓
8. Submit → Score calculated → Result email sent
       ↓
9. Admin reviews session recording + cheating log
```

---

## Key Features

### Admin Panel
- Dashboard with live stats
- Question manager (CRUD with test set assignment)
- Test set manager (configure questions/time)
- Candidate management with reattempt control
- Live monitoring dashboard (10-second polling)
- Invite manager (email + QR code)
- CSV export (candidates & results)

### Proctoring
- Webcam recording in 30-second WebM chunks
- AI face detection (face-api.js TinyFaceDetector)
- Tab switch detection → auto-suspend after 3 switches
- Fullscreen enforcement
- Keyboard shortcut blocking (Ctrl+C/V/U, F12, DevTools)
- Right-click disabled
- Warning overlay system
- Auto-suspend at 3 warnings

### Candidate Experience
- System check before test starts
- One question at a time with question navigator
- Live countdown timer (red when <5 min)
- Progress bar
- Submit confirmation modal
- Auto-submit on timer expiry
- Email result on completion

---

## Scalability Notes (1000–2000 users)

For production at scale, deploy on:

| Component | AWS Service |
|-----------|------------|
| Backend | EC2 (t3.medium+) or ECS |
| Database | RDS PostgreSQL (db.t3.medium+) |
| File Storage | S3 (swap local `recordings/` folder) |
| CDN | CloudFront |
| Redis | ElastiCache |
| Email | SES or SendGrid |
| Load Balancer | ALB |

To swap to S3 storage, update `video_service.py` and `monitoring.py` to use `boto3`.

---

## Project Structure

```
BD Testify/
├── backend/
│   ├── main.py              # FastAPI app + startup
│   ├── database.py          # SQLAlchemy setup
│   ├── models.py            # DB models
│   ├── schemas.py           # Pydantic schemas
│   ├── auth.py              # JWT auth
│   ├── routers/
│   │   ├── admin.py         # Admin CRUD + exports
│   │   ├── test.py          # Test start/answer/submit
│   │   ├── candidate.py     # Registration
│   │   ├── invite.py        # Email + QR invites
│   │   └── monitoring.py    # Events + video upload
│   ├── services/
│   │   ├── email_service.py # SMTP + Celery tasks
│   │   ├── qr_service.py    # QR code generation
│   │   ├── score_service.py # Score calculation
│   │   └── video_service.py # Recording file utils
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/           # All page components
│   │   ├── components/      # Shared components
│   │   └── services/        # API + socket utils
│   ├── package.json
│   └── .env
└── README.md
```

---

© 2025 Building Doctor. All rights reserved.
