"""Cloudinary-backed parking-map upload and YOLO segmentation API."""

import os
import re
import sys
import traceback
import hashlib
from urllib.parse import urlparse, unquote
from datetime import datetime
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request
from werkzeug.utils import secure_filename

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.plate_recognition import clean_plate_text, recognize_best_plate
from backend.firestore_client import get_firestore_client
from backend.security import authenticate_admin_request, configure_cors

BASE_DIR        = Path(__file__).parent
ROOT_DIR        = BASE_DIR.parent

CAR_SEGMENTATION_MODEL = BASE_DIR / "yolov8m-seg.pt"
FIREBASE_KEY    = ROOT_DIR / "find_my_car_system" / "backend" / "serviceAccountKey.json"

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024
configure_cors(app)


@app.before_request
def require_admin():
    if request.path == "/health":
        return None
    return authenticate_admin_request()


DOUBLE_PARK_CAR_COVERAGE_THRESHOLD = 0.25
CAR_CLASS_ID = 2
CAR_CONF = 0.4
MIN_PARKING_INTERACTION_THRESHOLD = 0.03

_car_model = None


def _get_car_model():
    global _car_model
    if _car_model is None:
        from ultralytics import YOLO
        if not CAR_SEGMENTATION_MODEL.exists():
            raise FileNotFoundError(
                f"YOLO segmentation model is missing: {CAR_SEGMENTATION_MODEL}. "
                "Install yolov8m-seg.pt before starting the detector API."
            )
        _car_model = YOLO(str(CAR_SEGMENTATION_MODEL))
    return _car_model


def _configure_cloudinary():
    from dotenv import load_dotenv
    import cloudinary

    load_dotenv(ROOT_DIR / "find_my_car_system" / "backend" / ".env", override=True)
    parsed = urlparse(os.getenv("CLOUDINARY_URL", "").strip())
    if not all((parsed.hostname, parsed.username, parsed.password)):
        return None
    cloudinary.reset_config()
    cloudinary.config(
        cloud_name=parsed.hostname,
        api_key=unquote(parsed.username),
        api_secret=unquote(parsed.password),
        secure=True,
    )
    return cloudinary


# ─────────────────────────────────────────────
# Health check
# ─────────────────────────────────────────────
@app.route("/health")
def health():
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})


def _clean_plate_text(text: str) -> str:
    return clean_plate_text(text)


def _init_firestore():
    try:
        return get_firestore_client()
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


def _lookup_registered_user(db, plate_text: str) -> dict[str, Any] | None:
    """Find the authoritative user record for an OCR plate."""
    if not db:
        return None
    cleaned_plate = _clean_plate_text(plate_text)
    try:
        matches = []
        for snapshot in db.collection("users").stream():
            user = snapshot.to_dict() or {}
            if _clean_plate_text(str(user.get("car_plate", ""))) == cleaned_plate:
                matches.append({"uid": user.get("uid") or snapshot.id, **user})
        # Duplicate/legacy user records can contain the same plate with and
        # without spaces. Never create an offence if any authoritative match
        # explicitly authorises the vehicle for OKU parking.
        return next((user for user in matches if user.get("is_oku") is True), matches[0] if matches else None)
    except Exception as exc:
        raise RuntimeError(f"Could not verify OKU registration for {cleaned_plate}") from exc
    return None


def _is_oku_violation(user: dict[str, Any] | None) -> bool:
    """Trigger only for a matched user whose is_oku value is explicitly false."""
    return bool(user is not None and user.get("is_oku") is False)


def _write_oku_violation(db, plate: str, user: dict[str, Any] | None, image_digest: str) -> bool:
    if not db:
        return False
    try:
        from firebase_admin import firestore

        doc_key = re.sub(r"[^A-Za-z0-9_-]", "_", f"oku_violation_{plate}_{image_digest[:16]}")
        message = f"Unauthorised OKU parking detected for {plate}"
        notification = {
            "car_plate": plate,
            "car_plate_search": _clean_plate_text(plate),
            "type": "oku_violation",
            "message": message,
            "spot_id": "OKU Bay",
            "timestamp": firestore.SERVER_TIMESTAMP,
            "is_read": False,
            "resolved": False,
            "source": "OKU_PLATE_OCR_UPLOAD",
            "reason": "registered_user_is_not_oku",
            "image_sha256": image_digest,
        }
        if user:
            notification.update({
                "uid": user.get("uid"),
                "name": user.get("name"),
                "email": user.get("email"),
                "student_id": user.get("student_id"),
            })
        violation = {**notification, "notification_id": doc_key, "status": "active"}
        db.collection("notifications").document(doc_key).set(notification)
        db.collection("violations").document(doc_key).set(violation)
        return True
    except Exception as exc:
        print(f"[WARN] Failed to write OKU violation: {exc}", flush=True)
        return False


