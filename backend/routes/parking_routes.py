from datetime import datetime

from flask import Blueprint, current_app, jsonify, request

from backend.config import TIMEZONE
from backend.security import admin_required
from zoneinfo import ZoneInfo


parking_bp = Blueprint("parking", __name__, url_prefix="/api/parking")


@parking_bp.get("/occupancy")
@admin_required
def get_occupancy():
    return jsonify(current_app.config["PARKING_SIMULATOR"].get_occupancy())


@parking_bp.get("/occupancy/<section>")
@admin_required
def get_section_occupancy(section: str):
    section_data = current_app.config["PARKING_SIMULATOR"].get_section(section)
    if not section_data:
        return jsonify({"error": "Section not found"}), 404
    return jsonify(section_data)


@parking_bp.get("/occupancy/<section>/<row>")
@admin_required
def get_row_occupancy(section: str, row: str):
    row_data = current_app.config["PARKING_SIMULATOR"].get_row(section, row)
    if not row_data:
        return jsonify({"error": "Row not found"}), 404
    return jsonify(row_data)


@parking_bp.post("/simulation/reset")
@admin_required
def reset_simulation():
    data = current_app.config["PARKING_SIMULATOR"].reset()
    return jsonify({"success": True, "message": "Parking simulation reset", "data": data})


@parking_bp.post("/simulation/update")
@admin_required
def force_update():
    updated, data = current_app.config["PARKING_SIMULATOR"].simulate_if_due()
    message = "Parking simulation updated" if updated else "Simulation was recently updated"
    return jsonify({"success": True, "message": message, "data": data})


@parking_bp.post("/simulate")
@admin_required
def simulate_once():
    simulator = current_app.config["PARKING_SIMULATOR"]
    updated, data = simulator.simulate_if_due()
    if not updated:
        return jsonify({
            "status": "skipped",
            "reason": "Simulation was recently updated",
            "data": data,
        })
    return jsonify({"status": "updated", "data": data})


@parking_bp.post("/session/initialize")
@admin_required
def initialize_session():
    simulator = current_app.config["PARKING_SIMULATOR"]
    return jsonify({
        "status": "initialized",
        "simulationEnabled": simulator.source == "SIMULATION",
        "data": simulator.get_occupancy(),
    })


@parking_bp.get("/history")
@admin_required
def get_history():
    limit_raw = request.args.get("limit", "100")
    try:
        limit = int(limit_raw)
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    records = current_app.config["PARKING_SIMULATOR"].get_history(
        section=request.args.get("section"),
        row=request.args.get("row"),
        limit=limit,
    )
    simulator = current_app.config["PARKING_SIMULATOR"]
    return jsonify({"source": simulator.source, "count": len(records), "records": records})


@parking_bp.get("/traffic")
@admin_required
def get_traffic():
    period = request.args.get("period", "week")
    if period not in {"week", "month"}:
        return jsonify({"error": "period must be 'week' or 'month'"}), 400
    simulator = current_app.config["PARKING_SIMULATOR"]
    records = simulator.get_traffic_summary(period)
    return jsonify({"source": simulator.source, "period": period, "records": records})


@parking_bp.post("/analytics/predict")
@admin_required
def predict_traffic():
    payload = request.get_json(silent=True) or {}
    daily_traffic = payload.get("dailyTraffic")
    if not daily_traffic:
        daily_traffic = current_app.config["PARKING_SIMULATOR"].get_daily_traffic()
    if not isinstance(daily_traffic, list):
        return jsonify({"error": "dailyTraffic must be an array"}), 400

    try:
        predictor = current_app.config["PARKING_ANALYTICS_PREDICTOR"]
        prediction = predictor.predict(daily_traffic, datetime.now(ZoneInfo(TIMEZONE)))
    except (OSError, ValueError) as error:
        return jsonify({"error": str(error)}), 422
    return jsonify(prediction)
