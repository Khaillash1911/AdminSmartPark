from flask import Blueprint, current_app, jsonify, request


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