@app.post("/detect-oku-violation")
def detect_oku_violation():
    """OCR an uploaded or selected Cloudinary OKU-bay image without retaining it."""
    data = b""
    image_source = "direct_upload"
    if "file" in request.files and request.files["file"].filename:
        data = request.files["file"].read()
    else:
        payload = request.get_json(silent=True) or {}
        image_url = str(payload.get("image_url", "")).strip()
        parsed_url = urlparse(image_url)
        if parsed_url.scheme != "https" or parsed_url.hostname != "res.cloudinary.com":
            return jsonify({"success": False, "message": "A selected Cloudinary image is required"}), 400
        import requests
        response = requests.get(image_url, timeout=20)
        response.raise_for_status()
        data = response.content
        image_source = image_url
    if not data:
        return jsonify({"success": False, "message": "The selected image is empty"}), 400
    if len(data) > 20 * 1024 * 1024:
        return jsonify({"success": False, "message": "Image must be smaller than 20 MB"}), 413

    try:
        import cv2
        import numpy as np

        image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            return jsonify({"success": False, "message": "Invalid image file"}), 400
        detection = recognize_best_plate(image)
        if not detection:
            return jsonify({
                "success": True,
                "plate_detected": False,
                "violation": False,
                "notification_sent": False,
                "message": "No readable number plate was detected; no violation was created.",
            })

        plate = detection["plate_number"]
        database = _init_firestore()
        if database is None:
            return jsonify({"success": False, "message": "Firebase is unavailable"}), 503
        user = _lookup_registered_user(database, plate)
        violation = _is_oku_violation(user)
        notification_sent = False
        if violation:
            notification_sent = _write_oku_violation(database, plate, user, hashlib.sha256(data).hexdigest())

        return jsonify({
            "success": True,
            "plate_detected": True,
            "plate_number": plate,
            "detection": detection,
            "registered_user_found": user is not None,
            "is_oku": bool(user and user.get("is_oku") is True),
            "violation": violation,
            "notification_sent": notification_sent,
            "image_source": image_source,
            "message": (
                f"{plate} is registered for OKU parking. No violation created."
                if user and user.get("is_oku") is True else
                f"OKU parking violation created for {plate}."
                if violation and notification_sent else
                f"OKU violation detected for {plate}, but Firebase could not save the record."
                if violation else
                f"{plate} has no matching explicit is_oku=false user. No violation created."
            ),
        })
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"success": False, "message": str(exc)}), 500


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
        violation_record = {
            **notification,
            "notification_id": doc_key,
            "status": "active",
        }

        if vehicle:
            owner_fields = {
                "uid": vehicle.get("uid"),
                "name": vehicle.get("name"),
                "email": vehicle.get("email"),
                "student_id": vehicle.get("student_id"),
            }
            notification.update(owner_fields)
            violation_record.update(owner_fields)

        notification_ref = db.collection("notifications").document(doc_key)
        violation_ref = db.collection("violations").document(doc_key)
        existing_snapshot = notification_ref.get()
        if existing_snapshot.exists:
            existing = existing_snapshot.to_dict() or {}
            if existing.get("resolved") or existing.get("is_read"):
                # The same offence has happened again after being handled.
                # Reopen the existing document so the live badge/feed triggers
                # again without creating a duplicate notification record.
                notification_ref.set(notification)
                violation_ref.set(violation_record)
            elif not violation_ref.get().exists:
                violation_ref.set(violation_record)
            # An already-active offence remains one active notification.
            return True

        notification_ref.set(notification)
        violation_ref.set(violation_record)
        return True
    except Exception as exc:
        print(f"[WARN] Failed to write double-park notification: {exc}", flush=True)
        return False


def _normalise_spots(raw_spots):
    spots = {}
    for spot_id, value in (raw_spots or {}).items():
        points = value.get("points", []) if isinstance(value, dict) else value
        coords = []
        for point in points:
            if isinstance(point, dict):
                coords.append([float(point["x"]), float(point["y"])])
            else:
                coords.append([float(point[0]), float(point[1])])
        if len(coords) >= 3:
            spots[str(spot_id)] = coords
    return spots


