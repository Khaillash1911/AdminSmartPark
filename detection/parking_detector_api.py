"""
SmartPark Detector API
======================
A lightweight Flask server that runs the car_detector pipeline
and streams logs back to the admin-web / admin-app via SSE.

Run:
    python parking_detector_api.py

Endpoints:
    GET  /health                  → { "status": "ok" }
    GET  /run-detection           → SSE stream of log lines + final JSON result
    GET  /run-detection?stream=0  → Single JSON response (no streaming)
"""

import json
import os
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path

from flask import Flask, Response, jsonify, request
from flask_cors import CORS

# ─────────────────────────────────────────────
# Paths — resolve relative to this file
# ─────────────────────────────────────────────
BASE_DIR        = Path(__file__).parent
ROOT_DIR        = BASE_DIR.parent

PLATE_DIR       = BASE_DIR  # API is now in the same folder as detector scripts
PARKING_JSON    = ROOT_DIR / "bounding_box" / "parking_points.json"
SAMPLE_IMAGES   = BASE_DIR / "sample_images"
ANNOTATED_DIR   = BASE_DIR / "annotated_images"

# Add detection folder to python path so we can import its modules
sys.path.insert(0, str(PLATE_DIR))

app = Flask(__name__)
CORS(app)   # allow requests from localhost:4300 and localhost:4301


# ─────────────────────────────────────────────
# Health check
# ─────────────────────────────────────────────
@app.route("/health")
def health():
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})


# ─────────────────────────────────────────────
# Detection endpoint  (SSE stream)
# ─────────────────────────────────────────────
@app.route("/run-detection")
def run_detection():
    use_stream = request.args.get("stream", "1") != "0"

    if use_stream:
        return Response(
            _detection_generator(),
            mimetype="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Access-Control-Allow-Origin": "*",
            },
        )
    else:
        # Collect all events into a single JSON response
        logs = []
        result = {}
        for raw in _detection_generator():
            line = raw.strip()
            if line.startswith("data: "):
                payload = line[6:]
                try:
                    evt = json.loads(payload)
                    if evt.get("type") == "log":
                        logs.append(evt["message"])
                    elif evt.get("type") == "result":
                        result = evt
                except Exception:
                    logs.append(payload)
        return jsonify({"logs": logs, "result": result})


