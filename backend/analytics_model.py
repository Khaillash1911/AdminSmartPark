from __future__ import annotations

import csv
from datetime import date, datetime, timedelta
from pathlib import Path
from statistics import mean, stdev
from typing import Any

import joblib
import pandas as pd


ROOT_DIR = Path(__file__).resolve().parent.parent
RESEARCH_DIR = ROOT_DIR / "research" / "parking-analytics"
MODEL_DIR = RESEARCH_DIR / "monthly" / "outputs" / "models"
MONTHLY_SOURCE = RESEARCH_DIR / "monthly" / "monthly_parking_source.csv"
HOURLY_SOURCE = RESEARCH_DIR / "hourly" / "combined_daily_parking.csv"


class ParkingAnalyticsPredictor:
    """Run the trained next-day models with the exact research feature contract."""

    def __init__(self) -> None:
        self.entry_model = joblib.load(MODEL_DIR / "best_entry_prediction_model.pkl")
        self.exit_model = joblib.load(MODEL_DIR / "best_exit_prediction_model.pkl")
        self.feature_names = (MODEL_DIR / "model_features.txt").read_text(encoding="utf-8").splitlines()
        self.historical_days = self._load_monthly_history()
        self.hourly_progress = self._load_hourly_progress()
        self.hourly_profile = self._load_hourly_profile()

    def predict(self, live_days: list[dict[str, Any]], as_of: datetime) -> dict[str, Any]:
        normalised = self._normalise_live_days(live_days)
        current_day_projected = False
        observed_current = dict(normalised[-1]) if normalised else None

        if normalised and normalised[-1]["date"] == as_of.date():
            normalised[-1], current_day_projected = self._project_partial_day(normalised[-1], as_of.hour)

        required_history = max(0, 8 - len(normalised))
        combined = self.historical_days[-required_history:] + normalised if required_history else normalised[-31:]
        if len(combined) < 8:
            raise ValueError("At least eight daily traffic records are required for prediction.")

        current = combined[-1]
        prior = combined[-8:-1]
        prior_three = combined[-4:-1]
        target_date = current["date"] + timedelta(days=1)
        feature_values = {
            "Entries": current["entries"],
            "Exits": current["exits"],
            "Month": current["date"].month,
            "DayOfWeekNum": current["date"].weekday(),
            "IsWeekend": int(current["date"].weekday() >= 5),
            "NetFlow": current["entries"] - current["exits"],
            "PrevDayEntries": prior[-1]["entries"],
            "PrevDayExits": prior[-1]["exits"],
            "EntryRolling7": mean(day["entries"] for day in prior),
            "ExitRolling7": mean(day["exits"] for day in prior),
            "EntryRollingStd7": stdev(day["entries"] for day in prior),
            "EntriesLag7": prior[0]["entries"],
            "ExitsLag7": prior[0]["exits"],
            "EntryRolling3": mean(day["entries"] for day in prior_three),
            "ExitRolling3": mean(day["exits"] for day in prior_three),
            "TargetDayOfWeekNum": target_date.weekday(),
            "TargetIsWeekend": int(target_date.weekday() >= 5),
            "TargetMonth": target_date.month,
        }
        ordered = pd.DataFrame(
            [[feature_values[name] for name in self.feature_names]],
            columns=self.feature_names,
        )
        predicted_entries = max(0, round(float(self.entry_model.predict(ordered)[0])))
        predicted_exits = max(0, round(float(self.exit_model.predict(ordered)[0])))

        return {
            "predictionDate": target_date.isoformat(),
            "predictedEntries": predicted_entries,
            "predictedExits": predicted_exits,
            "predictedNetFlow": predicted_entries - predicted_exits,
            "demandLevel": self._demand_level(predicted_entries),
            "model": "Linear Regression",
            "entryR2": 0.876402,
            "exitR2": 0.767156,
            "inputSource": "LIVE" if required_history == 0 else "LIVE_WITH_RESEARCH_BASELINE",
            "liveDaysUsed": len(normalised),
            "researchDaysUsed": required_history,
            "currentDayProjected": current_day_projected,
            "currentDayEntries": int(current["entries"]),
            "currentDayExits": int(current["exits"]),
            "observedCurrentEntries": int(observed_current["entries"]) if observed_current else 0,
            "observedCurrentExits": int(observed_current["exits"]) if observed_current else 0,
            "asOf": as_of.isoformat(timespec="seconds"),
            "hourlyProfile": self.hourly_profile,
            "features": feature_values,
        }

    def _normalise_live_days(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        totals: dict[date, dict[str, Any]] = {}
        for row in rows:
            try:
                day = date.fromisoformat(str(row["date"])[:10])
                entries = max(0, int(row.get("entries", 0)))
                exits = max(0, int(row.get("exits", 0)))
            except (KeyError, TypeError, ValueError):
                continue
            totals.setdefault(day, {"date": day, "entries": 0, "exits": 0})
            totals[day]["entries"] += entries
            totals[day]["exits"] += exits
        return [totals[day] for day in sorted(totals)]

    def _project_partial_day(self, row: dict[str, Any], hour: int) -> tuple[dict[str, Any], bool]:
        if hour >= 23:
            return row, False
        progress = self.hourly_progress[min(max(hour, 0), 23)]
        projected = dict(row)
        projected["entries"] = round(row["entries"] / max(progress["entries"], 0.05))
        projected["exits"] = round(row["exits"] / max(progress["exits"], 0.05))
        return projected, True

    def _load_monthly_history(self) -> list[dict[str, Any]]:
        with MONTHLY_SOURCE.open(newline="", encoding="utf-8") as handle:
            return [
                {
                    "date": date.fromisoformat(row["Date"]),
                    "entries": int(row["Entries"]),
                    "exits": int(row["Exits"]),
                }
                for row in csv.DictReader(handle)
            ]

    def _load_hourly_progress(self) -> list[dict[str, float]]:
        hourly_entries = [0.0] * 24
        hourly_exits = [0.0] * 24
        days: set[str] = set()
        with HOURLY_SOURCE.open(newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                hour = int(row["Time"][:2])
                hourly_entries[hour] += int(row["Entries"])
                hourly_exits[hour] += int(row["Exits"])
                days.add(row["Date"])
        entry_total = sum(hourly_entries) or 1
        exit_total = sum(hourly_exits) or 1
        progress = []
        cumulative_entries = cumulative_exits = 0.0
        for hour in range(24):
            cumulative_entries += hourly_entries[hour]
            cumulative_exits += hourly_exits[hour]
            progress.append({"entries": cumulative_entries / entry_total, "exits": cumulative_exits / exit_total})
        return progress

    def _load_hourly_profile(self) -> list[dict[str, Any]]:
        totals = [{"entries": 0, "exits": 0, "samples": 0} for _ in range(24)]
        with HOURLY_SOURCE.open(newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                hour = int(row["Time"][:2])
                totals[hour]["entries"] += int(row["Entries"])
                totals[hour]["exits"] += int(row["Exits"])
                totals[hour]["samples"] += 1
        return [
            {
                "hour": hour,
                "label": f"{hour:02d}:00",
                "averageEntries": round(values["entries"] / max(values["samples"], 1), 1),
                "averageExits": round(values["exits"] / max(values["samples"], 1), 1),
            }
            for hour, values in enumerate(totals)
        ]

    @staticmethod
    def _demand_level(entries: int) -> str:
        if entries < 580.84:
            return "LOW"
        if entries < 2631.20:
            return "MEDIUM"
        return "HIGH"