@app.post("/parking-map-image")
def upload_parking_map_image():
    if "file" not in request.files or not request.files["file"].filename:
        return jsonify({"success": False, "message": "No image selected"}), 400

    upload = request.files["file"]
    if upload.mimetype not in {"image/jpeg", "image/png", "image/webp"}:
        return jsonify({"success": False, "message": "Only JPEG, PNG, or WebP images are allowed"}), 415
    data = upload.read()
    if len(data) > 20 * 1024 * 1024:
        return jsonify({"success": False, "message": "Image must be smaller than 20 MB"}), 413

    cloudinary = _configure_cloudinary()
    if cloudinary is None:
        return jsonify({"success": False, "message": "Cloudinary is not configured"}), 503

    import cloudinary.uploader
    digest = hashlib.sha256(data).hexdigest()
    original_name = Path(secure_filename(upload.filename)).stem or "parking-map"
    result = cloudinary.uploader.upload(
        data,
        public_id=f"smartpark/parking_sources/by_hash/{digest}",
        resource_type="image",
        overwrite=False,
    )
    return jsonify({
        "success": True,
        "name": original_name,
        "image_url": result["secure_url"],
        "cloudinary_public_id": result["public_id"],
        "image_sha256": digest,
    })


@app.post("/detect-map")
def detect_map():
    payload = request.get_json(silent=True) or {}
    image_url = str(payload.get("image_url", "")).strip()
    map_name = secure_filename(str(payload.get("name", "parking-map"))) or "parking-map"
    parking_spots = _normalise_spots(payload.get("spots"))
    parsed_url = urlparse(image_url)
    if parsed_url.scheme != "https" or parsed_url.hostname != "res.cloudinary.com":
        return jsonify({"success": False, "message": "A Cloudinary HTTPS image URL is required"}), 400
    if not parking_spots:
        return jsonify({"success": False, "message": "No marked parking spots were supplied"}), 400

    try:
        import requests
        import cv2
        import numpy as np
        from shapely.geometry import Polygon
        from shapely.geometry.base import BaseGeometry

        response = requests.get(image_url, timeout=20)
        response.raise_for_status()
        if len(response.content) > 20 * 1024 * 1024:
            return jsonify({"success": False, "message": "Cloudinary image is too large"}), 413
        frame = cv2.imdecode(np.frombuffer(response.content, np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            return jsonify({"success": False, "message": "Cloudinary image could not be decoded"}), 400

        model = _get_car_model()
        results = model(frame, conf=CAR_CONF, classes=[CAR_CLASS_ID], imgsz=1280, verbose=False)[0]
        car_boxes = [box for box in results.boxes if int(box.cls[0]) == CAR_CLASS_ID]
        mask_contours = results.masks.xy if results.masks is not None else []
        car_polys = []
        for index, box in enumerate(car_boxes):
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            outline = mask_contours[index] if index < len(mask_contours) else []
            car_poly: BaseGeometry
            if len(outline) >= 3:
                car_poly = Polygon(outline).buffer(0)
                if car_poly.geom_type == "MultiPolygon":
                    car_poly = max(car_poly.geoms, key=lambda geometry: geometry.area)
            else:
                # Defensive fallback only; the configured model normally always returns masks.
                car_poly = Polygon([(x1, y1), (x2, y1), (x2, y2), (x1, y2)])
            if car_poly.is_empty or car_poly.area <= 0:
                continue
            car_outline = [[round(float(x), 1), round(float(y), 1)] for x, y in car_poly.exterior.coords]
            car_polys.append((car_poly, (x1, y1, x2, y2), car_outline))

        parking_polys = [(spot_id, Polygon(coords)) for spot_id, coords in parking_spots.items()]

        def overlap_by_spot(car_poly):
            intersection_areas = []
            for spot_id, spot_poly in parking_polys:
                intersection_area = car_poly.intersection(spot_poly).area
                intersection_areas.append((spot_id, intersection_area))
            # Parking polygons describe only the ground footprint, whereas a
            # segmentation mask traces the full visible car body. Measure each
            # bay as a share of the mask area that is actually within any bay.
            total_marked_footprint = sum(area for _, area in intersection_areas)
            overlaps = [
                (spot_id, area / max(total_marked_footprint, 1))
                for spot_id, area in intersection_areas
            ]
            footprint_ratio = total_marked_footprint / max(car_poly.area, 1)
            return sorted(overlaps, key=lambda item: item[1], reverse=True), footprint_ratio

        # Process every car that has a meaningful part of its traced mask in
        # the marked parking area. Cars in the unmarked background are ignored.
        relevant_cars = []
        for car_poly, bbox, outline in car_polys:
            overlaps, footprint_ratio = overlap_by_spot(car_poly)
            if footprint_ratio < MIN_PARKING_INTERACTION_THRESHOLD:
                continue
            relevant_cars.append((car_poly, bbox, outline, overlaps))

        spot_statuses = {spot_id: False for spot_id, _ in parking_polys}
        occupied_spot_ids = set()
        spot_overlap_percentages = {spot_id: 0.0 for spot_id, _ in parking_polys}
        car_results = []
        for car_index, (_car_poly, bbox, outline, overlaps) in enumerate(relevant_cars, start=1):
            qualifying_spots = [
                spot_id for spot_id, ratio in overlaps
                if ratio > DOUBLE_PARK_CAR_COVERAGE_THRESHOLD
            ]
            if len(qualifying_spots) >= 2:
                car_spot_ids = qualifying_spots
                car_classification = "DOUBLE_PARK"
            elif overlaps and overlaps[0][1] > 0:
                # At or below 25% in an additional bay is normal parking. Only
                # the bay containing the largest share of the car is occupied.
                car_spot_ids = [overlaps[0][0]]
                car_classification = "NORMAL_PARKING"
            else:
                car_spot_ids = []
                car_classification = "NO_RELEVANT_VEHICLE"

            occupied_spot_ids.update(car_spot_ids)
            for spot_id, ratio in overlaps:
                spot_overlap_percentages[spot_id] = max(
                    spot_overlap_percentages[spot_id], round(ratio * 100, 2)
                )
            car_results.append({
                "car_index": car_index,
                "bbox": {"x1": bbox[0], "y1": bbox[1], "x2": bbox[2], "y2": bbox[3]},
                "outline": outline,
                "classification": car_classification,
                "intersected_spot_ids": car_spot_ids,
                "spot_overlap_percentages": {
                    spot_id: round(ratio * 100, 2) for spot_id, ratio in overlaps
                },
            })

        for spot_id in occupied_spot_ids:
            if spot_id in spot_statuses:
                spot_statuses[spot_id] = True

        parking_classification = (
            "DOUBLE_PARK" if any(car["classification"] == "DOUBLE_PARK" for car in car_results) else
            "NORMAL_PARKING" if car_results else
            "NO_RELEVANT_VEHICLE"
        )

        db = _init_firestore()
        violations = []
        for car, (car_poly, bbox, _outline, overlaps) in zip(car_results, relevant_cars):
            if car["classification"] != "DOUBLE_PARK":
                continue
            nearest, overlap = max(overlaps, key=lambda item: item[1])
            reason = "across_multiple_marked_spots"
            violation = {
                "image": image_url,
                "image_stem": map_name,
                "car_index": car["car_index"],
                "car_plate": "UNKNOWN",
                "bbox": {"x1": bbox[0], "y1": bbox[1], "x2": bbox[2], "y2": bbox[3]},
                "overlap_ratio": overlap,
                "nearest_spot_id": nearest,
                "intersected_spot_ids": car["intersected_spot_ids"],
                "reason": reason,
            }
            violation["notification_sent"] = _write_double_park_notification(db, violation)
            violations.append(violation)

        occupied = sum(1 for value in spot_statuses.values() if value)
        image_result = {
            "image": map_name,
            "image_url": image_url,
            "cars_detected": len(relevant_cars),
            "spots": len(parking_spots),
            "free": len(parking_spots) - occupied,
            "occupied": occupied,
            "spot_statuses": spot_statuses,
            "double_parking_count": len(violations),
            "double_parking_violations": violations,
            "parking_classification": parking_classification,
            "intersected_spot_ids": sorted(occupied_spot_ids, key=lambda spot_id: int(spot_id)),
            "spot_overlap_percentages": spot_overlap_percentages,
            "double_park_threshold_percent": DOUBLE_PARK_CAR_COVERAGE_THRESHOLD * 100,
            "car_outlines": [car["outline"] for car in car_results],
            "cars": car_results,
        }
        return jsonify({
            "success": True,
            "images_processed": 1,
            "total_spots": len(parking_spots),
            "total_free": image_result["free"],
            "total_occupied": occupied,
            "total_double_parking": len(violations),
            "total_notifications": sum(1 for item in violations if item["notification_sent"]),
            "images": [image_result],
        })
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"success": False, "message": str(exc)}), 500


if __name__ == "__main__":
    print("SmartPark Detector API running on http://localhost:5050")
    app.run(host="127.0.0.1", port=5050, debug=False, threaded=True)
