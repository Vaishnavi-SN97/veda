"""Call every endpoint of a running API (default http://localhost:8000) and report status + time.

    python scripts/smoke_test.py            # read-only calls
    python scripts/smoke_test.py --write    # also the demo story writes (re-seed afterwards)
"""

import sys
import time

import httpx

sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://localhost:8000"
WRITE = "--write" in sys.argv
c = httpx.Client(base_url=BASE, timeout=120)
failures = 0


def call(method: str, path: str, expect: int | None = None, **kw):
    global failures
    t = time.perf_counter()
    try:
        r = c.request(method, path, **kw)
        ok = r.status_code == expect if expect else r.status_code < 400
        detail = "" if ok else f"  {r.text[:200]}"
    except Exception as e:  # noqa: BLE001
        r, ok, detail = None, False, f"  {type(e).__name__}: {e}"
    ms = (time.perf_counter() - t) * 1000
    failures += 0 if ok else 1
    print(f"{'OK ' if ok else 'ERR'} {r.status_code if r else '---'} {ms:7.0f} ms  {method:4} {path}{detail}")
    return r.json() if ok and r is not None and r.status_code < 400 and r.content else None


for _ in range(30):
    try:
        c.get("/api/health")
        break
    except httpx.HTTPError:
        time.sleep(1)

meta = call("GET", "/api/meta")
this_week, next_week, today = meta["thisWeek"], meta["nextWeek"], meta["today"]
call("GET", "/api/class")
call("GET", "/api/classroom/courses")
topics = call("GET", "/api/topics", params={"grade": 4})
call("GET", "/api/students", params={"grade": 4})
dash = call("GET", "/api/dashboard")
call("GET", f"/api/plans/{this_week}")
call("GET", f"/api/plans/{next_week}", expect=404)  # no plan before generating
att = call("GET", "/api/attendance", params={"grade": 3, "date": today})
call("POST", "/api/attendance/voice", json={"grade": 3, "transcript": "Absent today Kiran and Divya"})
eq = next(t for t in topics if "equivalent" in t["title"].lower())
call("GET", "/api/marks", params={"grade": 4, "topicId": eq["id"]})
call("GET", "/api/insights/students")
call("GET", "/api/insights/students/s-g4-01")
alerts = call("GET", "/api/alerts")
call("GET", "/api/reports")
call("GET", "/api/student/profiles")
call("POST", "/api/student/login", json={"studentId": "s-g4-01", "pin": "1234"})
today_view = call("GET", "/api/student/s-g4-01/today")
call("POST", "/api/tutor", json={"studentId": "s-g4-01", "language": "en", "history": [], "message": "What are equivalent fractions?"})

if dash:
    print(f"\n  dashboard: {len(dash['todayPeriods'])} periods today, {len(dash['alerts'])} open alerts, syllabus {[x['percent'] for x in dash['syllabus']]}")
if alerts:
    for a in alerts:
        print(f"  alert [{a['severity']}] {a['title']}  (risk {a.get('riskScore')})")

if WRITE:
    print("\n-- writes (demo story) --")
    ravi = next(a for a in alerts if a["studentId"] == "s-g4-01")
    call("POST", f"/api/plans/{next_week}/generate")
    call("POST", f"/api/alerts/{ravi['id']}", json={"action": "accept"})
    plan = call("GET", f"/api/plans/{next_week}")
    marked = [p for p in plan["periods"] if any("Re-teach" in s["activity"] for s in p["slots"])]
    print(f"  next week: {len(marked)} period(s) with Ravi's re-teach, changed={[p['changed'] for p in marked]}")
    call("POST", f"/api/plans/{next_week}/replan", json={"reason": "teacher_on_duty", "day": 3, "fromPeriodIndex": 4})
    p2 = call("POST", f"/api/plans/{next_week}/move", json={"fromPeriodId": plan["periods"][0]["id"], "toPeriodId": plan["periods"][1]["id"]})
    call("POST", f"/api/plans/{next_week}/approve")
    att["marks"][next(iter(att["marks"]))] = "absent"
    call("PUT", "/api/attendance", json=att)
    dec = next(t for t in topics if t["status"] == "in_progress")
    call("POST", f"/api/topics/{dec['id']}/done")
    deck = call("GET", "/api/decks", params={"topicId": dec["id"], "language": "kn"})
    print(f"  deck: {deck['topicTitle']} cached={deck['cached']} placeholder={deck['placeholder']} first card={deck['cards'][0]['title']}")
    call("GET", "/api/decks", params={"topicId": dec["id"], "language": "kn"})  # cache hit
    call("PUT", f"/api/decks/{deck['id']}", json=deck)
    call("POST", f"/api/decks/{deck['id']}/send", json=deck)
    tv = call("GET", "/api/student/s-g4-03/today")
    d0 = tv["decks"][0]
    call("POST", "/api/student/s-g4-03/quiz", json={"deckId": d0["id"], "answers": [q["answerIndex"] for q in d0["quiz"]]})
    ms = call("GET", "/api/marks", params={"grade": 4, "topicId": eq["id"]})
    call("PUT", "/api/marks", json=ms)
    cls = call("GET", "/api/class")
    call("PUT", "/api/class", json=cls)

print(f"\n{failures} failure(s)")
sys.exit(1 if failures else 0)
