"""Backfill violation notifications into the dedicated Firestore collection."""

from __future__ import annotations

from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore


ROOT_DIR = Path(__file__).resolve().parent.parent
SERVICE_ACCOUNT = ROOT_DIR / "find_my_car_system" / "backend" / "serviceAccountKey.json"
SUPPORTED_TYPES = {"double_park", "oku_violation"}


def migrate() -> tuple[int, int]:
    if not SERVICE_ACCOUNT.exists():
        raise FileNotFoundError(f"Firebase service account not found: {SERVICE_ACCOUNT}")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(str(SERVICE_ACCOUNT)))
    database = firestore.client()

    scanned = migrated = 0
    batch = database.batch()
    pending = 0
    for snapshot in database.collection("notifications").stream():
        scanned += 1
        data = snapshot.to_dict() or {}
        if data.get("type") not in SUPPORTED_TYPES:
            continue
        resolved = bool(data.get("resolved", False))
        record = {
            **data,
            "notification_id": snapshot.id,
            "status": "resolved" if resolved else ("read" if data.get("is_read") else "active"),
        }
        batch.set(database.collection("violations").document(snapshot.id), record, merge=True)
        pending += 1
        migrated += 1
        if pending == 400:
            batch.commit()
            batch = database.batch()
            pending = 0
    if pending:
        batch.commit()
    return scanned, migrated


if __name__ == "__main__":
    scanned_count, migrated_count = migrate()
    print(f"Scanned {scanned_count} notification(s).")
    print(f"Migrated {migrated_count} violation(s) into Firestore collection 'violations'.")
