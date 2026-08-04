# SmartPark APU - Admin Portal Setup Guide

This guide contains everything your friend needs to run the **Angular Web Dashboard**, local detector API, and mock parking occupancy simulator.

## 🛠️ Prerequisites
Before starting, ensure the following are installed on the system:

1.  **Node.js**: v20 or higher (v24.13.0 is recommended).
2.  **Angular CLI**: Install via `npm install -g @angular/cli`.

---

## 🌐 1. Admin Web Dashboard
The web dashboard is designed for desktop monitoring and extensive user management.

### Setup Instructions:
1.  Open your terminal and navigate to the project folder:
    ```bash
    cd "admin-web"
    ```
2.  Install dependencies (ignore peer dependency warnings):
    ```bash
    npm install --legacy-peer-deps
    ```
3.  Run the application locally:
    ```bash
    ng serve --port 4300
    ```
4.  **Access**: Open [http://localhost:4300](http://localhost:4300) in your browser.

Username: admin1@apu.com
Password: admin123

## 🔑 Login Credentials
The portal connects to the live Firebase project. Use the following account to test:
- **Email**: `admin@apu.com`
- **Password**: *(Contact Pavetrantanu for the secure password)*

---

## ⚠️ Important Notes
- **Styling**: If the dashboard appears dark, I have force-enabled the **Light Blue Theme** to ensure text is always dark and readable regardless of system settings.
- **Data Sync**: The dashboard syncs in real-time with Firestore.

---

## 🧪 2. Detector API (for "Test Detection" button)

The **Test Detection** button on the Parking Spots page requires a local Python API server to be running.

### Setup & Run:
1. Install dependencies (once):
    ```bash
    pip3 install flask flask-cors
    ```
2. Start the API server from the project root:
    ```bash
    cd "AdminSmartPark"
    .venv/bin/python detection/parking_detector_api.py
    ```
3. The server runs on **http://localhost:5050**

### How it works:
- Click **"Test Detection"** on the Parking Spots page
- The dialog checks if the API is online (green dot = ready)
- Click **"Run Detection"** — it streams live logs to the terminal UI
- Shows: cars per image, free vs occupied spots, per-spot status
- Detects cars outside the marked parking polygons as **double parking**
- Sends double parking records to Firestore `notifications`, which updates the **Live Violations Feed**
- Results are based on `bounding_box/parking_points.json` + `detection/sample_images/`

> **Note:** The API server must be running whenever you use the Test Detection feature.
> Double parking notifications require `find_my_car_system/backend/serviceAccountKey.json`.

---

## 🅿️ 3. Parking Occupancy Simulator API

The Parking Spots page uses a development simulator for live-looking row-level occupancy data.

### Setup & Run:
1. Install dependencies:
    ```bash
    .venv/bin/pip install -r backend/requirements.txt
    ```
2. Start the simulator from the project root:
    ```bash
    .venv/bin/python backend/app.py
    ```
3. The server runs on **http://localhost:5060**

### API Endpoints:
- `GET /api/parking/occupancy`
- `GET /api/parking/occupancy/<section>`
- `GET /api/parking/occupancy/<section>/<row>`
- `POST /api/parking/simulation/reset`
- `POST /api/parking/simulation/update`
- `GET /api/parking/history?section=A&row=B&limit=100`

Every response is marked with:
```json
"source": "SIMULATION"
```

### Update Interval:
The simulator updates automatically every 60 seconds. To change it:
```bash
PARKING_SIM_UPDATE_INTERVAL_SECONDS=30 .venv/bin/python backend/app.py
```

### Future Live Camera Replacement:
Keep the same `/api/parking/...` response structure and only change:
```json
"source": "LIVE_CAMERA"
```
