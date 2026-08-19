from __future__ import annotations

import random
import sqlite3
import threading
from contextlib import closing
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from config import DATABASE_PATH, SIMULATION_SOURCE, TIMEZONE
from simulator.parking_config import PARKING_ROWS, SECTION_BEHAVIOUR, ParkingRowConfig


class ParkingOccupancySimulator:
    def __init__(self, database_path: Path = DATABASE_PATH, source: str = SIMULATION_SOURCE):
        self.database_path = database_path
        self.source = source
        self.timezone = ZoneInfo(TIMEZONE)
        self._lock = threading.RLock()
        self._rows: dict[tuple[str, str], dict[str, Any]] = {}
        self._last_update_entries: dict[tuple[str, str], tuple[int, int]] = {}
        self._scheduler_thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._scheduler_started = False

        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
        self.reset(save_history=True)

    def start_scheduler(self, interval_seconds: int) -> None:
        if self._scheduler_started:
            return

        self._scheduler_started = True
        self._stop_event.clear()
        self._scheduler_thread = threading.Thread(
            target=self._run_scheduler,
            args=(interval_seconds,),
            name="parking-occupancy-simulator",
            daemon=True,
        )
        self._scheduler_thread.start()

    def stop_scheduler(self) -> None:
        self._stop_event.set()
        if self._scheduler_thread and self._scheduler_thread.is_alive():
            self._scheduler_thread.join(timeout=2)
        self._scheduler_started = False

    def _run_scheduler(self, interval_seconds: int) -> None:
        while not self._stop_event.wait(interval_seconds):
            self.update()

    def reset(self, save_history: bool = True) -> dict[str, Any]:
        with self._lock:
            now = self._now()
            self._rows = {}
            self._last_update_entries = {}
            for index, row_config in enumerate(PARKING_ROWS):
                target_percentage = self._target_percentage(now, row_config.section)
                row_variation = 0.88 + ((index % 5) * 0.06) + random.uniform(-0.04, 0.04)
                occupied = round(row_config.capacity * min(0.96, max(0.04, target_percentage * row_variation)))
                self._rows[(row_config.section, row_config.row)] = self._build_row(row_config, occupied)
                self._last_update_entries[(row_config.section, row_config.row)] = (0, 0)

            if save_history:
                self._save_snapshot(now)

            return self.get_occupancy()

    def update(self) -> dict[str, Any]:
        with self._lock:
            now = self._now()
            updated_rows: dict[tuple[str, str], dict[str, Any]] = {}
            last_entries: dict[tuple[str, str], tuple[int, int]] = {}

            for index, row_config in enumerate(PARKING_ROWS):
                current = self._rows[(row_config.section, row_config.row)]
                occupied = int(current["occupied"])
                arrivals, departures = self._movement_for_row(row_config, occupied, now, index)
                new_occupied = min(row_config.capacity, max(0, occupied + arrivals - departures))
                actual_entries = max(0, new_occupied - occupied)
                actual_exits = max(0, occupied - new_occupied)

                updated_rows[(row_config.section, row_config.row)] = self._build_row(row_config, new_occupied)
                last_entries[(row_config.section, row_config.row)] = (actual_entries, actual_exits)

            self._rows = updated_rows
            self._last_update_entries = last_entries
            self._save_snapshot(now)
            return self.get_occupancy()

    def get_occupancy(self) -> dict[str, Any]:
        with self._lock:
            timestamp = self._now().isoformat(timespec="seconds")
            rows = [dict(row) for row in self._rows.values()]
            return self._build_response(rows, timestamp)

    def get_section(self, section: str) -> dict[str, Any] | None:
        section = section.upper()
        with self._lock:
            rows = [dict(row) for row in self._rows.values() if row["section"] == section]
            if not rows:
                return None
            return self._section_summary(section, rows)

    def get_row(self, section: str, row: str) -> dict[str, Any] | None:
        with self._lock:
            item = self._rows.get((section.upper(), row.upper()))
            return dict(item) if item else None

    def get_history(self, section: str | None = None, row: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        limit = min(max(limit, 1), 1000)
        query = (
            "SELECT timestamp, section, row, capacity, occupied, available, "
            "occupancy_percentage, entries, exits FROM occupancy_history"
        )
        params: list[Any] = []
        filters: list[str] = []

        if section:
            filters.append("section = ?")
            params.append(section.upper())
        if row:
            filters.append("row = ?")
            params.append(row.upper())
        if filters:
            query += " WHERE " + " AND ".join(filters)
        query += " ORDER BY id DESC LIMIT ?"
        params.append(limit)

        with closing(sqlite3.connect(self.database_path)) as conn:
            conn.row_factory = sqlite3.Row
            records = conn.execute(query, params).fetchall()

        return [
            {
                "timestamp": record["timestamp"],
                "section": record["section"],
                "row": record["row"],
                "capacity": record["capacity"],
                "occupied": record["occupied"],
                "available": record["available"],
                "occupancyPercentage": record["occupancy_percentage"],
                "entries": record["entries"],
                "exits": record["exits"],
            }
            for record in records
        ]

    def _movement_for_row(
        self,
        row_config: ParkingRowConfig,
        occupied: int,
        now: datetime,
        index: int,
    ) -> tuple[int, int]:
        arrival_rate, departure_rate = self._time_rates(now)
        behaviour = SECTION_BEHAVIOUR[row_config.section]
        row_variation = 0.88 + ((index % 7) * 0.04)
        capacity_factor = row_config.capacity / 48
        fullness = occupied / row_config.capacity if row_config.capacity else 0

        # Make the process mean-reverting instead of allowing 100% occupancy
        # to become an absorbing state. Arrival pressure disappears as the row
        # fills, while departure pressure increases above the time-of-day
        # target occupancy.
        target_fullness = min(
            0.96,
            max(0.04, self._target_percentage(now, row_config.section) * row_variation),
        )
        target_occupied = round(row_config.capacity * target_fullness)
        occupancy_gap = target_occupied - occupied
        available_ratio = max(0.0, 1.0 - fullness)

        expected_arrivals = (
            arrival_rate
            * behaviour["arrival_multiplier"]
            * row_variation
            * capacity_factor
            * available_ratio
        )
        expected_departures = (
            departure_rate
            * behaviour["departure_multiplier"]
            * row_variation
            * capacity_factor
            * (0.35 + fullness * 0.75)
        )

        if occupancy_gap > 0:
            expected_arrivals += min(2.5, occupancy_gap * 0.12)
        elif occupancy_gap < 0:
            expected_departures += min(3.0, abs(occupancy_gap) * 0.16)

        arrivals = self._small_count(expected_arrivals)
        departures = self._small_count(expected_departures)
        if occupied >= row_config.capacity:
            # A full row must free at least one space on its next simulation
            # tick; there is no available space for a successful arrival.
            arrivals = 0
            departures = max(1, departures)
        return arrivals, departures

    def _time_rates(self, now: datetime) -> tuple[float, float]:
        minutes = now.hour * 60 + now.minute
        if 360 <= minutes < 480:
            return 1.2, 0.25
        if 480 <= minutes < 630:
            return 3.4, 0.45
        if 630 <= minutes < 720:
            return 0.95, 0.75
        if 720 <= minutes < 840:
            return 1.5, 1.35
        if 840 <= minutes < 990:
            return 1.25, 0.95
        if 990 <= minutes < 1140:
            return 0.45, 2.2
        return 0.18, 0.75

    def _target_percentage(self, now: datetime, section: str) -> float:
        minutes = now.hour * 60 + now.minute
        if 360 <= minutes < 480:
            base = 0.18 + ((minutes - 360) / 120) * 0.18
        elif 480 <= minutes < 630:
            base = 0.40 + ((minutes - 480) / 150) * 0.36
        elif 630 <= minutes < 720:
            base = 0.74
        elif 720 <= minutes < 840:
            base = 0.66
        elif 840 <= minutes < 990:
            base = 0.70
        elif 990 <= minutes < 1140:
            base = 0.66 - ((minutes - 990) / 150) * 0.38
        else:
            base = 0.18

        section_adjustment = {"A": 0.08, "B": 0.0, "C": -0.07}[section]
        return min(0.96, max(0.05, base + section_adjustment))

    def _small_count(self, expected: float) -> int:
        expected = max(0.0, min(expected, 5.0))
        count = int(expected)
        if random.random() < expected - count:
            count += 1
        if expected > 1.2 and random.random() < 0.12:
            count += 1
        return min(count, 6)

    def _build_row(self, row_config: ParkingRowConfig, occupied: int) -> dict[str, Any]:
        occupied = min(row_config.capacity, max(0, occupied))
        available = row_config.capacity - occupied
        percentage = round((occupied / row_config.capacity) * 100, 1) if row_config.capacity else 0
        return {
            "row": row_config.row,
            "section": row_config.section,
            "capacity": row_config.capacity,
            "occupied": occupied,
            "available": available,
            "occupancyPercentage": percentage,
            "status": self._status(percentage),
        }

    def _build_response(self, rows: list[dict[str, Any]], timestamp: str) -> dict[str, Any]:
        sections = [
            self._section_summary(section, [row for row in rows if row["section"] == section])
            for section in ("A", "B", "C")
        ]
        total_capacity = sum(section["capacity"] for section in sections)
        total_occupied = sum(section["occupied"] for section in sections)
        total_available = total_capacity - total_occupied
        overall_percentage = round((total_occupied / total_capacity) * 100, 1) if total_capacity else 0
        return {
            "timestamp": timestamp,
            "source": self.source,
            "totalCapacity": total_capacity,
            "totalOccupied": total_occupied,
            "totalAvailable": total_available,
            "overallOccupancyPercentage": overall_percentage,
            "sections": sections,
        }

    def _section_summary(self, section: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
        capacity = sum(row["capacity"] for row in rows)
        occupied = sum(row["occupied"] for row in rows)
        available = capacity - occupied
        percentage = round((occupied / capacity) * 100, 1) if capacity else 0
        return {
            "section": section,
            "capacity": capacity,
            "occupied": occupied,
            "available": available,
            "occupancyPercentage": percentage,
            "rows": rows,
        }

    def _status(self, percentage: float) -> str:
        if percentage >= 80:
            return "HIGH"
        if percentage >= 50:
            return "MEDIUM"
        return "LOW"

    def _save_snapshot(self, timestamp: datetime) -> None:
        records = []
        for key, row in self._rows.items():
            entries, exits = self._last_update_entries.get(key, (0, 0))
            records.append(
                (
                    timestamp.isoformat(timespec="seconds"),
                    row["section"],
                    row["row"],
                    row["capacity"],
                    row["occupied"],
                    row["available"],
                    row["occupancyPercentage"],
                    entries,
                    exits,
                )
            )

        with closing(sqlite3.connect(self.database_path)) as conn:
            conn.executemany(
                """
                INSERT INTO occupancy_history (
                    timestamp, section, row, capacity, occupied, available,
                    occupancy_percentage, entries, exits
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                records,
            )
            conn.commit()

    def _init_db(self) -> None:
        with closing(sqlite3.connect(self.database_path)) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS occupancy_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    section TEXT NOT NULL,
                    row TEXT NOT NULL,
                    capacity INTEGER NOT NULL,
                    occupied INTEGER NOT NULL,
                    available INTEGER NOT NULL,
                    occupancy_percentage REAL NOT NULL,
                    entries INTEGER NOT NULL,
                    exits INTEGER NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_occupancy_history_section_row ON occupancy_history(section, row, id)"
            )
            conn.commit()

    def _now(self) -> datetime:
        return datetime.now(self.timezone)
