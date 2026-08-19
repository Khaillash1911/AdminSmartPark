from datetime import datetime

from flask import Blueprint, current_app, jsonify, request

from backend.config import TIMEZONE
from zoneinfo import ZoneInfo


parking_bp = Blueprint("parking", __name__, url_prefix="/api/parking")


@parking_bp.get("/occupancy")
def get_occupancy():
    return jsonify(current_app.config["PARKING_SIMULATOR"].get_occupancy())


@parking_bp.get("/occupancy/<section>")
def get_section_occupancy(section: str):
    section_data = current_app.config["PARKING_SIMULATOR"].get_section(section)
    if not section_data:
        return jsonify({"error": "Section not found"}), 404
    return jsonify(section_data)


@parking_bp.get("/occupancy/<section>/<row>")
def get_row_occupancy(section: str, row: str):
    row_data = current_app.config["PARKING_SIMULATOR"].get_row(section, row)
    if not row_data:
        return jsonify({"error": "Row not found"}), 404
    return jsonify(row_data)


@parking_bp.post("/simulation/reset")
def reset_simulation():
    data = current_app.config["PARKING_SIMULATOR"].reset()
    return jsonify({"success": True, "message": "Parking simulation reset", "data": data})


@parking_bp.post("/simulation/update")
def force_update():
    data = current_app.config["PARKING_SIMULATOR"].update()
    return jsonify({"success": True, "message": "Parking simulation updated", "data": data})


@parking_bp.get("/history")
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
def get_traffic():
    period = request.args.get("period", "week")
    if period not in {"week", "month"}:
        return jsonify({"error": "period must be 'week' or 'month'"}), 400
    simulator = current_app.config["PARKING_SIMULATOR"]
    records = simulator.get_traffic_summary(period)
    return jsonify({"source": simulator.source, "period": period, "records": records})


@parking_bp.post("/analytics/predict")
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
