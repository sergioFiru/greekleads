"""
scheduler.py — Railway entrypoint for the 5-Day-Plan daily sync.

Runs daily_sync.run() once per day, at a fixed time inside the 18:00-00:00
Athens/Bucharest window (agreed 2026-08-05: uploads leads in the evening so
Instantly's own 09:00-18:00 working-hours sending schedule — already set on
the "New Firms 60" campaign — picks them up fresh the next business day).

Timezone-aware via zoneinfo (Europe/Athens), NOT a plain UTC cron — a static
UTC time would drift by an hour every DST transition. Athens and Nicosia
(the campaign's own configured timezone) share the same clock, so this stays
in sync with Instantly's sending window automatically.

This is its own long-running process, entirely separate from the GreekLeads
live-watcher bots (scripts/runner.py) — different Railway service, deploy
this folder (scripts/five_day_plan/) as its own service with its own
Procfile.
"""
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import daily_sync

ATHENS = ZoneInfo("Europe/Athens")
RUN_HOUR = 19  # any fixed time inside 18:00-24:00 works; picked with buffer either side


def next_run(now: datetime) -> datetime:
    target = now.replace(hour=RUN_HOUR, minute=0, second=0, microsecond=0)
    if now >= target:
        target += timedelta(days=1)
    return target


def main():
    print("[5day-scheduler] Starting. Runs once daily at "
          f"{RUN_HOUR:02d}:00 Europe/Athens.")
    while True:
        now = datetime.now(ATHENS)
        target = next_run(now)
        sleep_s = (target - now).total_seconds()
        print(f"[5day-scheduler] Next run: {target.isoformat()} "
              f"(sleeping {sleep_s / 3600:.1f}h)")
        time.sleep(max(sleep_s, 1))

        try:
            daily_sync.run()
        except Exception as e:
            print(f"[5day-scheduler] daily_sync.run() failed: {e}")

        time.sleep(60)  # small buffer past the trigger before recomputing next_run


if __name__ == "__main__":
    main()
