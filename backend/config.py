import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DATABASE_DIR = BASE_DIR / "database"
DATABASE_PATH = Path(os.getenv("PARKING_SIM_DB", DATABASE_DIR / "parking.db"))

SIMULATION_SOURCE = os.getenv("PARKING_DATA_SOURCE", "SIMULATION")
UPDATE_INTERVAL_SECONDS = int(os.getenv("PARKING_SIM_UPDATE_INTERVAL_SECONDS", "60"))
TIMEZONE = os.getenv("PARKING_SIM_TIMEZONE", "Asia/Kuala_Lumpur")
HOST = os.getenv("PARKING_SIM_HOST", "0.0.0.0")
PORT = int(os.getenv("PARKING_SIM_PORT", "5060"))
