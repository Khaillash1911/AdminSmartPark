import os

from flask import Flask, jsonify

from backend.config import HOST, PORT
from backend.analytics_model import ParkingAnalyticsPredictor
from backend.routes.parking_routes import parking_bp
from backend.security import configure_cors
from backend.simulator.occupancy_simulator import ParkingOccupancySimulator


def create_app(simulator=None) -> Flask:
    app = Flask(__name__)
    configure_cors(app)

    simulator = simulator or ParkingOccupancySimulator()
    app.config["PARKING_SIMULATOR"] = simulator
    app.config["PARKING_ANALYTICS_PREDICTOR"] = ParkingAnalyticsPredictor()
    app.register_blueprint(parking_bp)

    @app.get("/health")
    def health():
        return jsonify({"status": "ok", "source": "SIMULATION"})

    return app


app = None if os.getenv("PARKING_SKIP_DEFAULT_APP") == "1" else create_app()


if __name__ == "__main__":
    app = create_app()
    print(f"Parking occupancy simulator running on http://localhost:{PORT}")
    print("Simulation cycles are triggered by authenticated /api/parking/simulate requests")
    app.run(host=HOST, port=PORT, debug=False, use_reloader=False, threaded=True)
