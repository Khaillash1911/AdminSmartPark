from flask import Flask, jsonify, request
import sys
import tempfile
from ultralytics import YOLO
# pyrefly: ignore [missing-import]
import cv2
import os
import re
import random
import hashlib
# pyrefly: ignore [missing-import]
import easyocr
from werkzeug.utils import secure_filename
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from urllib.parse import urlparse, unquote
from google.cloud.firestore_v1.base_query import FieldFilter
from dotenv import load_dotenv
# pyrefly: ignore [missing-import]
import cloudinary
# pyrefly: ignore [missing-import]
import cloudinary.uploader

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = Path(BASE_DIR).parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.firestore_client import get_firestore_client
from backend.security import authenticate_admin_request, configure_cors

db = get_firestore_client()
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024
configure_cors(app)


@app.before_request
def require_admin():
    if request.path == "/":
        return None
    return authenticate_admin_request()

load_dotenv(os.path.join(BASE_DIR, ".env"), override=True)


def configure_cloudinary():
    cloudinary_url = os.getenv("CLOUDINARY_URL", "").strip()
    parsed = urlparse(cloudinary_url)
    if parsed.scheme != "cloudinary" or not all((parsed.hostname, parsed.username, parsed.password)):
        return False
    cloudinary.reset_config()
    cloudinary.config(
        cloud_name=parsed.hostname,
        api_key=unquote(parsed.username),
        api_secret=unquote(parsed.password),
        secure=True
    )
    return True


CLOUDINARY_CONFIGURED = configure_cloudinary()

RUNTIME_DIR = os.path.join(tempfile.gettempdir(), "smartpark-anpr") if os.getenv("VERCEL") else BASE_DIR
UPLOAD_FOLDER = os.path.join(RUNTIME_DIR, "uploads")
OUTPUT_FOLDER = os.path.join(RUNTIME_DIR, "static/results")
PLATE_FOLDER = os.path.join(RUNTIME_DIR, "static/plate_crops")
CAR_IMAGE_FOLDER = os.path.join(RUNTIME_DIR, "static/car_images")
MODEL_PATH = os.path.join(BASE_DIR, "models/best.pt")

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["OUTPUT_FOLDER"] = OUTPUT_FOLDER

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
os.makedirs(PLATE_FOLDER, exist_ok=True)
os.makedirs(CAR_IMAGE_FOLDER, exist_ok=True)

# Detection results are deliberately temporary. A Firestore document is only
# created after the administrator confirms the OCR preview.
pending_detections = {}

model = None
reader = None


def get_model():
    global model
    if model is None:
        model = YOLO(MODEL_PATH)
    return model


def get_reader():
    global reader
    if reader is None:
        reader = easyocr.Reader(["en"], gpu=False)
    return reader


def clean_plate_text(text):
    """
    Clean OCR output.
    Keeps only letters and numbers.
    Example: "VAB 1234!" becomes "VAB1234"
    """
    text = text.upper()
    text = re.sub(r"[^A-Z0-9]", "", text)
    return text


def plate_text_score(text, confidence):
    """Prefer confident, complete Malaysian-style plate candidates."""
    if not text:
        return -1.0
    score = float(confidence) + min(len(text), 9) * 0.035
    if 4 <= len(text) <= 9:
        score += 0.25
    if re.fullmatch(r"[A-Z]{1,4}[0-9]{1,4}[A-Z]?", text):
        score += 0.5
    elif re.search(r"[A-Z]", text) and re.search(r"[0-9]", text):
        score += 0.15
    return score


def preprocess_plate(gray):
    """Generate OCR variants for glare, shadows and dark Malaysian plates."""
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    denoised = cv2.bilateralFilter(enhanced, 7, 45, 45)
    _, otsu = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    adaptive = cv2.adaptiveThreshold(
        denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 31, 9
    )
    return (gray, enhanced, denoised, otsu, cv2.bitwise_not(otsu), adaptive)


