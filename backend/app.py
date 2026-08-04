from flask import Flask, jsonify
from flask_cors import CORS

from config import HOST, PORT, UPDATE_INTERVAL_SECONDS
from routes.parking_routes import parking_bp
from simulator.occupancy_simulator import ParkingOccupancySimulator


def create_app(start_scheduler: bool = True) -> Flask:
    app = Flask(__name__)
    CORS(app)

    simulator = ParkingOccupancySimulator()
    app.config["PARKING_SIMULATOR"] = simulator
    app.config["PARKING_SIM_UPDATE_INTERVAL_SECONDS"] = UPDATE_INTERVAL_SECONDS
    app.register_blueprint(parking_bp)

    @app.get("/health")
    def health():
        return jsonify({"status": "ok", "source": "SIMULATION"})

    if start_scheduler:
        simulator.start_scheduler(UPDATE_INTERVAL_SECONDS)

    return app


app = create_app(start_scheduler=False)


if __name__ == "__main__":
    app = create_app(start_scheduler=True)
    print(f"Parking occupancy simulator running on http://localhost:{PORT}")
    print(f"Update interval: {UPDATE_INTERVAL_SECONDS} seconds")
    app.run(host=HOST, port=PORT, debug=False, use_reloader=False, threaded=True)
