## Running the SmartPark System

The SmartPark administration website is hosted on Vercel:

https://smartpark-admin-nine.vercel.app/login

The dashboard is available online, but its YOLO vehicle detection, double-parking detection, and licence-plate recognition features run from the demonstration laptop. Therefore, the local AI tunnel must be started before using these features.

### One-Time Setup

From the root directory of the SmartPark project, install the required dependencies:

```bash
brew install cloudflared
python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
npm install
```

Ensure that the project `.env` file and Firebase service-account credentials are configured. These files contain sensitive information and must not be committed to GitHub.

### 1. Start the AI Services and Tunnel

Open a terminal in the root directory of the SmartPark project and run:

```bash
npm run ai:tunnel
```

This command starts:

- YOLO parking and double-parking detection on port `5050`;
- EasyOCR and licence-plate recognition on port `5002`;
- the authenticated AI gateway on port `8000`;
- a Cloudflare Quick Tunnel that connects the hosted website to the laptop.

Wait until the terminal displays output similar to:

```text
[YOLO] Running on http://127.0.0.1:5050
[OCR] Running on http://127.0.0.1:5002
[GATEWAY] Running on http://127.0.0.1:8000

SMARTPARK AI PUBLIC URL: https://random-name.trycloudflare.com
Firestore system_config/ai_api marked online
```

Keep this terminal open while using the system. Closing it will disconnect the hosted website from the local AI services.

### 2. Open the SmartPark Website

After the AI tunnel reports that it is online, open:

https://smartpark-admin-nine.vercel.app/login

### 3. Sign In

Use the demonstration administrator account:

| Field | Value |
|---|---|
| Email | Provided separately |
| Password | Provided separately |

Never publish demonstration credentials in this repository. Share them through a private channel and rotate them after demonstrations.

Select **Sign In** to access the SmartPark administration dashboard.

### 4. Verify the Connection

After signing in, confirm that the AI service status is shown as **Online**. You can then use features including:

- parking occupancy monitoring;
- vehicle and parking-space detection;
- double-parking detection;
- parking-map marking;
- licence-plate recognition;
- Find My Car;
- violations and notifications;
- parking analytics and demand prediction.

The first AI request may take longer because the YOLO and EasyOCR models are loaded when they are first used.

### 5. Stop the System

When the demonstration is complete, return to the terminal running the tunnel and press:

```text
Ctrl+C
```

This stops the local YOLO, OCR, gateway, and Cloudflare Tunnel processes. The hosted dashboard will remain accessible, but laptop-dependent AI features will be offline.

### Important Requirements

For the AI features to operate:

- the demonstration laptop must remain switched on;
- the laptop must have an active internet connection;
- `npm run ai:tunnel` must remain running;
- Firebase and Cloudinary credentials must be configured;
- the terminal must report that the AI runtime is online.
