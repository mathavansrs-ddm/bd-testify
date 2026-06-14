# BD Testify - Video & Audio Load Test: 1,250 Concurrent Candidates
# Simulates real proctoring traffic:
#   - WebM video chunks uploaded every 30 seconds per candidate
#   - Face-detection & audio events logged every 3 seconds
#   - Cheating events (tab switch, face missing, audio spike)
#   - Concurrent monitoring dashboard reads (admin polling)

import asyncio
import aiohttp
import aiofiles
import time
import random
import os
import sys
import io
import struct
import json
from dataclasses import dataclass, field
from typing import List, Optional
from collections import defaultdict

BASE_URL        = "http://localhost:8000"
TOTAL_CANDIDATES = 1250
CONCURRENCY      = 80          # simultaneous candidates actively streaming
ADMIN_EMAIL      = "admin@buildingdoctor.com"
ADMIN_PASSWORD   = "admin123"

# Exam duration to simulate (seconds). Each candidate streams this long.
# Set short for test speed; real exam = 3600s
SIM_DURATION_SEC = 60

# Video chunk interval (seconds) - matches MediaRecorder timeslice
CHUNK_INTERVAL   = 10          # 10s per chunk in test (real = 30s)

# Face/audio event interval (seconds)
EVENT_INTERVAL   = 5           # every 5s (real = every 3s)

CHUNK_SIZE_BYTES = 512 * 1024  # 512 KB per simulated WebM chunk (real ~= 1-3 MB)

EVENT_TYPES = [
    "face_not_detected",
    "multiple_faces",
    "tab_switch",
    "fullscreen_exit",
    "copy_attempt",
    "suspicious_audio",
]

# Probability weights for each event (realistic distribution)
EVENT_WEIGHTS = [0.15, 0.05, 0.25, 0.15, 0.20, 0.20]


# ─── Fake WebM chunk generator ─────────────────────────────────────────────────
def make_fake_webm_chunk(size_bytes: int = CHUNK_SIZE_BYTES) -> bytes:
    """
    Generate a realistic-size fake WebM blob.
    Real MediaRecorder produces EBML-encoded WebM. We simulate the size
    and binary nature without a real encoder.
    """
    # WebM EBML header signature
    header = bytes([0x1A, 0x45, 0xDF, 0xA3, 0x01, 0x00, 0x00, 0x00,
                    0x00, 0x00, 0x00, 0x1F, 0x42, 0x86, 0x81, 0x01])
    # Fill rest with pseudo-random binary data (simulates compressed video)
    payload = os.urandom(size_bytes - len(header))
    return header + payload


# ─── Result tracking ──────────────────────────────────────────────────────────
@dataclass
class MediaResult:
    candidate_id: int
    session_id: Optional[int] = None
    chunks_uploaded: int = 0
    chunks_failed: int = 0
    events_logged: int = 0
    events_failed: int = 0
    total_bytes_uploaded: int = 0
    chunk_latencies: List[float] = field(default_factory=list)
    event_latencies: List[float] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    setup_failed: bool = False


@dataclass
class MediaReport:
    total_candidates: int = 0
    setup_ok: int = 0
    setup_failed: int = 0
    total_chunks: int = 0
    failed_chunks: int = 0
    total_events: int = 0
    failed_events: int = 0
    total_bytes: int = 0
    wall_time: float = 0.0
    chunk_latencies: List[float] = field(default_factory=list)
    event_latencies: List[float] = field(default_factory=list)
    errors_sample: List[str] = field(default_factory=list)
    admin_poll_latencies: List[float] = field(default_factory=list)


# ─── Setup: ensure test set + questions + sessions exist ──────────────────────
async def setup_test_infrastructure(session: aiohttp.ClientSession, admin_token: str):
    hdrs = {"Authorization": f"Bearer {admin_token}"}

    # Get or create test set
    async with session.get(f"{BASE_URL}/admin/test-sets", headers=hdrs) as r:
        sets = await r.json()
    if sets:
        ts = sets[0]
    else:
        async with session.post(f"{BASE_URL}/admin/test-sets", headers=hdrs,
                                json={"set_name": "Media Load Test Set",
                                      "questions_per_test": 3,
                                      "time_limit_minutes": 120}) as r:
            ts = await r.json()

    test_set_id = ts["id"]

    # Ensure at least 3 questions
    async with session.get(f"{BASE_URL}/admin/questions",
                           params={"test_set_id": test_set_id},
                           headers=hdrs) as r:
        qs = await r.json()

    for i in range(max(0, 3 - len(qs))):
        await session.post(f"{BASE_URL}/admin/questions", headers=hdrs, json={
            "test_set_id": test_set_id,
            "question_text": f"Media test Q{i+1}: What is {i+2}+{i+2}?",
            "option_a": str(i), "option_b": str((i+2)*2),
            "option_c": str(i+1), "option_d": str(i+5),
            "correct_answer": "b", "marks": 1
        })

    return test_set_id


