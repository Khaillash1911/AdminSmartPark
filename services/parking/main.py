"""Vercel entry point for the lightweight request-driven parking service."""

from __future__ import annotations

import threading
from typing import Any, Callable

from flask import Flask, jsonify

from backend.routes.parking_routes import parking_bp
from backend.security import configure_cors


class LazyService:
    """Initialize Firestore/model-backed objects only after authentication."""

    def __init__(self, factory: Callable[[], Any]):
        self._factory = factory
        self._instance = None
        self._lock = threading.Lock()

    def __getattr__(self, name: str):
        if self._instance is None:
            with self._lock:
                if self._instance is None:
                    self._instance = self._factory()
        return getattr(self._instance, name)


def _simulator():
    from backend.simulator.occupancy_simulator import ParkingOccupancySimulator

    return ParkingOccupancySimulator()


def _predictor():
    from backend.analytics_model import ParkingAnalyticsPredictor

    return ParkingAnalyticsPredictor()


app = Flask(__name__)
configure_cors(app)
app.config["PARKING_SIMULATOR"] = LazyService(_simulator)
app.config["PARKING_ANALYTICS_PREDICTOR"] = LazyService(_predictor)
app.register_blueprint(parking_bp)


@app.get("/health")
def health():
    return jsonify({"status": "ok", "source": "SIMULATION"})
