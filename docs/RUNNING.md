# SmartPark APU — Local Development

## Prerequisites

- Node.js 20 or newer with npm
- Python 3.11 or newer
- Firebase Admin service-account JSON for local development
- Cloudinary credentials

## One-time installation

From the repository root:

```bash
npm install
npm --prefix admin-web install --legacy-peer-deps
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

Windows uses `.venv\Scripts\pip` for the last command. The launcher automatically chooses `.venv/bin/python`, `.venv\Scripts\python.exe`, or a Python executable on `PATH`.

## Local configuration

Place the uncommitted Firebase service account at `find_my_car_system/backend/serviceAccountKey.json`.

Copy the Cloudinary example and fill in the real server-side value:

```bash
cp find_my_car_system/backend/.env.example find_my_car_system/backend/.env
```

```dotenv
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
```

Optional server variables are `ALLOWED_ORIGINS`, `PARKING_DATA_SOURCE`, and `PARKING_SIM_TIMEZONE`.

## Start the complete system

Stop any older manually started API processes, then run:

```bash
npm run dev:all
```

| Process | Address |
| --- | --- |
| Angular | `http://localhost:4200` |
| Detector | `http://localhost:5050` |
| Parking/analytics | `http://localhost:5060` |
| Find My Car/ANPR | `http://127.0.0.1:5002` |

Press `Ctrl+C` once to stop all children. If one child fails, the manager stops the other three rather than leaving a partial stack running.

Individual commands remain available:

```bash
npm run api:detector
npm run api:parking
npm run api:anpr
npm --prefix admin-web start
```

## Runtime behaviour

- No simulation runs before an administrator logs in.
- Successful Firebase login checks `admins/{uid}`, obtains a current ID token, initializes the API session, loads dashboard data, and starts a browser-controlled 60-second simulation cycle.
- Logout clears that timer; Angular and Firestore subscriptions are destroyed with the authenticated shell.
- A Firestore transaction skips simulation requests received within 55 seconds of the previous cycle, including another tab.
- YOLO and EasyOCR remain lazy/on-demand and are not invoked by login.
- Occupancy, simulation locks, history, notifications, and pending ANPR confirmation metadata persist in Firestore.
- Uploaded and preview images live in Cloudinary. Production inference uses request-scoped `/tmp` files only.

Angular attaches a freshly obtained Firebase ID token to protected requests. Each Flask API verifies it and confirms that `admins/{uid}.role` is `staff` or `super_admin`.

Public health checks:

```bash
curl http://localhost:5050/health
curl http://localhost:5060/health
curl http://127.0.0.1:5002/
```

Operational endpoints return HTTP 401 without a bearer token.

## Tests

```bash
npm --prefix admin-web exec tsc -- -p tsconfig.app.json --noEmit
npm run test:python
npm run build
```

The production build has been verified with the project's pinned Angular toolchain. Build warnings about the initial bundle budget and jsPDF/canvg CommonJS dependencies are non-blocking.