def read_plate_multi_pass(plate_crop):
    """Read individual and split OCR boxes, keeping the strongest candidate."""
    height, width = plate_crop.shape[:2]
    scale = max(2, min(5, 240 // max(height, 1)))
    enlarged = cv2.resize(
        plate_crop, (width * scale, height * scale), interpolation=cv2.INTER_CUBIC
    )
    gray = cv2.cvtColor(enlarged, cv2.COLOR_BGR2GRAY)
    best = {"text": "", "raw": "", "confidence": 0.0, "score": -1.0}

    for variant in preprocess_plate(gray):
        for decoder in ("beamsearch", "greedy"):
            try:
                ocr_results = get_reader().readtext(
                    variant,
                    detail=1,
                    paragraph=False,
                    decoder=decoder,
                    allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
                    width_ths=1.5,
                    mag_ratio=1.5,
                    add_margin=0.12
                )
            except Exception:
                continue

            for _, raw, confidence in ocr_results:
                cleaned = clean_plate_text(raw)
                score = plate_text_score(cleaned, confidence)
                if score > best["score"]:
                    best = {"text": cleaned, "raw": raw, "confidence": float(confidence), "score": score}

            # A visible gap often makes EasyOCR return letters and numbers as
            # separate boxes. Sort left-to-right and explicitly join them.
            ordered = sorted(ocr_results, key=lambda item: min(point[0] for point in item[0]))
            if len(ordered) > 1:
                combined_raw = " ".join(item[1] for item in ordered)
                combined_text = clean_plate_text(combined_raw)
                combined_confidence = sum(float(item[2]) for item in ordered) / len(ordered)
                score = plate_text_score(combined_text, combined_confidence)
                if score > best["score"]:
                    best = {
                        "text": combined_text,
                        "raw": combined_raw,
                        "confidence": combined_confidence,
                        "score": score
                    }

    return best["text"], best["raw"], best["confidence"]


def find_registered_user(plate_number):
    """Match plates consistently even when the users collection stores spaces."""
    cleaned_plate = clean_plate_text(plate_number)
    if not cleaned_plate:
        return None

    for user_doc in db.collection("users").stream():
        user = user_doc.to_dict()
        if clean_plate_text(str(user.get("car_plate", ""))) == cleaned_plate:
            return {
                "uid": user.get("uid") or user_doc.id,
                "name": user.get("name", ""),
                "email": user.get("email", ""),
                "student_id": user.get("student_id", ""),
                "car_plate": user.get("car_plate", cleaned_plate),
                "car_model": user.get("car_model", ""),
                "car_colour": user.get("car_colour", ""),
                "is_oku": bool(user.get("is_oku", False))
            }
    return None


def generate_parking_location():
    """Create one internally consistent simulated parking assignment."""
    zone = random.choice(("A", "B", "C"))
    level = random.randint(1, 5)
    row_number = random.randint(1, 20)
    spot_number = random.randint(1, 50)
    return {
        "parking_level": f"Level {level}",
        "parking_zone": f"Zone {zone}",
        "parking_row": f"Row {row_number}",
        "parking_slot": f"{zone}{row_number:02d}-{spot_number:02d}"
    }


def image_sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as image_file:
        for chunk in iter(lambda: image_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def find_duplicate_image(image_hash):
    matches = (
        db.collection("find_my_car")
        .where(filter=FieldFilter("image_sha256", "==", image_hash))
        .limit(1)
        .stream()
    )
    for document in matches:
        data = document.to_dict()
        return {
            "document_id": document.id,
            "car_plate": data.get("car_plate") or document.id,
            "image_url": data.get("image_url")
        }
    return None


def upload_confirmed_images(pending, plate_number, token, image_hash):
    """Upload the car and plate crop and return permanent public HTTPS URLs."""
    config = cloudinary.config()
    if not CLOUDINARY_CONFIGURED or not all((config.cloud_name, config.api_key, config.api_secret)):
        raise RuntimeError(
            "Cloudinary is not configured. Add CLOUDINARY_URL to "
            "find_my_car_system/backend/.env"
        )

    # Content-addressed IDs ensure two concurrent requests for the exact same
    # image cannot create separate Cloudinary assets.
    car_public_id = f"smartpark/cars/by_hash/{image_hash}"
    plate_public_id = f"smartpark/plate_crops/{plate_number}_{token[:8]}"
    uploaded_ids = []
    try:
        car_upload = cloudinary.uploader.upload(
            pending.get("image_url") or pending["image_path"],
            public_id=car_public_id,
            resource_type="image",
            overwrite=False
        )
        uploaded_ids.append(car_public_id)

        plate_url = None
        plate_source = pending.get("plate_image_url") or pending.get("plate_crop_path")
        if plate_source:
            plate_upload = cloudinary.uploader.upload(
                plate_source,
                public_id=plate_public_id,
                resource_type="image",
                overwrite=False
            )
            uploaded_ids.append(plate_public_id)
            plate_url = plate_upload["secure_url"]

        return car_upload["secure_url"], plate_url, uploaded_ids
    except Exception:
        for public_id in uploaded_ids:
            cloudinary.uploader.destroy(public_id, resource_type="image", invalidate=True)
        raise


def persist_pending_detection(token, pending, output_path, image_hash):
    if not CLOUDINARY_CONFIGURED:
        raise RuntimeError("Cloudinary is not configured")
    prefix = f"smartpark/pending/{token}"
    uploads = [
        cloudinary.uploader.upload(pending["image_path"], public_id=f"{prefix}/original", overwrite=True),
        cloudinary.uploader.upload(output_path, public_id=f"{prefix}/result", overwrite=True),
    ]
    plate_upload = None
    if pending.get("plate_crop_path"):
        plate_upload = cloudinary.uploader.upload(
            pending["plate_crop_path"], public_id=f"{prefix}/plate", overwrite=True
        )
        uploads.append(plate_upload)

    stored = {
        **pending,
        "image_url": uploads[0]["secure_url"],
        "result_image_url": uploads[1]["secure_url"],
        "plate_image_url": plate_upload["secure_url"] if plate_upload else None,
        "image_hash": image_hash,
        "temporary_cloudinary_ids": [item["public_id"] for item in uploads],
    }
    # Local paths are useful within one local process but must not be relied on
    # by a later serverless invocation.
    firestore_record = {key: value for key, value in stored.items() if not key.endswith("_path")}
    db.collection("pending_car_detections").document(token).set(firestore_record)
    return stored


def load_pending_detection(token):
    pending = pending_detections.get(token)
    if pending is not None:
        return pending
    snapshot = db.collection("pending_car_detections").document(token).get()
    return snapshot.to_dict() if snapshot.exists else None


def cleanup_pending_detection(token, pending):
    for public_id in pending.get("temporary_cloudinary_ids", []):
        cloudinary.uploader.destroy(public_id, resource_type="image", invalidate=True)
    db.collection("pending_car_detections").document(token).delete()
    pending_detections.pop(token, None)
    for key in ("image_path", "plate_crop_path", "result_path"):
        path = pending.get(key)
        if path and os.path.exists(path):
            os.remove(path)


@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "message": "Find My Car Flask API is running with YOLOv8 and OCR"
    })


@app.route("/detect-plate", methods=["POST"])
def detect_plate():
    if "file" not in request.files:
        return jsonify({
            "success": False,
            "message": "No file uploaded"
        }), 400

    file = request.files["file"]

    if file.filename == "":
        return jsonify({
            "success": False,
            "message": "No selected file"
        }), 400

    if file.mimetype not in {"image/jpeg", "image/png", "image/webp"}:
        return jsonify({
            "success": False,
            "message": "Only JPEG, PNG, or WebP images are allowed"
        }), 415

    original_filename = secure_filename(file.filename)
    suffix = Path(original_filename).suffix.lower() or ".jpg"
    token = uuid4().hex
    filename = f"{token}{suffix}"
    image_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(image_path)

    image = cv2.imread(image_path)

    if image is None:
        return jsonify({
            "success": False,
            "message": "Invalid image file"
        }), 400

    # A lower detector threshold plus a padded crop prevents plate edges from
    # being lost before OCR, while OCR scoring filters weak text candidates.
    results = get_model()(image, conf=0.2, imgsz=1280, verbose=False)

    detections = []
    best_crop_filename = None

    for result in results:
        for box in result.boxes:
            confidence = float(box.conf[0])

            if confidence < 0.2:
                continue

            x1, y1, x2, y2 = map(int, box.xyxy[0])

            box_width = max(1, x2 - x1)
            box_height = max(1, y2 - y1)
            pad_x = int(box_width * 0.12)
            pad_y = int(box_height * 0.18)
            image_height, image_width = image.shape[:2]
            x1 = max(0, x1 - pad_x)
            y1 = max(0, y1 - pad_y)
            x2 = min(image_width, x2 + pad_x)
            y2 = min(image_height, y2 + pad_y)

            # Crop detected number plate
            plate_crop = image[y1:y2, x1:x2]

            plate_text, raw_text, ocr_confidence = read_plate_multi_pass(plate_crop)

            crop_filename = f"{token}_plate_{len(detections) + 1}.jpg"
            cv2.imwrite(os.path.join(PLATE_FOLDER, crop_filename), plate_crop)

            detection_data = {
                "plate_number": plate_text,
                "raw_ocr_text": raw_text,
                "detection_confidence": round(confidence, 4),
                "ocr_confidence": round(ocr_confidence, 4),
                "plate_image_url": f"http://127.0.0.1:5002/static/plate_crops/{crop_filename}",
                "bbox": {
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2
                }
            }

            detections.append(detection_data)
            if best_crop_filename is None or ocr_confidence > max(
                (item["ocr_confidence"] for item in detections[:-1]), default=-1
            ):
                best_crop_filename = crop_filename

            # Draw box and plate text on image
            label = plate_text if plate_text else "Plate"

            cv2.rectangle(image, (x1, y1), (x2, y2), (0, 255, 0), 2)

            cv2.putText(
                image,
                f"{label} {confidence:.2f}",
                (x1, max(y1 - 10, 20)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 255, 0),
                2
            )

    output_filename = "detected_" + filename
    output_path = os.path.join(app.config["OUTPUT_FOLDER"], output_filename)
    cv2.imwrite(output_path, image)

    best_detection = max(detections, key=lambda item: item["ocr_confidence"], default=None)
    matched_user = find_registered_user(best_detection["plate_number"]) if best_detection else None
    parking_location = generate_parking_location()
    pending = {
        "image_path": image_path,
        "original_filename": original_filename,
        "plate_crop_path": os.path.join(PLATE_FOLDER, best_crop_filename) if best_crop_filename else None,
        "detection": best_detection,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "parking_location": parking_location,
        "result_path": output_path,
    }
    try:
        image_hash = image_sha256(image_path)
        pending = persist_pending_detection(token, pending, output_path, image_hash)
        pending_detections[token] = pending
    except Exception as exc:
        return jsonify({"success": False, "message": f"Could not persist detection preview: {exc}"}), 503

    for item in detections:
        item["plate_image_url"] = pending.get("plate_image_url")

    return jsonify({
        "success": True,
        "message": "Plate detection and OCR completed",
        "plate_detected": len(detections) > 0,
        "detections": detections,
        "confirmation_token": token,
        "best_detection": best_detection,
        "matched_user": matched_user,
        "parking_location": parking_location,
        "uploaded_image_url": pending["image_url"],
        "result_image": pending["result_image_url"]
    })


@app.route("/uploads/<filename>", methods=["GET"])
def uploaded_file(filename):
    from flask import send_from_directory
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename)


