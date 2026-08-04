import tempfile
import unittest
from pathlib import Path

from app import create_app
from simulator.occupancy_simulator import ParkingOccupancySimulator


class ParkingSimulatorTests(unittest.TestCase):
    def create_simulator(self) -> ParkingOccupancySimulator:
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        return ParkingOccupancySimulator(database_path=Path(temp_dir.name) / "parking.db")

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
        app = create_app(start_scheduler=False)
        client = app.test_client()
        response = client.get("/api/parking/occupancy")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["source"], "SIMULATION")
        self.assertIn("sections", data)
        self.assertEqual(len(data["sections"]), 3)
        self.assertGreater(data["totalCapacity"], 0)

    def test_reset_and_forced_update_work(self):
        app = create_app(start_scheduler=False)
        client = app.test_client()
        reset_response = client.post("/api/parking/simulation/reset")
        update_response = client.post("/api/parking/simulation/update")
        self.assertEqual(reset_response.status_code, 200)
        self.assertEqual(update_response.status_code, 200)
        self.assertTrue(reset_response.get_json()["success"])
        self.assertTrue(update_response.get_json()["success"])


if __name__ == "__main__":
    unittest.main()
