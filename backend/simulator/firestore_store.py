from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from google.cloud.firestore_v1.base_query import FieldFilter


class FirestoreParkingStore:
    CURRENT_COLLECTION = "parking_simulation"
    CURRENT_DOCUMENT = "current"
    HISTORY_COLLECTION = "parking_occupancy_history"

    def __init__(self, client: Any):
        self.client = client

    def load_current(self) -> dict[str, Any] | None:
        snapshot = (
            self.client.collection(self.CURRENT_COLLECTION)
            .document(self.CURRENT_DOCUMENT)
            .get()
        )
        return snapshot.to_dict() if snapshot.exists else None

    def try_acquire_simulation(self, minimum_interval_seconds: int = 55) -> bool:
        from google.cloud import firestore

        reference = self.client.collection(self.CURRENT_COLLECTION).document("control")
        transaction = self.client.transaction()

        @firestore.transactional
        def claim(current_transaction):
            snapshot = reference.get(transaction=current_transaction)
            last_run = (snapshot.to_dict() or {}).get("lastSimulationAt") if snapshot.exists else None
            now = datetime.now(timezone.utc)
            if last_run is not None:
                if last_run.tzinfo is None:
                    last_run = last_run.replace(tzinfo=timezone.utc)
                if (now - last_run).total_seconds() < minimum_interval_seconds:
                    return False
            current_transaction.set(reference, {"lastSimulationAt": now}, merge=True)
            return True

        return bool(claim(transaction))

    def save_snapshot(
        self,
        timestamp: datetime,
        rows: list[dict[str, Any]],
        movements: dict[tuple[str, str], tuple[int, int]],
        source: str,
    ) -> None:
        stored_rows = []
        total_entries = 0
        total_exits = 0
        for row in rows:
            entries, exits = movements.get((row["section"], row["row"]), (0, 0))
            stored = {**row, "entries": entries, "exits": exits}
            stored_rows.append(stored)
            total_entries += entries
            total_exits += exits

        current = {
            "timestamp": timestamp,
            "source": source,
            "rows": stored_rows,
        }
        history = {
            **current,
            "date": timestamp.date().isoformat(),
            "totalEntries": total_entries,
            "totalExits": total_exits,
        }
        history_id = f"{timestamp.strftime('%Y%m%dT%H%M%S%f')}-{uuid4().hex[:8]}"

        batch = self.client.batch()
        batch.set(
            self.client.collection(self.CURRENT_COLLECTION).document(self.CURRENT_DOCUMENT),
            current,
        )
        batch.set(self.client.collection(self.HISTORY_COLLECTION).document(history_id), history)
        batch.commit()

    def get_history(
        self,
        section: str | None = None,
        row: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        query = self.client.collection(self.HISTORY_COLLECTION).order_by(
            "timestamp", direction="DESCENDING"
        ).limit(limit)
        records: list[dict[str, Any]] = []
        for snapshot in query.stream():
            data = snapshot.to_dict()
            timestamp = self._timestamp_text(data.get("timestamp"))
            for item in reversed(data.get("rows", [])):
                if section and item.get("section") != section.upper():
                    continue
                if row and item.get("row") != row.upper():
                    continue
                records.append(self._history_record(timestamp, item))
                if len(records) >= limit:
                    return records
        return records

    def get_daily_traffic(self, start: datetime, limit: int) -> list[dict[str, Any]]:
        query = (
            self.client.collection(self.HISTORY_COLLECTION)
            .where(filter=FieldFilter("timestamp", ">=", start))
            .order_by("timestamp")
        )
        totals: dict[str, dict[str, int]] = {}
        for snapshot in query.stream():
            data = snapshot.to_dict()
            day = data.get("date") or self._timestamp_text(data.get("timestamp"))[:10]
            aggregate = totals.setdefault(day, {"entries": 0, "exits": 0})
            aggregate["entries"] += int(data.get("totalEntries", 0))
            aggregate["exits"] += int(data.get("totalExits", 0))

        days = sorted(totals)[-limit:]
        return [{"date": day, **totals[day]} for day in days]

    @staticmethod
    def _timestamp_text(value: Any) -> str:
        if isinstance(value, datetime):
            return value.isoformat(timespec="seconds")
        return str(value or "")

    @staticmethod
    def _history_record(timestamp: str, item: dict[str, Any]) -> dict[str, Any]:
        return {
            "timestamp": timestamp,
            "section": item["section"],
            "row": item["row"],
            "capacity": int(item["capacity"]),
            "occupied": int(item["occupied"]),
            "available": int(item["available"]),
            "occupancyPercentage": float(item["occupancyPercentage"]),
            "entries": int(item.get("entries", 0)),
            "exits": int(item.get("exits", 0)),
        }