@app.route("/registered-user/<plate_number>", methods=["GET"])
def registered_user(plate_number):
    user = find_registered_user(plate_number)
    return jsonify({"success": True, "found": user is not None, "user": user})


@app.route("/confirm-car", methods=["POST"])
def confirm_car():
    payload = request.get_json(silent=True) or {}
    token = payload.get("confirmation_token", "")
    pending = load_pending_detection(token)
    if pending is None:
        return jsonify({"success": False, "message": "Detection expired or was not found"}), 404

    plate_number = clean_plate_text(payload.get("plate_number", ""))
    if not plate_number:
        return jsonify({"success": False, "message": "A valid plate number is required"}), 400

    # Registered-user data is authoritative. If this plate belongs to a user,
    # do not trust duplicate owner/vehicle fields sent by the browser.
    matched_user = find_registered_user(plate_number)
    required_fields = (
        ("entry_time",)
        if matched_user else
        ("uid", "name", "email", "student_id", "car_model", "car_colour",
         "entry_time")
    )
    missing_fields = [
        field for field in required_fields
        if not str(payload.get(field, "")).strip()
    ]
    if missing_fields:
        return jsonify({
            "success": False,
            "message": f"Missing required car data: {', '.join(missing_fields)}"
        }), 400

    image_hash = pending.get("image_hash")
    if not image_hash:
        return jsonify({"success": False, "message": "Detection image metadata is incomplete"}), 409
    duplicate = find_duplicate_image(image_hash)
    if duplicate:
        cleanup_pending_detection(token, pending)
        return jsonify({
            "success": False,
            "duplicate": True,
            "message": f"This image already exists for car {duplicate['car_plate']}.",
            "existing_car": duplicate
        }), 409

    detection = pending.get("detection") or {}
    parking_location = pending["parking_location"]
    try:
        image_url, plate_image_url, cloudinary_ids = upload_confirmed_images(
            pending, plate_number, token, image_hash
        )
    except Exception as exc:
        return jsonify({
            "success": False,
            "message": f"Cloudinary upload failed: {exc}"
        }), 503

    record = {
        "uid": str(payload.get("uid", "")).strip(),
        "name": str(payload.get("name", "")).strip(),
        "email": str(payload.get("email", "")).strip(),
        "student_id": str(payload.get("student_id", "")).strip().upper(),
        "car_model": str(payload.get("car_model", "")).strip(),
        "car_colour": str(payload.get("car_colour", "")).strip(),
        "car_plate": plate_number,
        "car_plate_search": plate_number,
        "is_oku": bool(payload.get("is_oku", False)),
        "parking_level": parking_location["parking_level"],
        "parking_zone": parking_location["parking_zone"],
        "parking_row": parking_location["parking_row"],
        "parking_slot": parking_location["parking_slot"],
        "image_url": image_url,
        "image_sha256": image_hash,
        "plate_image_url": plate_image_url,
        "cloudinary_public_id": cloudinary_ids[0],
        "plate_cloudinary_public_id": cloudinary_ids[1] if len(cloudinary_ids) > 1 else None,
        "detection_confidence": detection.get("detection_confidence", 0),
        "ocr_confidence": detection.get("ocr_confidence", 0),
        "status": payload.get("status", "parked"),
        "entry_time": payload.get("entry_time") or datetime.now(timezone.utc).isoformat(),
        "exit_time": None,
        "source": "ADMIN_IMAGE_UPLOAD",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "confirmed_at": datetime.now(timezone.utc).isoformat()
    }
    if matched_user:
        record.update({
            "uid": matched_user["uid"],
            "name": matched_user["name"],
            "email": matched_user["email"],
            "student_id": matched_user["student_id"],
            "car_model": matched_user["car_model"],
            "car_colour": matched_user["car_colour"],
            "is_oku": matched_user["is_oku"]
        })
    try:
        db.collection("find_my_car").document(plate_number).set(record, merge=True)
    except Exception:
        for public_id in cloudinary_ids:
            cloudinary.uploader.destroy(public_id, resource_type="image", invalidate=True)
        raise

    cleanup_pending_detection(token, pending)

    return jsonify({
        "success": True,
        "message": f"{plate_number} was added to Firebase",
        "car": record
    }), 201