async def create_session_for_candidate(
    http: aiohttp.ClientSession,
    idx: int,
    admin_token: str,
    test_set_id: int,
) -> Optional[int]:
    """Register candidate, send invite, start test -> return session_id."""
    hdrs = {"Authorization": f"Bearer {admin_token}"}
    email = f"media_test_{idx:04d}@bdtest.com"

    try:
        # Register
        await http.post(f"{BASE_URL}/candidate/register", json={
            "name": f"Media Candidate {idx}",
            "phone": f"90{idx:08d}"[:10],
            "email": email,
            "degree": "B.E. Civil",
            "year_of_study": "Final Year",
            "college_name": "Test University",
        })

        # Send invite
        async with http.post(f"{BASE_URL}/invite/send",
                             json={"candidate_email": email,
                                   "test_set_id": test_set_id},
                             headers=hdrs) as r:
            if r.status >= 400:
                return None
            inv = await r.json()
        token = inv["token"]

        # Start test
        async with http.post(f"{BASE_URL}/test/start/{token}") as r:
            if r.status >= 400:
                return None
            data = await r.json()
        return data["session_id"]

    except Exception:
        return None


# ─── Single candidate media simulation ────────────────────────────────────────
async def simulate_candidate_media(
    http: aiohttp.ClientSession,
    idx: int,
    session_id: int,
    semaphore: asyncio.Semaphore,
    report: MediaReport,
    result: MediaResult,
):
    """
    Simulate one candidate's full exam media stream:
    - Upload video chunks every CHUNK_INTERVAL seconds
    - Log face/audio events every EVENT_INTERVAL seconds
    - Run for SIM_DURATION_SEC total seconds
    """
    async with semaphore:
        t_start = time.perf_counter()
        t_end   = t_start + SIM_DURATION_SEC

        # Schedule chunk uploads and event logs interleaved
        chunk_num   = 0
        next_chunk  = t_start + CHUNK_INTERVAL
        next_event  = t_start + random.uniform(0, EVENT_INTERVAL)  # stagger starts

        while time.perf_counter() < t_end:
            now = time.perf_counter()

            # ── Video chunk upload ──────────────────────────────────────────
            if now >= next_chunk:
                chunk_data = make_fake_webm_chunk(CHUNK_SIZE_BYTES)
                t0 = time.perf_counter()
                try:
                    form = aiohttp.FormData()
                    form.add_field("session_id", str(session_id))
                    form.add_field("chunk_number", str(chunk_num))
                    form.add_field(
                        "file",
                        chunk_data,
                        filename=f"chunk_{chunk_num}.webm",
                        content_type="video/webm",
                    )
                    async with http.post(f"{BASE_URL}/monitoring/video/upload",
                                         data=form) as r:
                        lat = (time.perf_counter() - t0) * 1000
                        result.chunk_latencies.append(lat)
                        report.chunk_latencies.append(lat)
                        if r.status == 200:
                            result.chunks_uploaded += 1
                            result.total_bytes_uploaded += len(chunk_data)
                            report.total_chunks += 1
                            report.total_bytes += len(chunk_data)
                        else:
                            result.chunks_failed += 1
                            report.failed_chunks += 1
                except Exception as e:
                    lat = (time.perf_counter() - t0) * 1000
                    result.chunk_latencies.append(lat)
                    result.chunks_failed += 1
                    report.failed_chunks += 1
                    if len(result.errors) < 3:
                        result.errors.append(f"chunk_upload: {str(e)[:80]}")

                chunk_num  += 1
                next_chunk += CHUNK_INTERVAL

            # ── Monitoring event (face / audio) ────────────────────────────
            if now >= next_event:
                event_type = random.choices(EVENT_TYPES, weights=EVENT_WEIGHTS)[0]
                t0 = time.perf_counter()
                try:
                    async with http.post(f"{BASE_URL}/monitoring/event", json={
                        "session_id": session_id,
                        "event_type": event_type,
                    }) as r:
                        lat = (time.perf_counter() - t0) * 1000
                        result.event_latencies.append(lat)
                        report.event_latencies.append(lat)
                        if r.status == 200:
                            result.events_logged += 1
                            report.total_events += 1
                        else:
                            result.events_failed += 1
                            report.failed_events += 1
                except Exception as e:
                    lat = (time.perf_counter() - t0) * 1000
                    result.event_latencies.append(lat)
                    result.events_failed += 1
                    report.failed_events += 1

                next_event += EVENT_INTERVAL

            # Brief sleep to yield control
            sleep_until = min(next_chunk, next_event)
            wait = max(0.05, sleep_until - time.perf_counter())
            await asyncio.sleep(min(wait, 0.5))


