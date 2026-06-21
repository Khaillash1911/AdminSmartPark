import matplotlib.pyplot as plt
from matplotlib.widgets import Button
import cv2
import json
import os
from pathlib import Path

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
IMAGE_FOLDER = "../plate_detector/sample_images"
OUTPUT_JSON  = "parking_points.json"

# Load all images automatically
imgPathArray = sorted([
    str(p) for p in Path(IMAGE_FOLDER).iterdir()
    if p.suffix.lower() in [".jpg", ".png", ".jpeg"]
])

imgIndex = 0
points = [[]]

# Store all zones across images
all_parking_data = {}

# ─────────────────────────────────────────────
# CLICK HANDLER
# ─────────────────────────────────────────────
def onclick(event):
    global points

    if event.inaxes != ax:
        return

    if len(points[-1]) >= 4:
        points.append([])

    points[-1].append((int(event.xdata), int(event.ydata)))
    ax.scatter(event.xdata, event.ydata, color='red')

    if len(points[-1]) == 4:
        box = points[-1] + [points[-1][0]]
        xs, ys = zip(*box)
        ax.plot(xs, ys, color='blue')

    plt.draw()

# ─────────────────────────────────────────────
# SAVE CURRENT IMAGE ZONES
# ─────────────────────────────────────────────
def save_current_image():
    global all_parking_data

    img_name = Path(imgPathArray[imgIndex]).stem

    all_parking_data[img_name] = {}

    for i, box in enumerate(points):
        if len(box) == 4:
            all_parking_data[img_name][str(i)] = box

# ─────────────────────────────────────────────
# SAVE TO JSON
# ─────────────────────────────────────────────
def save_to_json(event):
    save_current_image()

    with open(OUTPUT_JSON, "w") as f:
        json.dump(all_parking_data, f, indent=2)

    print(f"[INFO] Saved to {OUTPUT_JSON}")

# ─────────────────────────────────────────────
# NEXT IMAGE
# ─────────────────────────────────────────────
def next_zone(event):
    global imgIndex, points

    # Save current before switching
    save_current_image()

    points = [[]]

    imgIndex = (imgIndex + 1) % len(imgPathArray)

    load_image()

# ─────────────────────────────────────────────
# LOAD IMAGE
# ─────────────────────────────────────────────
def load_image():
    ax.clear()

    img_bgr = cv2.imread(imgPathArray[imgIndex])
    img = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

    ax.imshow(img)
    ax.set_title(Path(imgPathArray[imgIndex]).name)

    plt.draw()

# ─────────────────────────────────────────────
# MAIN UI SETUP
# ─────────────────────────────────────────────
fig, ax = plt.subplots()

load_image()

# Buttons
ax_next = plt.axes([0.3, 0.9, 0.2, 0.075])
btn_next = Button(ax_next, 'Next Image')
btn_next.on_clicked(next_zone)

ax_save = plt.axes([0.55, 0.9, 0.2, 0.075])
btn_save = Button(ax_save, 'Save All')
btn_save.on_clicked(save_to_json)

# Events
fig.canvas.mpl_connect('button_press_event', onclick)

plt.show()