@app.route("/find-car/<plate_number>", methods=["GET"])
@app.route("/find_car/<plate_number>", methods=["GET"])
def find_car(plate_number):
    cleaned_plate = clean_plate_text(plate_number)

    print("Searching for plate:", cleaned_plate)

    cars_ref = db.collection("find_my_car")
    query = cars_ref.where("car_plate_search", "==", cleaned_plate).limit(1).stream()

    car_data = None

    for doc in query:
        car_data = doc.to_dict()
        break

    if car_data is None:
        return jsonify({
            "success": True,
            "found": False,
            "message": "Car not found",
            "searched_plate": cleaned_plate
        }), 404

    return jsonify({
        "success": True,
        "found": True,
        "message": "Car found",
        "car": {
            "uid": car_data.get("uid"),
            "name": car_data.get("name"),
            "email": car_data.get("email"),
            "student_id": car_data.get("student_id"),

            "car_model": car_data.get("car_model"),
            "car_colour": car_data.get("car_colour"),
            "car_plate": car_data.get("car_plate"),
            "car_plate_search": car_data.get("car_plate_search"),
            "is_oku": car_data.get("is_oku"),

            "parking_level": car_data.get("parking_level"),
            "parking_zone": car_data.get("parking_zone"),
            "parking_row": car_data.get("parking_row"),
            "parking_slot": car_data.get("parking_slot"),

            "image_url": car_data.get("image_url"),
            "status": car_data.get("status"),
            "entry_time": car_data.get("entry_time"),
            "exit_time": car_data.get("exit_time")
        }
    })



@app.route("/sample-plates", methods=["GET"])
def sample_plates():
    cars_ref = db.collection("find_my_car").stream()

    plates = []

    for doc in cars_ref:
        car = doc.to_dict()

        if car.get("status") == "parked":
            plates.append({
                "car_plate": car.get("car_plate"),
                "car_plate_search": car.get("car_plate_search"),
                "car_model": car.get("car_model"),
                "car_colour": car.get("car_colour")
            })

    return jsonify({
        "success": True,
        "count": len(plates),
        "plates": plates
    })


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5002, debug=False, use_reloader=False, threaded=True)
