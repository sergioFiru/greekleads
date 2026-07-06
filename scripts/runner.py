"""
runner.py — Railway entry point.

Runs all bots on their schedules. To add a new bot:
  1. Create scripts/bots/your_bot.py with a run(db, gemi) function and an INTERVAL (minutes)
  2. Import it here and add one line to BOTS list below.
"""

import logging
import time
import schedule
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

import db as _db
import gemi as _gemi

# ---------------------------------------------------------------------------
# Register bots here
# ---------------------------------------------------------------------------
from bots import new_firms_watcher
# from bots import linkedin_enricher   ← add future bots like this
# from bots import contact_finder

BOTS = [
    new_firms_watcher,
    # linkedin_enricher,
    # contact_finder,
]
# ---------------------------------------------------------------------------

def make_job(bot):
    def job():
        conn = _db.get_conn()
        bot.run(conn, _gemi)
    return job


def main():
    log.info("")
    log.info("=" * 56)
    log.info("  LIVE UPDATER STARTING")
    log.info("  Bulk load done — switching to continuous mode.")
    log.info("=" * 56)
    log.info("")

    for bot in BOTS:
        job = make_job(bot)
        schedule.every(bot.INTERVAL).minutes.do(job)
        log.info(f"Scheduled [{bot.NAME}] every {bot.INTERVAL} min")
        job()  # run once immediately on startup

    log.info("All bots scheduled. Running...\n")

    while True:
        schedule.run_pending()
        time.sleep(30)


if __name__ == "__main__":
    main()
