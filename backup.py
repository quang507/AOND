#!/usr/bin/env python3
"""Automated SQLite online backup for AOND Core (aioi.db).
Uses Python sqlite3's native connection.backup() API, ensuring safe, atomic,
zero-downtime backups even while the bot is active.
"""
import glob
import os
import sqlite3
import sys
import time
from datetime import datetime

DB_PATH = "/opt/aond_core/aioi.db"
BACKUP_DIR = "/opt/aond_core/backups"
LOG_FILE = "/opt/aond_core/backup.log"
RETENTION_DAYS = 14

def log(msg: str):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {msg}\n"
    print(line.strip())
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line)

def run_backup():
    if not os.path.exists(DB_PATH):
        log(f"ERROR: Database file {DB_PATH} not found!")
        sys.exit(1)

    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest_path = os.path.join(BACKUP_DIR, f"aioi_{ts}.db")

    try:
        source_conn = sqlite3.connect(DB_PATH, timeout=30.0)
        dest_conn = sqlite3.connect(dest_path)
        with dest_conn:
            source_conn.backup(dest_conn)
        dest_conn.close()
        source_conn.close()

        file_size = os.path.getsize(dest_path)
        log(f"SUCCESS: Created backup {dest_path} ({file_size:,} bytes)")
    except Exception as e:
        log(f"ERROR: Backup failed: {e}")
        sys.exit(1)

    # Clean up backups older than RETENTION_DAYS
    now = time.time()
    cutoff = now - (RETENTION_DAYS * 86400)
    for f in glob.glob(os.path.join(BACKUP_DIR, "aioi_*.db")):
        try:
            if os.path.getmtime(f) < cutoff:
                os.remove(f)
                log(f"CLEANUP: Removed old backup {os.path.basename(f)}")
        except Exception as e:
            log(f"WARNING: Cleanup error for {f}: {e}")

if __name__ == "__main__":
    run_backup()
