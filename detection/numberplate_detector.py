"""
Number Plate Detection & Recognition — Cars Only
=================================================
Detects number plates from images of cars using YOLOv8 + EasyOCR.
Saves plate text, car colour, and timestamp to a CSV dataset.

Requirements:
    pip install ultralytics easyocr opencv-python numpy pandas Pillow

Usage:
    Single image:   python numberplate_detector.py car.jpg --plate-model best.pt
    Folder:         python numberplate_detector.py sample_images/ --plate-model best.pt
"""

import cv2
import csv
import os
import re
import numpy as np
import easyocr
import pandas as pd
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Tuple
from ultralytics import YOLO


# ─────────────────────────────────────────────
# CONFIG — edit these to suit your setup
# ─────────────────────────────────────────────
BASE_DIR    = Path(__file__).resolve().parent

OUTPUT_CSV  = str(BASE_DIR / "csv_output/detections.csv")   # output CSV file
PLATE_CONF  = 0.4                # plate detection confidence (0–1)
CAR_CONF    = 0.4                # car detection confidence (0–1)
SAVE_CROPS  = True               # save cropped plate images to CROPS_DIR
CROPS_DIR   = str(BASE_DIR / "plate_crops")      # folder to save cropped plate images

# COCO class ID 2 = car only
CAR_CLASS_ID = 2

# Dominant colour detection (HSV ranges)
COLOUR_RANGES = {
    "red":    [([0,   70,  50], [10,  255, 255]), ([170, 70, 50], [180, 255, 255])],
    "orange": [([11,  70,  50], [25,  255, 255])],
    "yellow": [([26,  70,  50], [34,  255, 255])],
    "green":  [([35,  40,  40], [85,  255, 255])],
    "blue":   [([86,  50,  50], [130, 255, 255])],
    "purple": [([131, 50,  50], [160, 255, 255])],
    "white":  [([0,   0,   200], [180, 30,  255])],
    "silver": [([0,   0,   150], [180, 30,  200])],
    "grey":   [([0,   0,   80],  [180, 30,  150])],
    "black":  [([0,   0,   0],   [180, 255, 60])],
}


# ─────────────────────────────────────────────
# LOAD MODELS
# ─────────────────────────────────────────────

def load_models(plate_model_path: str):
    """Load YOLO car detector, YOLO plate detector, and EasyOCR."""
    print("[INFO] Loading YOLO car detection model (yolov8n.pt)...")
    root_yolo_path = Path(__file__).resolve().parent.parent / "yolov8n.pt"
    car_model = YOLO(str(root_yolo_path))   # standard COCO model for finding cars

    print(f"[INFO] Loading plate model: {plate_model_path}")
    plate_model = YOLO(plate_model_path)

    print("[INFO] Loading EasyOCR (first run downloads ~100 MB)...")
    reader = easyocr.Reader(["en"], gpu=False)

    return car_model, plate_model, reader


# ─────────────────────────────────────────────
# COLOUR DETECTION
# ─────────────────────────────────────────────

def get_dominant_colour(bgr_roi: np.ndarray) -> str:
    """Return the dominant colour of a BGR car region."""
    hsv = cv2.cvtColor(bgr_roi, cv2.COLOR_BGR2HSV)
    best_colour, best_count = "unknown", 0

    for colour, ranges in COLOUR_RANGES.items():
        mask = np.zeros(hsv.shape[:2], dtype=np.uint8)
        for (lo, hi) in ranges:
            mask |= cv2.inRange(hsv, np.array(lo, dtype=np.uint8),
                                     np.array(hi, dtype=np.uint8))
        count = cv2.countNonZero(mask)
        if count > best_count:
            best_count = count
            best_colour = colour

    return best_colour


# ─────────────────────────────────────────────
# PLATE DESKEW  (multi-strategy)
# ─────────────────────────────────────────────

def _order_points(pts: np.ndarray) -> np.ndarray:
    """Order 4 points: top-left, top-right, bottom-right, bottom-left."""
    rect = np.zeros((4, 2), dtype=np.float32)
    s    = pts.sum(axis=1)
    diff = np.diff(pts, axis=1)
    rect[0] = pts[np.argmin(s)]     # top-left
    rect[2] = pts[np.argmax(s)]     # bottom-right
    rect[1] = pts[np.argmin(diff)]  # top-right
    rect[3] = pts[np.argmax(diff)]  # bottom-left
    return rect


