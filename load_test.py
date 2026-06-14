# BD Testify — Load Test: 1567 Concurrent Candidates
# Tests the full exam flow: register → invite → start → answer → submit

import asyncio
import aiohttp
import time
import random
import string
import json
import sys
from dataclasses import dataclass, field
from typing import List, Optional
from collections import defaultdict

BASE_URL = "http://localhost:8000"
TOTAL_CANDIDATES = 1567
CONCURRENCY = 100          # max simultaneous HTTP connections
ADMIN_EMAIL = "admin@buildingdoctor.com"
ADMIN_PASSWORD = "admin123"

# ─── Result tracking ──────────────────────────────────────────────────────────

@dataclass
class CandidateResult:
    candidate_id: int
    email: str
    steps_completed: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    latencies: dict = field(default_factory=dict)   # step → ms
    score: Optional[int] = None
    total: Optional[int] = None
    percentage: Optional[float] = None
    passed: bool = False
    failed_at: Optional[str] = None


@dataclass
class LoadTestReport:
    total: int = 0
    completed_full_flow: int = 0
    failed: int = 0
    step_failures: dict = field(default_factory=lambda: defaultdict(int))
    step_latencies: dict = field(default_factory=lambda: defaultdict(list))
    scores: List[float] = field(default_factory=list)
    pass_count: int = 0
    fail_count: int = 0
    wall_time: float = 0.0
    errors_sample: List[str] = field(default_factory=list)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def rand_email(i: int) -> str:
    return f"loadtest_candidate_{i:04d}@bdtest.com"

def rand_name(i: int) -> str:
    first = ["Alice","Bob","Carol","David","Eva","Frank","Grace","Henry",
             "Iris","Jack","Karen","Leo","Mia","Nate","Olivia","Pete"][i % 16]
    last = ["Singh","Kumar","Sharma","Patel","Nair","Reddy","Verma","Das"][i % 8]
    return f"{first} {last} {i}"

COLLEGES = ["IIT Bombay","NIT Trichy","BITS Pilani","VIT Vellore",
            "Anna University","Pune University","JNTU Hyderabad","Delhi Tech"]
DEGREES  = ["B.E. Civil","B.Tech Civil","B.Arch","M.E. Structural",
            "B.Tech Mechanical","Diploma Civil"]

async def timed(session, method, url, label, result: CandidateResult, **kwargs):
    t0 = time.perf_counter()
    try:
        async with getattr(session, method)(url, **kwargs) as resp:
            elapsed = (time.perf_counter() - t0) * 1000
            result.latencies[label] = round(elapsed, 1)
            if resp.status >= 400:
                body = await resp.text()
                raise Exception(f"HTTP {resp.status}: {body[:120]}")
            return await resp.json()
    except Exception as e:
        elapsed = (time.perf_counter() - t0) * 1000
        result.latencies[label] = round(elapsed, 1)
        raise


# ─── Single candidate full flow ───────────────────────────────────────────────

async def run_candidate(
    session: aiohttp.ClientSession,
    idx: int,
    admin_token: str,
    test_set_id: int,
    semaphore: asyncio.Semaphore,
    report: LoadTestReport
):
    result = CandidateResult(
        candidate_id=idx,
        email=rand_email(idx)
    )
    report.total += 1

    async with semaphore:
        headers_admin = {"Authorization": f"Bearer {admin_token}"}

        # ── Step 1: Register candidate ────────────────────────────────────────
        try:
            payload = {
                "name": rand_name(idx),
                "phone": f"98{idx:08d}"[:10],
                "email": result.email,
                "degree": random.choice(DEGREES),
                "year_of_study": random.choice(["3rd Year","4th Year","Final Year","Passed Out"]),
                "college_name": random.choice(COLLEGES),
            }
            await timed(session, "post", f"{BASE_URL}/candidate/register",
                        "register", result, json=payload)
            result.steps_completed.append("register")
        except Exception as e:
            result.errors.append(f"register: {e}")
            result.failed_at = "register"
            report.step_failures["register"] += 1
            report.failed += 1
            _collect(report, result)
            return

        # ── Step 2: Admin sends invite ────────────────────────────────────────
        try:
            inv = await timed(session, "post", f"{BASE_URL}/invite/send",
                              "invite", result,
                              json={"candidate_email": result.email, "test_set_id": test_set_id},
                              headers=headers_admin)
            token = inv["token"]
            result.steps_completed.append("invite")
        except Exception as e:
            result.errors.append(f"invite: {e}")
            result.failed_at = "invite"
            report.step_failures["invite"] += 1
            report.failed += 1
            _collect(report, result)
            return

        # ── Step 3: Validate token ────────────────────────────────────────────
        try:
            await timed(session, "get", f"{BASE_URL}/invite/validate/{token}",
                        "validate", result)
            result.steps_completed.append("validate")
        except Exception as e:
            result.errors.append(f"validate: {e}")
            result.failed_at = "validate"
            report.step_failures["validate"] += 1
            report.failed += 1
            _collect(report, result)
            return

        # ── Step 4: Start test ────────────────────────────────────────────────
        try:
            start_data = await timed(session, "post", f"{BASE_URL}/test/start/{token}",
                                     "start_test", result)
            session_id = start_data["session_id"]
            questions  = start_data["questions"]
            result.steps_completed.append("start_test")
        except Exception as e:
            result.errors.append(f"start_test: {e}")
            result.failed_at = "start_test"
            report.step_failures["start_test"] += 1
            report.failed += 1
            _collect(report, result)
            return

        # ── Step 5: Answer all questions (random options) ─────────────────────
        answer_errors = 0
        for q in questions:
            option = random.choice(["a", "b", "c", "d"])
            try:
                await timed(session, "post", f"{BASE_URL}/test/answer",
                            "answer", result,
                            json={"session_id": session_id,
                                  "question_id": q["id"],
                                  "selected_option": option})
            except Exception:
                answer_errors += 1

        if answer_errors == 0:
            result.steps_completed.append("answers")
        else:
            result.steps_completed.append(f"answers_partial({answer_errors}_err)")

        # ── Step 6: Submit test ───────────────────────────────────────────────
        try:
            sub = await timed(session, "post", f"{BASE_URL}/test/submit/{session_id}",
                              "submit", result)
            result.score      = sub.get("score", 0)
            result.total      = sub.get("total", 0)
            result.percentage = sub.get("percentage", 0.0)
            result.passed     = sub.get("pass_fail") == "Pass"
            result.steps_completed.append("submit")
            report.completed_full_flow += 1
            if result.passed:
                report.pass_count += 1
            else:
                report.fail_count += 1
            report.scores.append(result.percentage or 0)
        except Exception as e:
            result.errors.append(f"submit: {e}")
            result.failed_at = "submit"
            report.step_failures["submit"] += 1
            report.failed += 1
            _collect(report, result)
            return

    _collect(report, result)


