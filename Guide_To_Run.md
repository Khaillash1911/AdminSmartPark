# SmartPark APU — How to Run the Complete System

Run the Node/Angular frontend first, followed by the three Python APIs. Keep all four terminals open while using the system.

## 1. Prerequisites

- Node.js 20 or newer and npm
- Python 3.11 or newer
- Git

Open a terminal at the project root:

```bash
cd "/path/to/AdminSmartPark"
```

All commands below assume this project-root location unless stated otherwise.

## 2. One-time installation

Install frontend packages:

```bash
cd admin-web
npm install --legacy-peer-deps
cd ..
```

Create the Python environment and install packages. If `.venv` already exists, do not recreate it.

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

Windows equivalent:

```powershell
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
```

## 3. Required configuration

### Firebase

Place the Firebase Admin service account at:

```text
find_my_car_system/backend/serviceAccountKey.json
```

It is required by Find My Car and by the detector when it writes double-parking notifications to Firestore `notifications`.

### Cloudinary

Create or update `find_my_car_system/backend/.env`:

```dotenv
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
```

Do not commit or share the real API secret.

### AI models

Confirm these files exist:

```text
detection/yolov8m-seg.pt
find_my_car_system/backend/models/best.pt
```

## 4. First: start Node/Angular — Terminal 1

```bash
cd "/path/to/AdminSmartPark/admin-web"
npm start -- --port 4300
```

Wait for Angular to compile, then open [http://localhost:4300](http://localhost:4300).

The frontend proxy forwards detector requests to port `5050` and occupancy requests to port `5060`.

## 5. API 1: Parking Occupancy Simulator — Terminal 2

```bash
cd "/path/to/AdminSmartPark"
./.venv/bin/python backend/parking_occupancy.py
```

It runs on `http://localhost:5060`. Verify it with:

```bash
curl http://localhost:5060/health
curl http://localhost:5060/api/parking/occupancy
```

It updates every 60 seconds. To change the interval:

```bash
PARKING_SIM_UPDATE_INTERVAL_SECONDS=30 ./.venv/bin/python backend/parking_occupancy.py
```

## 6. API 2: Parking Detector — Terminal 3

```bash
cd "/path/to/AdminSmartPark"
./.venv/bin/python detection/parking_detector_api.py
```

It runs on `http://localhost:5050`. Verify it with:

```bash
curl http://localhost:5050/health
```

This API handles Cloudinary parking images, YOLO car outlines, multi-car occupancy, the 25% double-parking rule, and Firestore notifications. Restart it after changing Python detector code or model files.

## 7. API 3: Find My Car and OCR — Terminal 4

```bash
cd "/path/to/AdminSmartPark"
./.venv/bin/python find_my_car_system/backend/find_my_car_api.py
```

It runs on `http://127.0.0.1:5002`. Verify it with:

```bash
curl http://127.0.0.1:5002/
```

This API handles Find My Car searches, Cloudinary uploads, number-plate detection, OCR, confirmation before saving, and matching vehicle details with `users`. Initial startup can take longer while EasyOCR and YOLO load.

## 8. Required startup order

1. Node/Angular frontend — port `4300`
2. Parking Occupancy Simulator — port `5060`
3. Parking Detector — port `5050`
4. Find My Car/OCR — port `5002`

| Terminal | Service | Command | Port |
| --- | --- | --- | --- |
| 1 | Angular frontend | `npm start -- --port 4300` inside `admin-web` | 4300 |
| 2 | Occupancy simulator | `./.venv/bin/python backend/parking_occupancy.py` | 5060 |
| 3 | Parking detector | `./.venv/bin/python detection/parking_detector_api.py` | 5050 |
| 4 | Find My Car/OCR | `./.venv/bin/python find_my_car_system/backend/find_my_car_api.py` | 5002 |

## 9. Verify the full system

1. Open `http://localhost:4300` and sign in.
2. Open Parking Spots and confirm occupancy changes.
3. Open Test Parking Detection and choose an image from the left.
4. Click **Test** and confirm all relevant car outlines and spot results appear.
5. Test a double-parking image and confirm one top-right popup and one active Firebase notification per offending car.
6. Open Find My Car and confirm its API status is available.
7. Upload a car image, review the OCR popup, and confirm only when the plate and images are correct.

## 10. Troubleshooting

### Test Detection shows old results or only one car

Restart Terminal 3. The detector runs without automatic Python code reloading.

### Test Detection cannot connect

```bash
curl http://localhost:5050/health
```

### Parking occupancy does not update

```bash
curl http://localhost:5060/health
```

### Find My Car API is unavailable

```bash
curl http://127.0.0.1:5002/
```

### Cloudinary says `Must supply api_key`

Check the `CLOUDINARY_URL` in `find_my_car_system/backend/.env`, then restart the detector and Find My Car APIs.

### Firebase notifications are not created

Confirm `serviceAccountKey.json` belongs to the same Firebase project as the frontend and can write to `notifications`, then restart the detector API.

### A port is already in use

Stop the old process on that port. Run only one instance of each API.

## 11. Stop the system

Press `Ctrl+C` in each of the four terminals.
