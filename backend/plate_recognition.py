"""Shared, lazy number-plate detection and OCR for SmartPark services."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT_DIR / "find_my_car_system" / "backend" / "models" / "best.pt"
_model = None
_reader = None


def clean_plate_text(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", text.upper())


def _get_model():
    global _model
    if _model is None:
        from ultralytics import YOLO
        if not MODEL_PATH.exists():
            raise FileNotFoundError(f"Number-plate model is missing: {MODEL_PATH}")
        _model = YOLO(str(MODEL_PATH))
    return _model


def _get_reader():
    global _reader
    if _reader is None:
        import easyocr
        _reader = easyocr.Reader(["en"], gpu=False)
    return _reader


def _score(text: str, confidence: float) -> float:
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


def _read_crop(plate_crop) -> tuple[str, str, float]:
    import cv2

    height, width = plate_crop.shape[:2]
    scale = max(2, min(5, 240 // max(height, 1)))
    enlarged = cv2.resize(plate_crop, (width * scale, height * scale), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(enlarged, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    denoised = cv2.bilateralFilter(enhanced, 7, 45, 45)
    _, otsu = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    adaptive = cv2.adaptiveThreshold(denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 9)
    variants = (gray, enhanced, denoised, otsu, cv2.bitwise_not(otsu), adaptive)
    best = {"text": "", "raw": "", "confidence": 0.0, "score": -1.0}
    reader = _get_reader()
    for variant in variants:
        for decoder in ("beamsearch", "greedy"):
            try:
                results = reader.readtext(
                    variant, detail=1, paragraph=False, decoder=decoder,
                    allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
                    width_ths=1.5, mag_ratio=1.5, add_margin=0.12,
                )
            except Exception:
                continue
            candidates = list(results)
            if len(results) > 1:
                ordered = sorted(results, key=lambda item: min(point[0] for point in item[0]))
                candidates.append(([], " ".join(item[1] for item in ordered), sum(float(item[2]) for item in ordered) / len(ordered)))
            for _, raw, confidence in candidates:
                cleaned = clean_plate_text(raw)
                score = _score(cleaned, float(confidence))
                if score > best["score"]:
                    best = {"text": cleaned, "raw": raw, "confidence": float(confidence), "score": score}
    return str(best["text"]), str(best["raw"]), float(best["confidence"])


def recognize_best_plate(image) -> dict[str, Any] | None:
    """Detect every plate in an image and return the strongest OCR candidate."""
    detections = []
    image_height, image_width = image.shape[:2]
    for result in _get_model()(image, conf=0.2, imgsz=1280, verbose=False):
        for box in result.boxes:
            detection_confidence = float(box.conf[0])
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            pad_x = int(max(1, x2 - x1) * 0.12)
            pad_y = int(max(1, y2 - y1) * 0.18)
            x1, y1 = max(0, x1 - pad_x), max(0, y1 - pad_y)
            x2, y2 = min(image_width, x2 + pad_x), min(image_height, y2 + pad_y)
            crop = image[y1:y2, x1:x2]
            if crop.size == 0:
                continue
            plate, raw, ocr_confidence = _read_crop(crop)
            if plate:
                detections.append({
                    "plate_number": plate,
                    "raw_ocr_text": raw,
                    "detection_confidence": round(detection_confidence, 4),
                    "ocr_confidence": round(ocr_confidence, 4),
                    "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                })
    return max(detections, key=lambda item: (_score(item["plate_number"], item["ocr_confidence"]), item["detection_confidence"]), default=None)