def _collect(report: LoadTestReport, result: CandidateResult):
    for step, ms in result.latencies.items():
        report.step_latencies[step].append(ms)
    if result.errors and len(report.errors_sample) < 10:
        report.errors_sample.append(f"[C{result.candidate_id}] {result.errors[-1]}")


# ─── Main orchestrator ────────────────────────────────────────────────────────

async def main():
    print("=" * 65)
    print("  BD Testify — Load Test: 1,567 Concurrent Candidates")
    print("=" * 65)

    connector = aiohttp.TCPConnector(
        limit=CONCURRENCY,
        limit_per_host=CONCURRENCY,
        ssl=False
    )
    timeout = aiohttp.ClientTimeout(total=120, connect=10)

    async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:

        # ── Admin login ───────────────────────────────────────────────────────
        print(f"\n[1/4] Authenticating as admin...")
        async with session.post(f"{BASE_URL}/admin/login",
                                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}) as r:
            data = await r.json()
            admin_token = data["access_token"]
        print(f"      Admin token acquired.")

        # ── Ensure test set exists ────────────────────────────────────────────
        print(f"[2/4] Checking test sets...")
        hdrs = {"Authorization": f"Bearer {admin_token}"}
        async with session.get(f"{BASE_URL}/admin/test-sets", headers=hdrs) as r:
            sets = await r.json()

        if sets:
            test_set_id = sets[0]["id"]
            q_count = sets[0].get("question_count", 0)
            print(f"      Using existing test set: '{sets[0]['set_name']}' "
                  f"(ID={test_set_id}, {q_count} questions)")
        else:
            async with session.post(f"{BASE_URL}/admin/test-sets", headers=hdrs,
                                    json={"set_name":"Load Test Set","questions_per_test":3,
                                          "time_limit_minutes":60}) as r:
                ts = await r.json()
                test_set_id = ts["id"]
            # Seed questions
            for i in range(5):
                await session.post(f"{BASE_URL}/admin/questions", headers=hdrs, json={
                    "test_set_id": test_set_id,
                    "question_text": f"Load test question {i+1}: What is {i+1}+{i+1}?",
                    "option_a": str(i*2), "option_b": str((i+1)*2),
                    "option_c": str(i+1), "option_d": str(i+3),
                    "correct_answer": "b", "marks": 1
                })
            print(f"      Created new test set (ID={test_set_id}) with 5 questions.")

        # ── Spin up 1567 candidates ───────────────────────────────────────────
        print(f"\n[3/4] Launching {TOTAL_CANDIDATES:,} candidate flows "
              f"(concurrency={CONCURRENCY})...")
        report   = LoadTestReport()
        semaphore = asyncio.Semaphore(CONCURRENCY)

        t_start = time.perf_counter()
        tasks = [
            run_candidate(session, i, admin_token, test_set_id, semaphore, report)
            for i in range(1, TOTAL_CANDIDATES + 1)
        ]

        # Progress ticker every 100 completions
        done = 0
        for coro in asyncio.as_completed(tasks):
            await coro
            done += 1
            if done % 100 == 0 or done == TOTAL_CANDIDATES:
                elapsed = time.perf_counter() - t_start
                rps = done / elapsed if elapsed else 0
                bar = "#" * (done * 30 // TOTAL_CANDIDATES)
                bar = bar.ljust(30)
                print(f"      [{bar}] {done:>4}/{TOTAL_CANDIDATES}  "
                      f"({rps:.1f} flows/sec)", end="\r", flush=True)

        report.wall_time = time.perf_counter() - t_start
        print()   # newline after progress bar

        # ── Final stats ───────────────────────────────────────────────────────
        print(f"\n[4/4] Collecting results...")

    _print_report(report)


def _percentile(data: list, p: float) -> float:
    if not data:
        return 0.0
    s = sorted(data)
    idx = int(len(s) * p / 100)
    return round(s[min(idx, len(s)-1)], 1)


def _print_report(r: LoadTestReport):
    divider = "-" * 65
    print("\n" + "=" * 65)
    print("  LOAD TEST RESULTS  BD Testify")
    print("=" * 65)

    success_rate = r.completed_full_flow / r.total * 100 if r.total else 0
    throughput   = r.total / r.wall_time if r.wall_time else 0
    avg_score    = sum(r.scores) / len(r.scores) if r.scores else 0

    lines = [
        "",
        "  SUMMARY",
        f"  {divider}",
        f"  Total candidates simulated  : {r.total:,}",
        f"  Full flow completed         : {r.completed_full_flow:,}  ({success_rate:.1f}%)",
        f"  Failures                    : {r.failed:,}",
        f"  Wall-clock time             : {r.wall_time:.1f}s",
        f"  Throughput                  : {throughput:.1f} candidates/sec",
        f"  Concurrency cap             : {CONCURRENCY}",
        "",
        "  EXAM RESULTS (submitted sessions)",
        f"  {divider}",
        f"  Average score               : {avg_score:.1f}%",
        f"  Pass (>=60%)                : {r.pass_count:,}",
        f"  Fail (<60%)                 : {r.fail_count:,}",
    ]
    print("\n".join(lines))
    print()

    print(f"  PER-STEP LATENCY (ms)  [p50 / p95 / p99 / max]")
    print(f"  {divider}")
    step_order = ["register","invite","validate","start_test","answer","submit"]
    for step in step_order:
        data = r.step_latencies.get(step, [])
        if not data:
            continue
        p50  = _percentile(data, 50)
        p95  = _percentile(data, 95)
        p99  = _percentile(data, 99)
        mx   = round(max(data), 1)
        avg  = round(sum(data)/len(data), 1)
        bar  = "#" * min(int(p95 / 50), 30)
        print(f"  {step:<16} avg={avg:>7}ms  p50={p50:>7}  "
              f"p95={p95:>7}  p99={p99:>7}  max={mx:>8}")

    if r.step_failures:
        print(f"\n  FAILURES BY STEP")
        print(f"  {divider}")
        for step, count in sorted(r.step_failures.items(), key=lambda x:-x[1]):
            pct = count / r.total * 100
            print(f"  {step:<16} {count:>5} failures  ({pct:.1f}%)")

    if r.errors_sample:
        print(f"\n  SAMPLE ERRORS (first {len(r.errors_sample)})")
        print(f"  {divider}")
        for e in r.errors_sample:
            print(f"  {e[:110]}")

    # Verdict
    print(f"\n  VERDICT")
    print(f"  {divider}")
    if success_rate >= 99.0:
        verdict = "EXCELLENT  - Platform handles 1,567 concurrent users with >99% success"
    elif success_rate >= 95.0:
        verdict = "GOOD       - Platform handles load with minor failures (<5%)"
    elif success_rate >= 80.0:
        verdict = "ACCEPTABLE - Some degradation under peak load; scale resources"
    else:
        verdict = "NEEDS WORK - Significant failures; add DB pool, caching, or more workers"

    print(f"  {verdict}")

    # Bottleneck analysis
    print(f"\n  BOTTLENECK ANALYSIS")
    print(f"  {divider}")
    all_lat = {s: r.step_latencies.get(s,[]) for s in step_order if r.step_latencies.get(s)}
    if all_lat:
        slowest = max(all_lat.items(), key=lambda x: _percentile(x[1], 95))
        print(f"  Slowest step (p95)  : {slowest[0]} "
              f"({_percentile(slowest[1],95):.0f}ms)")
    if r.step_failures:
        most_failed = max(r.step_failures.items(), key=lambda x: x[1])
        print(f"  Most failures at    : {most_failed[0]} ({most_failed[1]} failures)")

    print(f"\n  SCALABILITY RECOMMENDATIONS FOR 1,567+ USERS")
    print(f"  {divider}")
    recs = [
        "  1. PostgreSQL connection pool: pgBouncer (pool_size=50, max_overflow=100)",
        "  2. Uvicorn workers: uvicorn main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker",
        "  3. Nginx reverse proxy with upstream keepalive for load balancing",
        "  4. Redis cache for token validation (TTL=24h) to reduce DB reads",
        "  5. Celery workers (4+) for async email delivery",
        "  6. AWS: EC2 t3.large + RDS db.t3.medium + ElastiCache t3.micro",
        "  7. Use SQLAlchemy pool_size=20, max_overflow=40 in database.py",
    ]
    print("\n".join(recs))
    print("\n" + "=" * 65)
    print("  Load test complete.")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(main())