def _perspective_correct(plate_bgr: np.ndarray, gray: np.ndarray) -> Optional[np.ndarray]:
    """
    Try to find a 4-corner quad and apply a perspective warp.
    Tries two Canny thresholds so it works on both high- and low-contrast plates.
    Returns the warped image, or None if no good quad is found.
    """
    for (lo, hi) in [(30, 150), (10, 80)]:          # two threshold attempts
        edged = cv2.Canny(gray, lo, hi)
        # Dilate slightly to close gaps in the plate border
        edged = cv2.dilate(edged, np.ones((3, 3), np.uint8), iterations=1)
        contours, _ = cv2.findContours(edged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue

        img_area = plate_bgr.shape[0] * plate_bgr.shape[1]
        for cnt in sorted(contours, key=cv2.contourArea, reverse=True)[:8]:
            # Skip contours that are too small to be the plate border
            if cv2.contourArea(cnt) < img_area * 0.1:
                continue
            peri   = cv2.arcLength(cnt, True)
            # Try a slightly relaxed epsilon to catch imperfect rectangles
            for eps in [0.02, 0.04, 0.06]:
                approx = cv2.approxPolyDP(cnt, eps * peri, True)
                if len(approx) == 4:
                    pts = _order_points(approx.reshape(4, 2).astype(np.float32))
                    tl, tr, br, bl = pts
                    w = int(max(np.linalg.norm(br - bl), np.linalg.norm(tr - tl)))
                    h = int(max(np.linalg.norm(tr - br), np.linalg.norm(tl - bl)))
                    if w < 20 or h < 8:
                        continue
                    # Sanity check: plate should be wider than tall
                    if w < h:
                        continue
                    dst = np.array([[0,0],[w-1,0],[w-1,h-1],[0,h-1]], dtype=np.float32)
                    M   = cv2.getPerspectiveTransform(pts, dst)
                    return cv2.warpPerspective(plate_bgr, M, (w, h))
    return None


def _rotation_correct(plate_bgr: np.ndarray, gray: np.ndarray) -> np.ndarray:
    """
    Correct tilt using the dominant line angle from HoughLinesP.
    Falls back to minAreaRect if no lines are found.
    """
    edges = cv2.Canny(gray, 50, 150)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180,
                            threshold=30, minLineLength=20, maxLineGap=10)

    angle = 0.0
    if lines is not None:
        angles = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            if x2 - x1 == 0:
                continue
            a = np.degrees(np.arctan2(y2 - y1, x2 - x1))
            # Only care about near-horizontal lines (the text baseline)
            if abs(a) < 45:
                angles.append(a)
        if angles:
            angle = float(np.median(angles))

    # minAreaRect fallback
    if angle == 0.0:
        thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
        coords = np.column_stack(np.where(thresh > 0))
        if len(coords) >= 5:
            raw = cv2.minAreaRect(coords)[-1]
            angle = -(90 + raw) if raw < -45 else -raw

    if abs(angle) < 0.5:          # not worth rotating for tiny angles
        return plate_bgr

    h, w = plate_bgr.shape[:2]
    M    = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(plate_bgr, M, (w, h),
                          flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def deskew_plate(plate_bgr: np.ndarray) -> np.ndarray:
    """
    Straighten a tilted plate crop using a multi-strategy approach:
      1. Upscale first so contour/line detection has more pixels to work with
      2. Try perspective correction (best for angled shots)
      3. Fall back to rotation correction (good for mildly tilted shots)
    """
    # Always work on an upscaled copy — makes contour detection much more reliable
    h, w   = plate_bgr.shape[:2]
    scale  = max(1, 400 // max(w, 1))
    if scale > 1:
        plate_bgr = cv2.resize(plate_bgr, (w * scale, h * scale),
                               interpolation=cv2.INTER_CUBIC)

    gray    = cv2.cvtColor(plate_bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Strategy 1: full perspective warp
    result = _perspective_correct(plate_bgr, blurred)
    if result is not None:
        return result

    # Strategy 2: rotation-only correction via HoughLines / minAreaRect
    return _rotation_correct(plate_bgr, blurred)


# ─────────────────────────────────────────────
# OCR  (multi-pass)
# ─────────────────────────────────────────────

def clean_plate_text(text: str) -> str:
    """
    Match find_my_car_system's plate search format:
    uppercase and keep letters/numbers only.
    """
    return re.sub(r"[^A-Z0-9]", "", text.upper())


def _plate_score(text: str, conf: float) -> float:
    """
    Prefer confident Malaysian-like plate strings without being too strict.
    """
    if not text:
        return -1.0

    score = conf + min(len(text), 9) * 0.035
    if 4 <= len(text) <= 9:
        score += 0.25
    if re.fullmatch(r"[A-Z]{1,4}[0-9]{1,4}[A-Z]?", text):
        score += 0.45
    elif re.search(r"[A-Z]", text) and re.search(r"[0-9]", text):
        score += 0.15
    return score


def is_valid_plate_text(text: str, ocr_confidence: float) -> bool:
    """
    Accept realistic plate reads and reject low-confidence OCR fragments such
    as "CD" or "RR93" that EasyOCR sometimes emits from reflections/bumper text.
    """
    if not (5 <= len(text) <= 9):
        return False
    if ocr_confidence < 0.25:
        return False
    return bool(re.fullmatch(r"[A-Z]{1,4}[0-9]{1,4}[A-Z]?", text))


def _preprocess_for_ocr(gray: np.ndarray) -> list[np.ndarray]:
    """
    Return several preprocessed versions of a greyscale plate image.
    EasyOCR is run on all of them and the best result is kept.
    """
    # CLAHE contrast boost
    clahe    = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # Binary threshold (Otsu)
    _, otsu = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Inverted binary (white-on-dark plates)
    inverted = cv2.bitwise_not(otsu)

    # Adaptive threshold — handles uneven lighting across the plate
    adaptive = cv2.adaptiveThreshold(enhanced, 255,
                                     cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                     cv2.THRESH_BINARY, 31, 10)

    # Keep plain grayscale first because EasyOCR often performs best on a
    # gently upscaled natural crop, just like the old find_my_car API flow.
    return [gray, enhanced, otsu, inverted, adaptive]


def read_plate(reader: easyocr.Reader, plate_bgr: np.ndarray) -> Tuple[str, str, float]:
    """
    OCR a deskewed plate crop using multiple preprocessing passes.
    Returns (cleaned_text, raw_text, confidence).
    """
    # Upscale small crops — OCR needs enough pixels to distinguish characters
    h, w  = plate_bgr.shape[:2]
    scale = max(1, 200 // max(h, 1))
    if scale > 1:
        plate_bgr = cv2.resize(plate_bgr, (w * scale, h * scale),
                               interpolation=cv2.INTER_CUBIC)

    gray       = cv2.cvtColor(plate_bgr, cv2.COLOR_BGR2GRAY)
    best_text  = ""
    best_raw   = ""
    best_conf  = 0.0
    best_score = -1.0

    for variant in _preprocess_for_ocr(gray):
        read_attempts = [
            {"allowlist": "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"},
            {}
        ]
        for options in read_attempts:
            try:
                results = reader.readtext(
                    variant,
                    detail=1,
                    paragraph=False,
                    decoder="beamsearch",
                    width_ths=0.9,
                    add_margin=0.08,
                    **options
                )
            except Exception:
                continue

            if not results:
                continue

            # Old API behavior: one highest-confidence text box is sometimes
            # cleaner than concatenating noisy OCR fragments.
            for (_, raw, conf) in results:
                cleaned = clean_plate_text(raw)
                score = _plate_score(cleaned, float(conf))
                if score > best_score:
                    best_score = score
                    best_conf = float(conf)
                    best_text = cleaned
                    best_raw = raw

            # Newer behavior: concatenate boxes for split or two-line plates.
            combined_raw = "".join(text for (_, text, _) in results)
            combined_text = clean_plate_text(combined_raw)
            combined_conf = max(float(conf) for (_, _, conf) in results)
            score = _plate_score(combined_text, combined_conf)
            if score > best_score:
                best_score = score
                best_conf = combined_conf
                best_text = combined_text
                best_raw = combined_raw

    return best_text, best_raw, best_conf


def expand_box(
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    frame_shape: tuple[int, int, int],
    pad_ratio: float = 0.12,
) -> tuple[int, int, int, int]:
    """Add a little context around a detected plate box before OCR."""
    h, w = frame_shape[:2]
    bw = max(1, x2 - x1)
    bh = max(1, y2 - y1)
    pad_x = int(bw * pad_ratio)
    pad_y = int(bh * pad_ratio)
    return (
        max(0, x1 - pad_x),
        max(0, y1 - pad_y),
        min(w, x2 + pad_x),
        min(h, y2 + pad_y),
    )


# ─────────────────────────────────────────────
# CSV
# ─────────────────────────────────────────────

FIELDNAMES = [
    "timestamp",
    "plate_text",
    "raw_ocr_text",
    "car_colour",
    "plate_confidence",
    "ocr_confidence",
    "bbox_x1",
    "bbox_y1",
    "bbox_x2",
    "bbox_y2",
    "image_source",
    "crop_path",
]

def init_csv(path: str):
    """Create CSV with headers, upgrading older header-only files if needed."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        with open(path, "w", newline="") as f:
            csv.writer(f).writerow(FIELDNAMES)
        print(f"[INFO] Created: {path}")
        return

    with open(path, newline="") as f:
        reader = csv.reader(f)
        rows = list(reader)

    if rows and rows[0] != FIELDNAMES:
        old_header = rows[0]
        old_data = rows[1:]
        with open(path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
            writer.writeheader()
            for old_row in old_data:
                mapped = dict(zip(old_header, old_row))
                writer.writerow({
                    "timestamp": mapped.get("timestamp", ""),
                    "plate_text": mapped.get("plate_text", ""),
                    "raw_ocr_text": mapped.get("raw_ocr_text", ""),
                    "car_colour": mapped.get("car_colour", ""),
                    "plate_confidence": mapped.get("plate_confidence", mapped.get("confidence", "")),
                    "ocr_confidence": mapped.get("ocr_confidence", ""),
                    "bbox_x1": mapped.get("bbox_x1", ""),
                    "bbox_y1": mapped.get("bbox_y1", ""),
                    "bbox_x2": mapped.get("bbox_x2", ""),
                    "bbox_y2": mapped.get("bbox_y2", ""),
                    "image_source": mapped.get("image_source", ""),
                    "crop_path": mapped.get("crop_path", ""),
                })
        print(f"[INFO] Upgraded CSV header: {path}")

def append_to_csv(path: str, row: dict):
    with open(path, "a", newline="") as f:
        csv.DictWriter(f, fieldnames=FIELDNAMES).writerow(row)


# ─────────────────────────────────────────────
# PROCESS A SINGLE IMAGE
# ─────────────────────────────────────────────

def process_image(
    image_path: str,
    car_model: YOLO,
    plate_model: YOLO,
    reader: easyocr.Reader,
    csv_path: str = OUTPUT_CSV,
) -> List[dict]:
    """
    Full pipeline for one image:
      1. Detect cars with YOLO (COCO)
      2. For each car → detect colour + find plate with best.pt
      3. Deskew + OCR the plate
      4. Save to CSV
    """
    frame = cv2.imread(image_path)
    if frame is None:
        print(f"[WARN] Could not read: {image_path}")
        return []

    if SAVE_CROPS:
        os.makedirs(CROPS_DIR, exist_ok=True)

    timestamp  = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    detections = []

    # ── Step 1: Find cars ─────────────────────────────────────────────────
    car_results = car_model(frame, conf=CAR_CONF, verbose=False)[0]
    car_boxes   = [b for b in car_results.boxes if int(b.cls[0]) == CAR_CLASS_ID]

    if not car_boxes:
        print(f"  [skip] No cars detected in {os.path.basename(image_path)}")
        return []

    # ── Step 2: Run plate model once on full frame ────────────────────────
    plate_results = plate_model(frame, conf=PLATE_CONF, verbose=False)[0]

    for car_box in car_boxes:
        cx1, cy1, cx2, cy2 = map(int, car_box.xyxy[0])
        car_roi    = frame[cy1:cy2, cx1:cx2]
        car_colour = get_dominant_colour(car_roi)

        # Find plates whose centre falls inside this car's bounding box
        plates_in_car = []
        for pb in plate_results.boxes:
            px1, py1, px2, py2 = map(int, pb.xyxy[0])
            centre_x = (px1 + px2) // 2
            centre_y = (py1 + py2) // 2
            if cx1 <= centre_x <= cx2 and cy1 <= centre_y <= cy2:
                plates_in_car.append((px1, py1, px2, py2, float(pb.conf[0])))

        # Second pass: crop-level plate detection can work better when the
        # plate is tiny in the full frame.
        if not plates_in_car:
            roi_results = plate_model(car_roi, conf=max(0.20, PLATE_CONF - 0.15), verbose=False)[0]
            for rb in roi_results.boxes:
                rx1, ry1, rx2, ry2 = map(int, rb.xyxy[0])
                plates_in_car.append((cx1 + rx1, cy1 + ry1, cx1 + rx2, cy1 + ry2, float(rb.conf[0])))

        # Last resort: use a narrow lower-center band of the car ROI. This is
        # saved as UNKNOWN if OCR cannot read it, making failures inspectable.
        if not plates_in_car:
            roi_h, roi_w = car_roi.shape[:2]
            band_y1 = cy1 + int(roi_h * 0.58)
            band_y2 = cy1 + int(roi_h * 0.86)
            band_x1 = cx1 + int(roi_w * 0.18)
            band_x2 = cx1 + int(roi_w * 0.82)
            plates_in_car = [(band_x1, band_y1, band_x2, band_y2, 0.0)]

        # ── Step 3: Deskew + OCR each plate ───────────────────────────────
        for (px1, py1, px2, py2, pconf) in plates_in_car:
            px1, py1, px2, py2 = expand_box(px1, py1, px2, py2, frame.shape)
            plate_crop = frame[py1:py2, px1:px2]
            if plate_crop.size == 0:
                continue

            deskewed   = deskew_plate(plate_crop)
            plate_text, raw_ocr_text, ocr_confidence = read_plate(reader, deskewed)
            valid_plate = is_valid_plate_text(plate_text, ocr_confidence)
            csv_plate_text = plate_text if valid_plate else "UNKNOWN"

            # Save crop image
            crop_path = ""
            if SAVE_CROPS:
                safe_name  = re.sub(r"[^\w]", "_", csv_plate_text)
                crop_fname = f"{safe_name}_{datetime.now().strftime('%H%M%S%f')}.jpg"
                crop_path  = os.path.join(CROPS_DIR, crop_fname)
                cv2.imwrite(crop_path, deskewed)

            row = {
                "timestamp":    timestamp,
                "plate_text":   csv_plate_text,
                "raw_ocr_text": raw_ocr_text,
                "car_colour":   car_colour,
                "plate_confidence": f"{pconf:.2f}",
                "ocr_confidence": f"{ocr_confidence:.4f}",
                "bbox_x1":      px1,
                "bbox_y1":      py1,
                "bbox_x2":      px2,
                "bbox_y2":      py2,
                "image_source": os.path.basename(image_path),
                "crop_path":    crop_path,
            }
            append_to_csv(csv_path, row)
            detections.append(row)
            status = "✓" if valid_plate else "?"
            print(
                f"  {status} Plate: {csv_plate_text:<12}  Colour: {car_colour:<8}  "
                f"PlateConf: {pconf:.2f}  OCRConf: {ocr_confidence:.2f}"
            )

    return detections


# ─────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Malaysian Number Plate Detector — Cars Only")
    parser.add_argument(
        "input",
        nargs="?",
        default=str(BASE_DIR / "sample_images"),
        help="Image file or folder of images (default: detection/sample_images)"
    )
    parser.add_argument(
        "--plate-model",
        default=str(BASE_DIR / "best.pt"),
        help="Path to your trained best.pt (default: detection/best.pt)"
    )
    parser.add_argument("--csv",         default=OUTPUT_CSV, help="Output CSV path")
    args = parser.parse_args()

    if not os.path.exists(args.plate_model):
        print(f"[ERROR] Plate model not found: {args.plate_model}")
        return

    car_model, plate_model, reader = load_models(args.plate_model)
    init_csv(args.csv)

    input_path = Path(args.input)

    # Folder of images
    if input_path.is_dir():
        exts   = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
        images = sorted([p for p in input_path.iterdir() if p.suffix.lower() in exts])
        print(f"[INFO] Found {len(images)} image(s) in '{input_path}'")
        for img in images:
            print(f"\n[IMG] {img.name}")
            process_image(str(img), car_model, plate_model, reader, args.csv)

    # Single image
    elif input_path.is_file():
        print(f"\n[IMG] {input_path.name}")
        process_image(str(input_path), car_model, plate_model, reader, args.csv)

    else:
        print(f"[ERROR] Not found: {input_path}")
        return

    # Show CSV preview
    if os.path.exists(args.csv):
        df = pd.read_csv(args.csv)
        print(f"\n{'─' * 60}")
        print(f"✅  {len(df)} record(s) saved to: {args.csv}")
        print(df.tail(10).to_string(index=False))


if __name__ == "__main__":
    main()
