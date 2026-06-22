from flask import Flask, jsonify, request
from flask_cors import CORS
# pyrefly: ignore [missing-import]
from ultralytics import YOLO
# pyrefly: ignore [missing-import]
import cv2
import os
import re
# pyrefly: ignore [missing-import]
import easyocr
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
OUTPUT_FOLDER = os.path.join(BASE_DIR, "static/results")
MODEL_PATH = os.path.join(BASE_DIR, "models/best.pt")

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["OUTPUT_FOLDER"] = OUTPUT_FOLDER

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# Load YOLOv8 number plate model
model = YOLO(MODEL_PATH)

# Load OCR reader
reader = easyocr.Reader(["en"], gpu=False)


def clean_plate_text(text):
    """
    Clean OCR output.
    Keeps only letters and numbers.
    Example: "VAB 1234!" becomes "VAB1234"
    """
    text = text.upper()
    text = re.sub(r"[^A-Z0-9]", "", text)
    return text


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

    filename = secure_filename(file.filename)
    image_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(image_path)

    image = cv2.imread(image_path)

    if image is None:
        return jsonify({
            "success": False,
            "message": "Invalid image file"
        }), 400

    results = model(image)

    detections = []

    for result in results:
        for box in result.boxes:
            confidence = float(box.conf[0])

            if confidence < 0.5:
                continue

            x1, y1, x2, y2 = map(int, box.xyxy[0])

            # Crop detected number plate
            plate_crop = image[y1:y2, x1:x2]

            # Improve crop quality before OCR
            plate_crop = cv2.resize(plate_crop, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
            gray = cv2.cvtColor(plate_crop, cv2.COLOR_BGR2GRAY)

            # OCR reading
            ocr_results = reader.readtext(gray)

            raw_text = ""
            ocr_confidence = 0.0

            if len(ocr_results) > 0:
                # Choose the OCR result with highest confidence
                best_ocr = max(ocr_results, key=lambda x: x[2])
                raw_text = best_ocr[1]
                ocr_confidence = float(best_ocr[2])

            plate_text = clean_plate_text(raw_text)

            detection_data = {
                "plate_number": plate_text,
                "raw_ocr_text": raw_text,
                "detection_confidence": round(confidence, 4),
                "ocr_confidence": round(ocr_confidence, 4),
                "bbox": {
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2
                }
            }

            detections.append(detection_data)

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

    return jsonify({
        "success": True,
        "message": "Plate detection and OCR completed",
        "plate_detected": len(detections) > 0,
        "detections": detections,
        "uploaded_image": image_path,
        "result_image": f"http://127.0.0.1:5002/static/results/{output_filename}"
    })


if __name__ == "__main__":
    app.run(debug=True, port=5002)