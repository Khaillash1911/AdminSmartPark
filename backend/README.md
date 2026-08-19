# Backend services

The application uses three independently started Flask services.

| Service | Entry point | Port | Purpose |
| --- | --- | --- | --- |
| Occupancy | `python -m backend.parking_occupancy` | 5060 | Simulated row/section occupancy |
| Detector | `detection/parking_detector_api.py` | 5050 | Parking-map uploads, YOLO segmentation, violations |
| Find My Car | `find_my_car_system/backend/find_my_car_api.py` | 5002 | Vehicle lookup, image upload, plate OCR |

All Python dependencies are maintained in the root `requirements.txt`. Configuration and startup instructions are in [`docs/RUNNING.md`](../docs/RUNNING.md).

Runtime data is not source code:

- current simulated occupancy is stored in Firestore `parking_simulation/current`;
- simulator snapshots and traffic movements are stored in Firestore `parking_occupancy_history`;
- Find My Car temporary images are recreated under its local upload/static directories;
- permanent shared images are stored in Cloudinary;
- application records and violations are stored in Firebase.
