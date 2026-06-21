# SmartPark APU - Admin Portal Setup Guide

This guide contains everything your friend needs to run both the **Angular Web Dashboard** and the **Ionic Mobile App**.

## 🛠️ Prerequisites
Before starting, ensure the following are installed on the system:

1.  **Node.js**: v20 or higher (v24.13.0 is recommended).
2.  **Angular CLI**: Install via `npm install -g @angular/cli`.
3.  **Ionic CLI**: Install via `npm install -g @ionic/cli`.

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

---

## 📱 2. Admin Mobile App (Ionic)
The mobile version is optimized for on-the-go alerts and quick spot checks.

### Setup Instructions:
1.  Open your terminal and navigate to the project folder:
    ```bash
    cd "admin-app"
    ```
2.  Install dependencies:
    ```bash
    npm install --legacy-peer-deps
    ```
3.  Run the application in the browser:
    ```bash
    ionic serve --port 4301
    ```
4.  **Access**: Open [http://localhost:4301](http://localhost:4301) (use "Inspect Element" and toggle Device Mode to "Phone").

---

## 🔑 Login Credentials
The portal connects to the live Firebase project. Use the following account to test:
- **Email**: `admin@apu.com`
- **Password**: *(Contact Pavetrantanu for the secure password)*

---

## ⚠️ Important Notes
- **Styling**: If the dashboard or app appears dark, I have force-enabled the **Light Blue Theme** to ensure text is always dark and readable Regardless of system settings.
- **Data Sync**: Both apps sync in real-time. Changes made on the Web Dashboard will reflect instantly on the Mobile App via Firestore.

---

## 🧪 3. Detector API (for "Test Detection" button)

The **Test Detection** button on the Parking Spots page requires a local Python API server to be running.

### Setup & Run:
1. Install dependencies (once):
    ```bash
    pip3 install flask flask-cors
    ```
2. Start the API server from the project root:
    ```bash
    cd "AdminSmartPark"
    python3 detector_api.py
    ```
3. The server runs on **http://localhost:5050**

### How it works:
- Click **"Test Detection"** on the Parking Spots page
- The dialog checks if the API is online (green dot = ready)
- Click **"Run Detection"** — it streams live logs to the terminal UI
- Shows: cars per image, free vs occupied spots, per-spot status
- Results are based on `bounding_box/parking_points.json` + `plate_detector/sample_images/`

> **Note:** The API server must be running whenever you use the Test Detection feature.

