# SmartPark architecture

## Components

### Angular administration dashboard

`admin-web/` provides authentication, dashboard analytics, user management, parking occupancy, parking-map marking/testing, Find My Car, and the live violations feed.

It connects directly to Firebase for application data. During local development, Angular proxies `/detector-api` to port 5050 and `/api/parking` to port 5060. Find My Car calls port 5002 directly.

### Parking occupancy API

`backend/parking_occupancy.py` exposes simulated section and row occupancy on port 5060. A background scheduler updates a mean-reverting model and stores local history in a disposable SQLite database.

### Parking detector API

`detection/parking_detector_api.py` runs on port 5050 and uses `yolov8m-seg.pt`.

1. Parking images are stored in Cloudinary.
2. Parking polygons are stored in Firestore `parking_maps` documents.
3. YOLO returns a segmentation outline for every relevant car.
4. Each car is matched independently to marked spots.
5. A car is double parked when more than 25% of its marked-area footprint lies in each of at least two spots.
6. Each offending car produces one active Firestore `notifications` document; an active duplicate is not created, while a resolved recurring offence is reopened.

### Find My Car API

`find_my_car_system/backend/find_my_car_api.py` runs on port 5002. It uploads source/result images to Cloudinary, detects number plates with the custom `models/best.pt`, applies OCR preprocessing, matches registered users, asks the administrator to confirm the result, and only then writes the vehicle record to Firebase.

## Storage responsibilities

| Data | Storage |
| --- | --- |
| Users, vehicle records, parking maps, notifications | Firebase Firestore |
| Shared parking/car/plate/result images | Cloudinary |
| Occupancy simulation history | Local disposable SQLite database |
| Temporary API uploads and caches | Local ignored directories |
| Secrets | Local ignored `.env` and `serviceAccountKey.json` |

## Runtime flow

```text
Browser (Angular :4300)
  ├── Firebase Firestore
  ├── Occupancy API :5060
  ├── Detector API :5050 ── YOLO segmentation ── Cloudinary/Firebase
  └── Find My Car API :5002 ── plate YOLO + OCR ── Cloudinary/Firebase
```

## Research boundary

Offline parking analytics live under `research/parking-analytics/`. They are intentionally separated from runtime services and are not required to start the application.
