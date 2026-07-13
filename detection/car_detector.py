"""
Car + Parking Detection Pipeline (FINAL)
=======================================
- YOLOv8 car detection
- Car colour detection
- Parking occupancy (IoU with polygons)
- Annotated images + CSV + Parking JSON
- DEFAULT: runs sample_images/ if no argument given

Run:
    python car_detector.py
"""

import cv2
import csv
import os
import json
import numpy as np
import pandas as pd
from datetime import datetime
from pathlib import Path
from typing import List
from ultralytics import YOLO
from shapely.geometry import Polygon

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
BASE_DIR        = Path(__file__).resolve().parent
ROOT_DIR        = BASE_DIR.parent

OUTPUT_CSV      = str(BASE_DIR / "csv_output/car_detections.csv")
ANNOTATED_DIR   = str(BASE_DIR / "annotated_images")
PARKING_JSON    = str(ROOT_DIR / "bounding_box/parking_points.json")
DEFAULT_INPUT   = str(BASE_DIR / "sample_images")

CAR_CONF        = 0.4
CAR_CLASS_ID    = 2
IOU_THRESHOLD   = 0.3

BOX_COLOUR      = (255, 0, 0)
BOX_THICKNESS   = 2
LABEL_COLOUR    = (255, 255, 255)
LABEL_BG_COLOUR = (0, 200, 0)

# ─────────────────────────────────────────────
# COLOUR DETECTION
# ─────────────────────────────────────────────
COLOUR_RANGES = {
    "red":    [([0,70,50],[10,255,255]), ([170,70,50],[180,255,255])],
    "orange": [([11,70,50],[25,255,255])],
    "yellow": [([26,70,50],[34,255,255])],
    "green":  [([35,40,40],[85,255,255])],
    "blue":   [([86,50,50],[130,255,255])],
    "purple": [([131,50,50],[160,255,255])],
    "white":  [([0,0,200],[180,30,255])],
    "silver": [([0,0,150],[180,30,200])],
    "grey":   [([0,0,80],[180,30,150])],
    "black":  [([0,0,0],[180,255,60])],
}

def get_dominant_colour(bgr_roi):
    if bgr_roi.size == 0:
        return "unknown"

    hsv = cv2.cvtColor(bgr_roi, cv2.COLOR_BGR2HSV)
    best_colour, best_count = "unknown", 0

    for colour, ranges in COLOUR_RANGES.items():
        mask = np.zeros(hsv.shape[:2], dtype=np.uint8)
        for lo, hi in ranges:
            mask |= cv2.inRange(hsv, np.array(lo), np.array(hi))
        count = cv2.countNonZero(mask)

        if count > best_count:
            best_count = count
            best_colour = colour

    return best_colour

# ─────────────────────────────────────────────
# DRAWING
# ─────────────────────────────────────────────
def draw_box(frame, x1, y1, x2, y2, colour, conf, idx):
    label = f"Car {idx} | {colour} | {conf:.2f}"

    cv2.rectangle(frame, (x1,y1), (x2,y2), BOX_COLOUR, BOX_THICKNESS)

    (tw, th), base = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
    y_label = max(y1 - th - base - 4, 0)

    cv2.rectangle(frame,
                  (x1, y_label),
                  (x1 + tw + 4, y_label + th + base + 4),
                  LABEL_BG_COLOUR, -1)

    cv2.putText(frame, label,
                (x1 + 2, y_label + th + 2),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                LABEL_COLOUR, 1, cv2.LINE_AA)

# ─────────────────────────────────────────────
# CSV
# ─────────────────────────────────────────────
FIELDNAMES = ["timestamp","image_source","car_index","car_colour",
              "confidence","x1","y1","x2","y2","annotated_path"]

def init_csv(path):
    if not os.path.exists(path):
        with open(path, "w", newline="") as f:
            csv.writer(f).writerow(FIELDNAMES)

def append_to_csv(path, row):
    with open(path, "a", newline="") as f:
        csv.DictWriter(f, fieldnames=FIELDNAMES).writerow(row)

# ─────────────────────────────────────────────
# PARKING DATA
# ─────────────────────────────────────────────
def load_parking_data():
    if not os.path.exists(PARKING_JSON):
        print("[WARN] parking_points.json not found")
        return None

    with open(PARKING_JSON, "r") as f:
        return json.load(f)

