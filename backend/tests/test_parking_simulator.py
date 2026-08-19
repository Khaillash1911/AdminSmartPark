import os
import unittest
from copy import deepcopy

os.environ["PARKING_SKIP_DEFAULT_APP"] = "1"

from backend.parking_occupancy import create_app
from backend.simulator.occupancy_simulator import ParkingOccupancySimulator
from detection.parking_detector_api import _is_oku_violation


class ParkingSimulatorTests(unittest.TestCase):
    class MemoryStore:
        def __init__(self):
            self.current = None
            self.snapshots = []

        def load_current(self):
            return deepcopy(self.current)

        def save_snapshot(self, timestamp, rows, movements, source):
            stored_rows = []
            for item in rows:
                entries, exits = movements.get((item["section"], item["row"]), (0, 0))
                stored_rows.append({**deepcopy(item), "entries": entries, "exits": exits})
            self.current = {"timestamp": timestamp, "source": source, "rows": stored_rows}
            self.snapshots.append(deepcopy(self.current))

        def get_history(self, section=None, row=None, limit=100):
            records = []
            for snapshot in reversed(self.snapshots):
                for item in reversed(snapshot["rows"]):
                    if section and item["section"] != section.upper():
                        continue
                    if row and item["row"] != row.upper():
                        continue
                    records.append({
                        "timestamp": snapshot["timestamp"].isoformat(timespec="seconds"),
                        **deepcopy(item),
                    })
                    if len(records) == limit:
                        return records
            return records

        def get_daily_traffic(self, start, limit):
            totals = {}
            for snapshot in self.snapshots:
                if snapshot["timestamp"] < start:
                    continue
                day = snapshot["timestamp"].date().isoformat()
                value = totals.setdefault(day, {"entries": 0, "exits": 0})
                value["entries"] += sum(item["entries"] for item in snapshot["rows"])
                value["exits"] += sum(item["exits"] for item in snapshot["rows"])
            return [{"date": day, **totals[day]} for day in sorted(totals)[-limit:]]

    def create_simulator(self) -> ParkingOccupancySimulator:
        return ParkingOccupancySimulator(store=self.MemoryStore())

    def create_test_app(self):
        return create_app(start_scheduler=False, simulator=self.create_simulator())

    def test_row_values_stay_within_capacity(self):
        simulator = self.create_simulator()
        for _ in range(25):
            data = simulator.update()
            for section in data["sections"]:
                for row in section["rows"]:
                    self.assertGreaterEqual(row["occupied"], 0)
                    self.assertLessEqual(row["occupied"], row["capacity"])

    def test_available_and_percentage_are_calculated_correctly(self):
        simulator = self.create_simulator()
        row = simulator.get_row("A", "A")
        self.assertIsNotNone(row)
        assert row is not None
        self.assertEqual(row["available"], row["capacity"] - row["occupied"])
        expected_percentage = round((row["occupied"] / row["capacity"]) * 100, 1)
        self.assertEqual(row["occupancyPercentage"], expected_percentage)

    def test_status_thresholds(self):
        simulator = self.create_simulator()
        self.assertEqual(simulator._status(49), "LOW")
        self.assertEqual(simulator._status(50), "MEDIUM")
        self.assertEqual(simulator._status(79), "MEDIUM")
        self.assertEqual(simulator._status(80), "HIGH")

    def test_api_returns_valid_structure(self):
        app = self.create_test_app()
        client = app.test_client()
        response = client.get("/api/parking/occupancy")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["source"], "SIMULATION")
        self.assertIn("sections", data)
        self.assertEqual(len(data["sections"]), 3)
        self.assertGreater(data["totalCapacity"], 0)

    def test_reset_and_forced_update_work(self):
        app = self.create_test_app()
        client = app.test_client()
        reset_response = client.post("/api/parking/simulation/reset")
        update_response = client.post("/api/parking/simulation/update")
        self.assertEqual(reset_response.status_code, 200)
        self.assertEqual(update_response.status_code, 200)
        self.assertTrue(reset_response.get_json()["success"])
        self.assertTrue(update_response.get_json()["success"])

    def test_analytics_prediction_uses_saved_research_models(self):
        app = self.create_test_app()
        client = app.test_client()
        response = client.post(
            "/api/parking/analytics/predict",
            json={
                "dailyTraffic": [
                    {"date": f"2026-08-{day:02d}", "entries": 2200 + day * 10, "exits": 1950 + day * 8}
                    for day in range(1, 9)
                ]
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["inputSource"], "LIVE")
        self.assertEqual(data["predictionDate"], "2026-08-09")
        self.assertGreaterEqual(data["predictedEntries"], 0)
        self.assertIn(data["demandLevel"], {"LOW", "MEDIUM", "HIGH"})
        self.assertEqual(len(data["hourlyProfile"]), 24)
        self.assertIn("currentDayEntries", data)

    def test_traffic_api_aggregates_simulation_history(self):
        app = self.create_test_app()
        client = app.test_client()
        client.post("/api/parking/simulation/update")
        response = client.get("/api/parking/traffic?period=week")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["source"], "SIMULATION")
        self.assertEqual(data["period"], "week")
        self.assertGreaterEqual(len(data["records"]), 1)
        self.assertIn("entries", data["records"][-1])

    def test_oku_violation_requires_explicit_oku_registration(self):
        self.assertFalse(_is_oku_violation({"is_oku": True}))
        self.assertTrue(_is_oku_violation({"is_oku": False}))
        self.assertFalse(_is_oku_violation({}))
        self.assertFalse(_is_oku_violation(None))


if __name__ == "__main__":
    unittest.main()
