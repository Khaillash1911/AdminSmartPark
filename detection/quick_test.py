"""
Quick local test — runs your trained best.pt on sample images
and draws bounding boxes. No CSV, no OCR — just to confirm
your model is detecting plates correctly.
"""

from ultralytics import YOLO
from pathlib import Path
import cv2
import os

# Path
BASE_DIR    = Path(__file__).resolve().parent

MODEL_PATH  = str(BASE_DIR / "best.pt")           # path to your downloaded best.pt
IMAGES_DIR  = str(BASE_DIR / "sample_images")     # folder containing your test images
CONF        = 0.4                 # detection confidence threshold (0–1)
OUTPUT_DIR  = str(BASE_DIR / "test_output")       # where annotated images are saved


def main():
    if not os.path.exists(MODEL_PATH):
        print(f"❌  Model not found: {MODEL_PATH}")
        print("    Make sure best.pt is in the same folder as this script.")
        return

    if not os.path.exists(IMAGES_DIR):
        print(f"❌  Images folder not found: {IMAGES_DIR}")
        print(f"    Create a folder called '{IMAGES_DIR}' and put your test images in it.")
        return

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Load model
    print(f"✅  Loading model: {MODEL_PATH}")
    model = YOLO(MODEL_PATH)
    print(f"    Classes: {model.names}")

    # Find images
    exts   = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    images = [p for p in Path(IMAGES_DIR).iterdir() if p.suffix.lower() in exts]

    if not images:
        print(f"❌  No images found in '{IMAGES_DIR}'")
        return

    print(f"\n📂  Found {len(images)} image(s) — running inference...\n")

    for img_path in sorted(images):
        frame = cv2.imread(str(img_path))
        if frame is None:
            print(f"  [skip] Cannot read {img_path.name}")
            continue

        # Run detection
        results = model(frame, conf=CONF, verbose=False)[0]
        boxes   = results.boxes

        if len(boxes) == 0:
            print(f"  {img_path.name:30s}  →  No plates detected")
        else:
            print(f"  {img_path.name:30s}  →  {len(boxes)} plate(s) detected:")

        # Draw boxes on the image
        annotated = frame.copy()
        for box in boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            conf_score      = float(box.conf[0])
            label           = f"plate {conf_score:.2f}"

            # Draw rectangle + label
            cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.putText(annotated, label, (x1, y1 - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

            print(f"      conf={conf_score:.2f}  box=[{x1},{y1},{x2},{y2}]")

        # Save annotated image
        out_path = os.path.join(OUTPUT_DIR, img_path.name)
        cv2.imwrite(out_path, annotated)
        print(f"      saved → {out_path}")

    print(f"\n✅  Done! Check the '{OUTPUT_DIR}' folder for annotated images.")


if __name__ == "__main__":
    main()