# ─────────────────────────────────────────────
# PROCESS IMAGE
# ─────────────────────────────────────────────
def process_image(image_path, model, parking_data, csv_path):

    frame = cv2.imread(image_path)
    if frame is None:
        print(f"[ERROR] Cannot read {image_path}")
        return []

    annotated = frame.copy()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    detections = []

    results = model(frame, conf=CAR_CONF, verbose=False)[0]
    car_boxes = [b for b in results.boxes if int(b.cls[0]) == CAR_CLASS_ID]

    # Convert to polygons
    car_polys = []
    for b in car_boxes:
        x1,y1,x2,y2 = map(int, b.xyxy[0])
        poly = Polygon([(x1,y1),(x2,y1),(x2,y2),(x1,y2)])
        car_polys.append((poly, b))

    # ── PARKING DETECTION ──────────────────────
    parking_status = {}
    free = 0
    occupied = 0

    if parking_data:
        img_name = Path(image_path).stem
        parking_spots = parking_data.get(img_name, {})

        for spot_id, coords in parking_spots.items():
            spot_poly = Polygon(coords)
            occupied_flag = False

            for car_poly, _ in car_polys:
                inter = spot_poly.intersection(car_poly).area
                union = spot_poly.union(car_poly).area
                iou = inter / union if union > 0 else 0

                if iou > IOU_THRESHOLD:
                    occupied_flag = True
                    break

            parking_status[spot_id] = occupied_flag

            if occupied_flag:
                occupied += 1
            else:
                free += 1

    # ── DRAW CARS ──────────────────────────────
    for i, (_, b) in enumerate(car_polys, start=1):
        x1,y1,x2,y2 = map(int, b.xyxy[0])
        conf = float(b.conf[0])

        roi = frame[y1:y2, x1:x2]
        colour = get_dominant_colour(roi)

        draw_box(annotated, x1,y1,x2,y2, colour, conf, i)

        detections.append({
            "x1":x1,"y1":y1,"x2":x2,"y2":y2,
            "conf":conf,"colour":colour
        })

    # ── DRAW PARKING ───────────────────────────
    if parking_data:
        for spot_id, coords in parking_spots.items():
            pts = np.array(coords, np.int32)

            color = (0,0,255) if parking_status.get(spot_id, False) else (0,255,0)
            cv2.polylines(annotated, [pts], True, color, 2)

    # ── SAVE IMAGE ─────────────────────────────
    os.makedirs(ANNOTATED_DIR, exist_ok=True)
    out_path = os.path.join(
        ANNOTATED_DIR,
        Path(image_path).stem + "_detected.jpg"
    )
    cv2.imwrite(out_path, annotated)

    # ── SAVE CSV ───────────────────────────────
    for i, d in enumerate(detections, start=1):
        append_to_csv(csv_path, {
            "timestamp":timestamp,
            "image_source":os.path.basename(image_path),
            "car_index":i,
            "car_colour":d["colour"],
            "confidence":f"{d['conf']:.2f}",
            "x1":d["x1"],"y1":d["y1"],
            "x2":d["x2"],"y2":d["y2"],
            "annotated_path":out_path
        })

    # ── SAVE PARKING JSON ──────────────────────
    if parking_data:
        parking_out = {
            "free": free,
            "occupied": occupied,
            "spots": parking_status
        }

        json_path = os.path.join(
            ANNOTATED_DIR,
            Path(image_path).stem + "_parking.json"
        )

        with open(json_path, "w") as f:
            json.dump(parking_out, f, indent=4)

        print(f"[INFO] {image_path} → Free: {free} | Occupied: {occupied}")

    cv2.imshow("Parking Detection", annotated)
    cv2.waitKey(0)   # press any key to go next image
    cv2.destroyAllWindows()

    return detections

# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────
def main():
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("input", nargs="?", default=DEFAULT_INPUT,
                        help="Image or folder (default: sample_images/)")
    parser.add_argument("--csv", default=OUTPUT_CSV)
    args = parser.parse_args()

    print("[INFO] Loading YOLOv8 model...")
    root_yolo_path = Path(__file__).resolve().parent.parent / "yolov8n.pt"
    model = YOLO(str(root_yolo_path))

    init_csv(args.csv)
    parking_data = load_parking_data()

    input_path = Path(args.input)

    # Folder
    if input_path.is_dir():
        images = [p for p in input_path.iterdir()
                  if p.suffix.lower() in [".jpg",".png",".jpeg"]]

        print(f"[INFO] Processing {len(images)} image(s)\n")

        for img in images:
            print(f"[IMG] {img.name}")
            process_image(str(img), model, parking_data, args.csv)

    # Single image
    elif input_path.is_file():
        process_image(str(input_path), model, parking_data, args.csv)

    else:
        print("[ERROR] Invalid path")

    # CSV preview
    if os.path.exists(args.csv):
        df = pd.read_csv(args.csv)
        print("\nLast detections:")
        print(df.tail(10).to_string(index=False))


if __name__ == "__main__":
    main()