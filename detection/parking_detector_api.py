"""
SmartPark Detector API
======================
A lightweight Flask server that runs the car_detector pipeline
and streams logs back to the admin-web via SSE.

Run:
    python parking_detector_api.py

Endpoints:
    GET  /health                  → { "status": "ok" }
    GET  /run-detection           → SSE stream of log lines + final JSON result
    GET  /run-detection?stream=0  → Single JSON response (no streaming)
"""

import json
import os
import re
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any

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
PLATE_MODEL     = BASE_DIR / "best.pt"
FIREBASE_KEY    = ROOT_DIR / "find_my_car_system" / "backend" / "serviceAccountKey.json"

# Add detection folder to python path so we can import its modules
sys.path.insert(0, str(PLATE_DIR))

app = Flask(__name__)
CORS(app)   # allow requests from localhost:4300


DOUBLE_PARK_CAR_COVERAGE_THRESHOLD = 0.18
CAR_CLASS_ID = 2
CAR_CONF = 0.4
IOU_THRESHOLD = 0.3


# ─────────────────────────────────────────────
# Health check
# ─────────────────────────────────────────────
@app.route("/health")
def health():
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})


def _clean_plate_text(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", text.upper())


def _init_firestore():
    if not FIREBASE_KEY.exists():
        print(f"[WARN] Firebase service account not found: {FIREBASE_KEY}", flush=True)
        return None

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore

        if not firebase_admin._apps:
            cred = credentials.Certificate(str(FIREBASE_KEY))
            firebase_admin.initialize_app(cred)
        return firestore.client()
    except Exception as exc:
        print(f"[WARN] Firebase disabled for detector notifications: {exc}", flush=True)
        return None


def _lookup_vehicle(db, plate_text: str) -> dict[str, Any] | None:
    if not db or plate_text == "UNKNOWN":
        return None

    try:
        cleaned_plate = _clean_plate_text(plate_text)
        doc = db.collection("find_my_car").document(cleaned_plate).get()
        if doc.exists:
            return doc.to_dict()

        matches = (
            db.collection("find_my_car")
            .where("car_plate_search", "==", cleaned_plate)
            .limit(1)
            .stream()
        )
        for match in matches:
            return match.to_dict()
    except Exception as exc:
        print(f"[WARN] Could not look up vehicle {plate_text}: {exc}", flush=True)
    return None


def _write_double_park_notification(db, violation: dict[str, Any]) -> bool:
    if not db:
        return False

    try:
        from firebase_admin import firestore

        plate = violation.get("car_plate") or "UNKNOWN"
        vehicle = _lookup_vehicle(db, plate)
        doc_key = (
            f"double_park_{violation['image_stem']}_{violation['car_index']}_"
            f"{plate}_{violation['bbox']['x1']}_{violation['bbox']['y1']}"
        )
        doc_key = re.sub(r"[^A-Za-z0-9_-]", "_", doc_key)

        message_plate = vehicle.get("car_plate", plate) if vehicle else plate
        notification = {
            "car_plate": message_plate,
            "car_plate_search": _clean_plate_text(message_plate),
            "type": "double_park",
            "message": f"Double parking detected for {message_plate}",
            "spot_id": violation.get("nearest_spot_id") or "Outside marked bays",
            "timestamp": firestore.SERVER_TIMESTAMP,
            "is_read": False,
            "resolved": False,
            "source": "YOLO_CAMERA_SIMULATION",
            "image_source": violation["image"],
            "image_stem": violation["image_stem"],
            "car_index": violation["car_index"],
            "bbox": violation["bbox"],
            "overlap_ratio": violation["overlap_ratio"],
            "reason": violation["reason"],
        }

        if vehicle:
            notification.update({
                "uid": vehicle.get("uid"),
                "name": vehicle.get("name"),
                "email": vehicle.get("email"),
                "student_id": vehicle.get("student_id"),
            })

        db.collection("notifications").document(doc_key).set(notification, merge=True)
        return True
    except Exception as exc:
        print(f"[WARN] Failed to write double-park notification: {exc}", flush=True)
        return False


def _read_plate_for_car(frame, car_bbox: tuple[int, int, int, int], plate_model, reader) -> dict[str, Any]:
    if plate_model is None or reader is None:
        return {"plate_text": "UNKNOWN", "raw_ocr_text": "", "ocr_confidence": 0.0}

    try:
        from numberplate_detector import (
            deskew_plate,
            expand_box,
            is_valid_plate_text,
            read_plate,
        )

        cx1, cy1, cx2, cy2 = car_bbox
        car_roi = frame[cy1:cy2, cx1:cx2]
        if car_roi.size == 0:
            return {"plate_text": "UNKNOWN", "raw_ocr_text": "", "ocr_confidence": 0.0}

        plate_candidates = []
        roi_results = plate_model(car_roi, conf=0.25, verbose=False)[0]
        for box in roi_results.boxes:
            px1, py1, px2, py2 = map(int, box.xyxy[0])
            plate_candidates.append((cx1 + px1, cy1 + py1, cx1 + px2, cy1 + py2, float(box.conf[0])))

        if not plate_candidates:
            roi_h, roi_w = car_roi.shape[:2]
            plate_candidates.append((
                cx1 + int(roi_w * 0.18),
                cy1 + int(roi_h * 0.58),
                cx1 + int(roi_w * 0.82),
                cy1 + int(roi_h * 0.86),
                0.0,
            ))

        best = {"plate_text": "UNKNOWN", "raw_ocr_text": "", "ocr_confidence": 0.0, "plate_confidence": 0.0}
        for px1, py1, px2, py2, plate_conf in plate_candidates:
            px1, py1, px2, py2 = expand_box(px1, py1, px2, py2, frame.shape)
            crop = frame[py1:py2, px1:px2]
            if crop.size == 0:
                continue
            deskewed = deskew_plate(crop)
            plate_text, raw_text, ocr_conf = read_plate(reader, deskewed)
            if is_valid_plate_text(plate_text, ocr_conf) and ocr_conf >= best["ocr_confidence"]:
                best = {
                    "plate_text": plate_text,
                    "raw_ocr_text": raw_text,
                    "ocr_confidence": round(float(ocr_conf), 4),
                    "plate_confidence": round(float(plate_conf), 4),
                }

        return best
    except Exception as exc:
        print(f"[WARN] Plate OCR failed for double-park car: {exc}", flush=True)
        return {"plate_text": "UNKNOWN", "raw_ocr_text": "", "ocr_confidence": 0.0}


def _double_parking_for_car(car_poly, parking_polys: list[tuple[str, Any]]) -> tuple[bool, float, str | None, str]:
    if not parking_polys or car_poly.area <= 0:
        return False, 0.0, None, "no_marked_spots"

    best_overlap = 0.0
    nearest_spot_id = None
    car_center = car_poly.centroid
    center_inside_marked_spot = False

    for spot_id, spot_poly in parking_polys:
        overlap = car_poly.intersection(spot_poly).area / car_poly.area
        if overlap > best_overlap:
            best_overlap = overlap
            nearest_spot_id = spot_id
        if spot_poly.contains(car_center):
            center_inside_marked_spot = True

    is_double_parked = (not center_inside_marked_spot) and best_overlap < DOUBLE_PARK_CAR_COVERAGE_THRESHOLD
    reason = "outside_marked_parking_spots" if is_double_parked else "inside_or_overlapping_marked_spot"
    return is_double_parked, round(best_overlap, 4), nearest_spot_id, reason


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

    # ── Load YOLO and optional notification/OCR services ───────────────────
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

    plate_model = None
    reader = None
    if PLATE_MODEL.exists():
        try:
            yield emit("log", message="Loading plate OCR model for violation notifications…",
                       level="info", ts=datetime.now().isoformat())
            import easyocr

            plate_model = YOLO(str(PLATE_MODEL))
            reader = easyocr.Reader(["en"], gpu=False)
            yield emit("log", message="✓ Plate OCR ready",
                       level="success", ts=datetime.now().isoformat())
        except Exception as e:
            yield emit("log", message=f"[WARN] Plate OCR unavailable: {e}",
                       level="warn", ts=datetime.now().isoformat())
    else:
        yield emit("log", message=f"[WARN] Plate model not found at {PLATE_MODEL}",
                   level="warn", ts=datetime.now().isoformat())

    db = _init_firestore()
    yield emit("log",
               message="✓ Firestore notifications ready" if db else "[WARN] Firestore notifications disabled",
               level="success" if db else "warn",
               ts=datetime.now().isoformat())

    all_results = []
    total_free     = 0
    total_occupied = 0
    total_spots    = 0
    total_double_parking = 0
    total_notifications = 0

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
        annotated = frame.copy()

        # Run YOLO
        results  = model(frame, conf=CAR_CONF, classes=[CAR_CLASS_ID], verbose=False)[0]
        car_boxes = [b for b in results.boxes if int(b.cls[0]) == CAR_CLASS_ID]

        yield emit("log", message=f"  Cars detected: {len(car_boxes)}",
                   level="info", ts=datetime.now().isoformat())

        # Car polygons
        car_polys = []
        for b in car_boxes:
            x1, y1, x2, y2 = map(int, b.xyxy[0])
            car_polys.append((Polygon([(x1,y1),(x2,y1),(x2,y2),(x1,y2)]), b, (x1, y1, x2, y2)))

        # Match parking spots
        parking_spots = parking_data.get(img_name, {})
        parking_polys = [(spot_id, Polygon(coords)) for spot_id, coords in parking_spots.items()]
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

            for car_poly, _, _ in car_polys:
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

            pts = np.array(coords, np.int32)
            color = (0, 0, 255) if is_occupied else (0, 255, 0)
            cv2.polylines(annotated, [pts], True, color, 2)

        double_parking_violations = []
        for car_index, (car_poly, box, bbox) in enumerate(car_polys, start=1):
            x1, y1, x2, y2 = bbox
            is_double_parked, overlap_ratio, nearest_spot_id, reason = _double_parking_for_car(car_poly, parking_polys)

            box_color = (0, 0, 255) if is_double_parked else (255, 0, 0)
            cv2.rectangle(annotated, (x1, y1), (x2, y2), box_color, 2)
            label = "DOUBLE PARK" if is_double_parked else f"Car {car_index}"
            cv2.putText(annotated, label, (x1, max(y1 - 8, 18)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, box_color, 2)

            if not is_double_parked:
                continue

            plate_info = _read_plate_for_car(frame, bbox, plate_model, reader)
            violation = {
                "image": img_path.name,
                "image_stem": img_name,
                "car_index": car_index,
                "car_plate": plate_info.get("plate_text") or "UNKNOWN",
                "raw_ocr_text": plate_info.get("raw_ocr_text", ""),
                "ocr_confidence": plate_info.get("ocr_confidence", 0.0),
                "plate_confidence": plate_info.get("plate_confidence", 0.0),
                "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                "overlap_ratio": overlap_ratio,
                "nearest_spot_id": nearest_spot_id,
                "reason": reason,
            }
            notification_sent = _write_double_park_notification(db, violation)
            violation["notification_sent"] = notification_sent
            double_parking_violations.append(violation)
            total_double_parking += 1
            if notification_sent:
                total_notifications += 1

            yield emit("log",
                       message=f"  DOUBLE PARK: car {car_index} plate={violation['car_plate']} overlap={overlap_ratio:.2f} notification={'sent' if notification_sent else 'not sent'}",
                       level="error",
                       ts=datetime.now().isoformat())

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
                   message=f"  → Free: {free}  |  Occupied: {occupied}  |  Total: {len(parking_spots)}  |  Double parking: {len(double_parking_violations)}",
                   level="summary", ts=datetime.now().isoformat())

        annotated_path = ANNOTATED_DIR / f"{img_name}_detected.jpg"
        cv2.imwrite(str(annotated_path), annotated)

        img_result = {
            "image": img_path.name,
            "cars_detected": len(car_boxes),
            "spots": len(parking_spots),
            "free": free,
            "occupied": occupied,
            "spot_statuses": spot_statuses,
            "double_parking_count": len(double_parking_violations),
            "double_parking_violations": double_parking_violations,
            "annotated_path": str(annotated_path),
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
    yield emit("log", message=f"Double parking   : {total_double_parking}",
               level="error" if total_double_parking else "success", ts=datetime.now().isoformat())
    yield emit("log", message=f"Notifications    : {total_notifications}",
               level="success" if total_notifications == total_double_parking else "warn",
               ts=datetime.now().isoformat())
    yield emit("log", message="═════════════════════",
               level="info", ts=datetime.now().isoformat())

    yield emit("result",
               images_processed=len(all_results),
               total_spots=total_spots,
               total_free=total_free,
               total_occupied=total_occupied,
               total_double_parking=total_double_parking,
               total_notifications=total_notifications,
               images=all_results,
               ts=datetime.now().isoformat())
    yield "data: [DONE]\n\n"


if __name__ == "__main__":
    print("SmartPark Detector API running on http://localhost:5050")
    print(f"  Parking JSON : {PARKING_JSON}")
    print(f"  Sample images: {SAMPLE_IMAGES}")
    app.run(host="0.0.0.0", port=5050, debug=False, threaded=True)