def _detection_generator():
    """Generator that yields SSE-formatted lines."""

    def emit(event_type: str, **kwargs):
        payload = json.dumps({"type": event_type, **kwargs})
        return f"data: {payload}\n\n"

    def log(msg: str, level: str = "info"):
        print(f"[{level.upper()}] {msg}", flush=True)
        yield emit("log", message=msg, level=level, ts=datetime.now().isoformat())

    yield emit("log", message="=== SmartPark Detector API ===", level="info",
               ts=datetime.now().isoformat())
    yield emit("log", message=f"Started at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
               level="info", ts=datetime.now().isoformat())

    # ── Load parking data ──────────────────────────────────────────────────
    if not PARKING_JSON.exists():
        yield emit("log", message=f"[ERROR] parking_points.json not found at {PARKING_JSON}",
                   level="error", ts=datetime.now().isoformat())
        yield emit("error", message="parking_points.json not found")
        return

    with open(PARKING_JSON) as f:
        parking_data = json.load(f)

    yield emit("log", message=f"Loaded parking_points.json — {len(parking_data)} image(s) configured",
               level="info", ts=datetime.now().isoformat())

    # ── Find images ────────────────────────────────────────────────────────
    if not SAMPLE_IMAGES.exists():
        yield emit("log", message=f"[ERROR] sample_images/ not found at {SAMPLE_IMAGES}",
                   level="error", ts=datetime.now().isoformat())
        yield emit("error", message="sample_images/ directory not found")
        return

    images = sorted([p for p in SAMPLE_IMAGES.iterdir()
                     if p.suffix.lower() in (".jpg", ".png", ".jpeg")])

    if not images:
        yield emit("log", message="[WARN] No images found in sample_images/",
                   level="warn", ts=datetime.now().isoformat())
        yield emit("error", message="No images found")
        return

    yield emit("log", message=f"Found {len(images)} image(s) to process",
               level="info", ts=datetime.now().isoformat())

    # ── Load YOLO model ────────────────────────────────────────────────────
    try:
        yield emit("log", message="Loading YOLOv8 model (yolov8n.pt)…",
                   level="info", ts=datetime.now().isoformat())
        from ultralytics import YOLO
        from shapely.geometry import Polygon
        import numpy as np
        import cv2

        model_path = ROOT_DIR / "yolov8n.pt"
        model = YOLO(str(model_path))
        yield emit("log", message="✓ YOLOv8 model loaded successfully",
                   level="success", ts=datetime.now().isoformat())
    except Exception as e:
        yield emit("log", message=f"[ERROR] Failed to load model: {e}",
                   level="error", ts=datetime.now().isoformat())
        yield emit("error", message=str(e))
        return

    # ── Process each image ─────────────────────────────────────────────────
    CAR_CLASS_ID  = 2
    CAR_CONF      = 0.4
    IOU_THRESHOLD = 0.3

    all_results = []
    total_free     = 0
    total_occupied = 0
    total_spots    = 0

    ANNOTATED_DIR.mkdir(exist_ok=True)

    for img_path in images:
        img_name = img_path.stem
        yield emit("log", message=f"\n── Processing {img_path.name} ──",
                   level="info", ts=datetime.now().isoformat())

        frame = cv2.imread(str(img_path))
        if frame is None:
            yield emit("log", message=f"[WARN] Cannot read {img_path.name}, skipping",
                       level="warn", ts=datetime.now().isoformat())
            continue

        # Run YOLO
        results  = model(frame, conf=CAR_CONF, classes=[CAR_CLASS_ID], verbose=False)[0]
        car_boxes = [b for b in results.boxes if int(b.cls[0]) == CAR_CLASS_ID]

        yield emit("log", message=f"  Cars detected: {len(car_boxes)}",
                   level="info", ts=datetime.now().isoformat())

        # Car polygons
        car_polys = []
        for b in car_boxes:
            x1, y1, x2, y2 = map(int, b.xyxy[0])
            car_polys.append(Polygon([(x1,y1),(x2,y1),(x2,y2),(x1,y2)]))

        # Match parking spots
        parking_spots = parking_data.get(img_name, {})
        if not parking_spots:
            yield emit("log",
                       message=f"  No parking spots configured for '{img_name}' — skipping occupancy check",
                       level="warn", ts=datetime.now().isoformat())

        free = 0
        occupied = 0
        spot_statuses = {}

        for spot_id, coords in parking_spots.items():
            spot_poly   = Polygon(coords)
            is_occupied = False

            for car_poly in car_polys:
                inter = spot_poly.intersection(car_poly).area
                union = spot_poly.union(car_poly).area
                iou   = inter / union if union > 0 else 0
                if iou > IOU_THRESHOLD:
                    is_occupied = True
                    break

            spot_statuses[spot_id] = is_occupied
            if is_occupied:
                occupied += 1
            else:
                free += 1

        total_free     += free
        total_occupied += occupied
        total_spots    += len(parking_spots)

        for spot_id, occ in spot_statuses.items():
            status = "OCCUPIED 🔴" if occ else "FREE     🟢"
            yield emit("log",
                       message=f"  Spot {spot_id}: {status}",
                       level="occupied" if occ else "free",
                       ts=datetime.now().isoformat())

        yield emit("log",
                   message=f"  → Free: {free}  |  Occupied: {occupied}  |  Total: {len(parking_spots)}",
                   level="summary", ts=datetime.now().isoformat())

        img_result = {
            "image": img_path.name,
            "cars_detected": len(car_boxes),
            "spots": len(parking_spots),
            "free": free,
            "occupied": occupied,
            "spot_statuses": spot_statuses,
        }
        all_results.append(img_result)
        yield emit("image_result", **img_result, ts=datetime.now().isoformat())

    # ── Grand summary ──────────────────────────────────────────────────────
    yield emit("log", message="\n══════ SUMMARY ══════",
               level="info", ts=datetime.now().isoformat())
    yield emit("log", message=f"Images processed : {len(all_results)}",
               level="info", ts=datetime.now().isoformat())
    yield emit("log", message=f"Total spots      : {total_spots}",
               level="info", ts=datetime.now().isoformat())
    yield emit("log", message=f"Free             : {total_free}  🟢",
               level="success", ts=datetime.now().isoformat())
    yield emit("log", message=f"Occupied         : {total_occupied}  🔴",
               level="occupied", ts=datetime.now().isoformat())
    yield emit("log", message="═════════════════════",
               level="info", ts=datetime.now().isoformat())

    yield emit("result",
               images_processed=len(all_results),
               total_spots=total_spots,
               total_free=total_free,
               total_occupied=total_occupied,
               images=all_results,
               ts=datetime.now().isoformat())
    yield "data: [DONE]\n\n"


if __name__ == "__main__":
    print("SmartPark Detector API running on http://localhost:5050")
    print(f"  Parking JSON : {PARKING_JSON}")
    print(f"  Sample images: {SAMPLE_IMAGES}")
    app.run(host="0.0.0.0", port=5050, debug=False, threaded=True)