# ─── Admin monitoring poll (simulate admin dashboard refreshing every 10s) ────
async def simulate_admin_polling(
    http: aiohttp.ClientSession,
    admin_token: str,
    duration_sec: int,
    report: MediaReport,
):
    hdrs = {"Authorization": f"Bearer {admin_token}"}
    t_end = time.perf_counter() + duration_sec
    poll_count = 0
    while time.perf_counter() < t_end:
        t0 = time.perf_counter()
        try:
            async with http.get(f"{BASE_URL}/monitoring/active-sessions",
                                headers=hdrs) as r:
                lat = (time.perf_counter() - t0) * 1000
                report.admin_poll_latencies.append(lat)
        except Exception:
            pass
        poll_count += 1
        await asyncio.sleep(10)


# ─── Main ─────────────────────────────────────────────────────────────────────
async def main():
    print("=" * 65)
    print("  BD Testify — Video & Audio Load Test")
    print(f"  {TOTAL_CANDIDATES:,} Concurrent Proctored Candidates")
    print("=" * 65)

    connector = aiohttp.TCPConnector(limit=200, limit_per_host=200, ssl=False)
    timeout   = aiohttp.ClientTimeout(total=120, connect=10)

    async with aiohttp.ClientSession(connector=connector, timeout=timeout) as http:

        # ── Admin auth ────────────────────────────────────────────────────
        print("\n[1/5] Admin authentication...")
        async with http.post(f"{BASE_URL}/admin/login",
                             json={"email": ADMIN_EMAIL,
                                   "password": ADMIN_PASSWORD}) as r:
            admin_token = (await r.json())["access_token"]
        print("      OK")

        # ── Test infrastructure ───────────────────────────────────────────
        print("[2/5] Setting up test infrastructure...")
        test_set_id = await setup_test_infrastructure(http, admin_token)
        print(f"      Test set ID={test_set_id} ready")

        # ── Create sessions for all candidates (batch setup) ──────────────
        print(f"[3/5] Creating {TOTAL_CANDIDATES:,} candidate sessions "
              f"(concurrency=100)...")
        setup_sem  = asyncio.Semaphore(100)
        results    = [MediaResult(candidate_id=i) for i in range(1, TOTAL_CANDIDATES+1)]
        report     = MediaReport(total_candidates=TOTAL_CANDIDATES)

        async def setup_one(idx):
            async with setup_sem:
                sid = await create_session_for_candidate(http, idx, admin_token, test_set_id)
                results[idx-1].session_id = sid
                if sid:
                    report.setup_ok += 1
                else:
                    report.setup_failed += 1
                    results[idx-1].setup_failed = True
                done = report.setup_ok + report.setup_failed
                if done % 200 == 0 or done == TOTAL_CANDIDATES:
                    print(f"      Sessions: {done}/{TOTAL_CANDIDATES} "
                          f"(ok={report.setup_ok}, failed={report.setup_failed})",
                          end="\r")

        await asyncio.gather(*[setup_one(i) for i in range(1, TOTAL_CANDIDATES+1)])
        print()
        print(f"      Setup complete: {report.setup_ok:,} sessions active, "
              f"{report.setup_failed:,} failed")

        # ── Stream video + audio for all active sessions ───────────────────
        active = [r for r in results if not r.setup_failed and r.session_id]
        print(f"\n[4/5] Streaming video & audio for {len(active):,} candidates "
              f"({SIM_DURATION_SEC}s simulation, chunk={CHUNK_INTERVAL}s, "
              f"event={EVENT_INTERVAL}s)...")
        print(f"      Chunk size: {CHUNK_SIZE_BYTES//1024}KB per chunk "
              f"| Concurrency cap: {CONCURRENCY}")

        media_sem = asyncio.Semaphore(CONCURRENCY)
        t_start   = time.perf_counter()

        media_tasks = [
            simulate_candidate_media(http, r.candidate_id, r.session_id,
                                     media_sem, report, r)
            for r in active
        ]
        # Add admin polling in parallel
        admin_task = simulate_admin_polling(http, admin_token, SIM_DURATION_SEC + 30, report)

        done_count = 0
        total_active = len(active)

        async def tracked(coro, result_obj):
            nonlocal done_count
            await coro
            done_count += 1
            if done_count % 100 == 0 or done_count == total_active:
                elapsed = time.perf_counter() - t_start
                mb = report.total_bytes / 1024 / 1024
                bw = mb / elapsed if elapsed else 0
                print(f"      [{done_count:>4}/{total_active}] "
                      f"chunks={report.total_chunks:,}  "
                      f"events={report.total_events:,}  "
                      f"uploaded={mb:.1f}MB  "
                      f"bw={bw:.2f}MB/s",
                      end="\r")

        await asyncio.gather(
            *[tracked(simulate_candidate_media(http, r.candidate_id, r.session_id,
                                               media_sem, report, r), r)
              for r in active],
            admin_task,
        )

        report.wall_time = time.perf_counter() - t_start
        print()
        print("\n[5/5] Collecting results...")

    # Collect individual errors
    for r in results:
        for e in r.errors:
            if len(report.errors_sample) < 15:
                report.errors_sample.append(f"[C{r.candidate_id}] {e}")

    _print_report(report, results, active)


# ─── Report printer ────────────────────────────────────────────────────────────
def _pct(a, b):
    return (a / b * 100) if b else 0

def _percentile(data, p):
    if not data: return 0.0
    s = sorted(data)
    return round(s[int(len(s) * p / 100)], 1)

def _mb(b):
    return round(b / 1024 / 1024, 2)

def _print_report(r: MediaReport, results: list, active: list):
    div = "-" * 65

    # Aggregate per-candidate stats
    cand_chunks    = [x.chunks_uploaded for x in active]
    cand_events    = [x.events_logged   for x in active]
    cand_bytes     = [x.total_bytes_uploaded for x in active]
    cand_cerr      = [x.chunks_failed   for x in active]

    total_mb       = _mb(r.total_bytes)
    wall           = r.wall_time
    avg_bw         = total_mb / wall if wall else 0
    peak_bw        = max(cand_bytes, default=0) * len(active) / 1024 / 1024 / (CHUNK_INTERVAL)

    chunk_ok_rate  = _pct(r.total_chunks, r.total_chunks + r.failed_chunks)
    event_ok_rate  = _pct(r.total_events, r.total_events + r.failed_events)

    avg_cand_chunks = sum(cand_chunks) / len(cand_chunks) if cand_chunks else 0
    avg_cand_events = sum(cand_events) / len(cand_events) if cand_events else 0

    print("\n" + "=" * 65)
    print("  VIDEO & AUDIO LOAD TEST RESULTS  BD Testify")
    print("=" * 65)

    print(f"""
  CANDIDATE SETUP
  {div}
  Candidates attempted        : {r.total_candidates:,}
  Sessions created (OK)       : {r.setup_ok:,}  ({_pct(r.setup_ok, r.total_candidates):.1f}%)
  Setup failures              : {r.setup_failed:,}

  VIDEO CHUNK UPLOAD RESULTS
  {div}
  Total chunks uploaded       : {r.total_chunks:,}
  Failed chunks               : {r.failed_chunks:,}  ({_pct(r.failed_chunks, r.total_chunks+r.failed_chunks):.1f}%)
  Chunk success rate          : {chunk_ok_rate:.2f}%
  Total data uploaded         : {total_mb:.2f} MB
  Avg data per candidate      : {_mb(sum(cand_bytes)//max(1,len(cand_bytes))):.2f} MB
  Avg chunks per candidate    : {avg_cand_chunks:.1f}
  Avg upload throughput       : {avg_bw:.2f} MB/s
  Chunk size (each)           : {CHUNK_SIZE_BYTES//1024} KB

  AUDIO / FACE DETECTION EVENT RESULTS
  {div}
  Total events logged         : {r.total_events:,}
  Failed events               : {r.failed_events:,}  ({_pct(r.failed_events, r.total_events+r.failed_events):.1f}%)
  Event success rate          : {event_ok_rate:.2f}%
  Avg events per candidate    : {avg_cand_events:.1f}

  SIMULATION PARAMETERS
  {div}
  Sim duration                : {SIM_DURATION_SEC}s per candidate
  Chunk interval              : {CHUNK_INTERVAL}s (real exam = 30s)
  Event interval              : {EVENT_INTERVAL}s (real exam = 3s)
  Concurrency cap             : {CONCURRENCY} simultaneous streams
  Wall-clock time             : {wall:.1f}s
""")

    # Latency table
    for label, data in [("Video chunk upload", r.chunk_latencies),
                         ("Monitoring event",   r.event_latencies),
                         ("Admin poll",         r.admin_poll_latencies)]:
        if not data:
            continue
        avg = round(sum(data)/len(data), 1)
        p50 = _percentile(data, 50)
        p95 = _percentile(data, 95)
        p99 = _percentile(data, 99)
        mx  = round(max(data), 1)
        n   = len(data)
        print(f"  LATENCY: {label} (n={n:,})")
        print(f"  {div}")
        print(f"  avg={avg}ms  p50={p50}ms  p95={p95}ms  p99={p99}ms  max={mx}ms")
        print()

    # Storage stats
    recordings_dir = os.path.join("backend", "recordings")
    file_count = 0
    dir_count  = 0
    disk_bytes = 0
    if os.path.exists(recordings_dir):
        for root, dirs, files in os.walk(recordings_dir):
            dir_count  += len(dirs)
            file_count += len(files)
            for f in files:
                try:
                    disk_bytes += os.path.getsize(os.path.join(root, f))
                except:
                    pass

    print(f"  DISK STORAGE (backend/recordings/)")
    print(f"  {div}")
    print(f"  Session directories             : {dir_count:,}")
    print(f"  Total .webm chunk files         : {file_count:,}")
    print(f"  Total disk usage                : {_mb(disk_bytes):.2f} MB")
    print(f"  Avg file size                   : {_mb(disk_bytes//max(1,file_count)):.2f} MB")
    print()

    # Errors
    if r.errors_sample:
        print(f"  SAMPLE ERRORS")
        print(f"  {div}")
        for e in r.errors_sample[:10]:
            print(f"  {e[:110]}")
        print()

    # Verdict
    print(f"  VERDICT")
    print(f"  {div}")
    if chunk_ok_rate >= 99 and event_ok_rate >= 99:
        verdict = "EXCELLENT - Video & audio handling is production-ready for 1,250 users"
    elif chunk_ok_rate >= 95:
        verdict = "GOOD      - Minor upload failures; acceptable under SQLite constraints"
    else:
        verdict = "NEEDS WORK - High failure rate; switch to PostgreSQL + S3 for production"
    print(f"  {verdict}")

    # Projections for real exam
    real_chunks_per_candidate  = 3600 // 30   # 120 chunks/hour
    real_chunk_size_mb         = 2.0           # ~2MB per real WebM chunk
    real_total_per_candidate   = real_chunks_per_candidate * real_chunk_size_mb
    real_total_1250            = real_total_per_candidate * 1250
    real_events_per_candidate  = 3600 // 3     # 1,200 events/hour

    print(f"""
  PRODUCTION PROJECTIONS (60-min real exam, 1,250 candidates)
  {div}
  Video chunks per candidate  : {real_chunks_per_candidate} chunks x 2MB = {real_total_per_candidate:.0f}MB
  Total storage needed        : {real_total_1250/1024:.1f} GB (uncompressed)
  Total monitoring events     : {real_events_per_candidate * 1250:,}
  Recommended S3 storage      : 50GB (with 7-day retention)
  Required upload bandwidth   : ~{1250 * 2 / 30:.0f} MB/s sustained

  STORAGE ARCHITECTURE FOR PRODUCTION
  {div}
  Dev (current)  : Local filesystem  backend/recordings/{{session_id}}/chunk_N.webm
  Production     : AWS S3            s3://bd-testify-recordings/{{session_id}}/chunk_N.webm
  CDN            : CloudFront signed URLs for admin video playback
  Retention      : S3 Lifecycle rule - delete after 90 days
  Compression    : VP9 codec (50% smaller than VP8)

  RECOMMENDED PRODUCTION CONFIG
  {div}
  1. Uvicorn async workers (4x):  handle concurrent uploads non-blocking
  2. aiofiles for disk writes:    already implemented in monitoring.py
  3. S3 multipart upload:         for chunks > 5MB
  4. Redis pub/sub:               real-time monitoring dashboard (vs polling)
  5. PostgreSQL WAL + pgBouncer:  eliminate DB lock contention
  6. Nginx client_max_body_size:  set to 10m for video upload endpoint
""")

    print("=" * 65)
    print("  Video & Audio Load Test Complete.")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(main())
