# SmartPark APU Admin — Complete System Documentation

**Document purpose:** Technical, operational, feature, data-flow, deployment, security, and maintenance reference for the complete SmartPark Admin system.

**Repository:** `AdminSmartPark`
**Primary production host:** Vercel
**Persistent database:** Google Cloud Firestore
**Image storage:** Cloudinary
**Local AI access:** Cloudflare Tunnel
**Last reviewed against the source code:** 20 August 2026

This document describes the implementation in the current repository. Older documents may mention SQLite or earlier page names. The current application uses Firestore for parking state and simulation persistence; SQLite is not part of the active architecture.

## 1. System at a glance

SmartPark APU Admin is a web-based parking administration platform. It combines a hosted Angular dashboard and hosted lightweight Flask API with AI workloads that run on an operator's computer. The browser uses Firebase Authentication, Firestore, and Cloudinary-backed images. Vercel hosts the web application and parking analytics API. YOLO vehicle detection and EasyOCR number-plate recognition remain local because they are heavier workloads; a Cloudflare Tunnel exposes them temporarily to the hosted web application.

The system provides:
- authenticated administrator access;
- live and simulated parking occupancy;
- section and row parking visualization;
- parking-map image upload and bay marking;
- YOLO parking occupancy and double-parking detection;
- OCR number-plate recognition;
- OKU eligibility checking against registered users;
- Find My Car registration and lookup;
- canonical violation storage and resolution;
- real-time user management;
- research-model traffic forecasting;
- analytics graphs and PDF reports;
- pricing configuration; and
- a live indication of whether local AI services are reachable.

### 1.1 High-level topology

```text
Administrator's browser
        |
        +-- Firebase Authentication (identity)
        +-- Firestore (real-time application data)
        +-- Cloudinary CDN (parking and vehicle images)
        |
        +-- Vercel: Angular web service
        |       |
        |       +-- /api/parking/*
        |               |
        |               +-- Vercel: Flask parking service
        |                       +-- Firestore state/history
        |                       +-- scikit-learn research models
        |
        +-- Cloudflare HTTPS tunnel URL from Firestore
                |
                +-- Local AI gateway :8000
                        +-- YOLO detector :5050
                        +-- EasyOCR/ANPR :5002
```

The web application does not contain a fixed public URL for the local computer. `npm run ai:tunnel` obtains a temporary HTTPS URL and publishes it to `system_config/ai_api`. The Angular client reads that document, verifies the URL, checks its health, and uses it only while the local stack is online.

---

## 2. Technology stack

### 2.1 Frontend

| Technology | Purpose |
|---|---|
| Angular 21 | Single-page admin application and routing |
| TypeScript 5.9 | Typed application logic |
| Angular Material/CDK | Dialogs, forms, tables, pagination, navigation and UI controls |
| AngularFire 20 / Firebase JS 12 | Authentication and Firestore access |
| RxJS 7.8 | Subscriptions, HTTP flows and periodic refreshes |
| Chart.js 4 / ng2-charts 10 | Dashboard graphs |
| jsPDF / AutoTable | Downloadable PDF analytics and user-history reports |
| Lucide Angular | Interface icons |

### 2.2 Backend and AI

| Technology | Purpose |
|---|---|
| Python / Flask 3.1 | Parking, detector, ANPR and gateway HTTP APIs |
| Firebase Admin 7.4 | Server-side token validation and Firestore access |
| Google Cloud Firestore client | Transactions, queries, state and history |
| Ultralytics YOLO | Vehicle segmentation and number-plate detection |
| EasyOCR | Number-plate text recognition |
| OpenCV / NumPy | Image decoding, preprocessing and annotation |
| Shapely | Polygon intersection and parking-bay overlap calculations |
| pandas / scikit-learn / joblib | Research preparation, regression models and prediction |
| Cloudinary | Durable image storage and delivery |

### 2.3 Hosting and operations

| Technology | Purpose |
|---|---|
| Vercel Services | Angular frontend and hosted parking API |
| Cloudflare Quick Tunnel | Temporary public HTTPS route to the local AI gateway |
| npm/concurrently | Starts multiple local services |
| Git/GitHub | Version control and Vercel deployment source |

---

## 3. Repository structure

```text
AdminSmartPark/
├── admin-web/                         Angular application
│   └── src/app/
│       ├── core/                      Guards, interceptors and shared services
│       ├── layout/                    Header, sidebar and route shell
│       └── pages/                     Login and admin feature pages
├── backend/
│   ├── ai_gateway.py                  Public tunnel gateway/proxy
│   ├── firestore_client.py            Firebase Admin initialization
│   ├── parking_occupancy.py           Local parking API entry point
│   ├── parking_simulator.py           Occupancy simulation engine
│   ├── research_predictor.py          Model loading and feature generation
│   ├── security.py                    Authentication/CORS helpers
│   ├── routes/parking_routes.py       Parking endpoints
│   └── tests/                         Python unit tests
├── detection/
│   ├── parking_detector_api.py        YOLO parking/double/OKU API
│   └── yolov8m-seg.pt                 Segmentation weights
├── find_my_car_system/backend/
│   ├── find_my_car_api.py             ANPR and Find My Car API
│   ├── plate_recognition.py           OCR pipeline
│   └── models/best.pt                 Number-plate detector weights
├── research/parking-analytics/        Datasets, notebooks/scripts and models
├── scripts/
│   ├── ai-tunnel.mjs                  Local AI/tunnel orchestrator
│   └── run-python.mjs                 Python environment launcher
├── services/parking/main.py           Vercel parking service entry point
├── docs/                              Operational and system documentation
├── package.json                       Workspace commands
├── requirements.txt                   Python dependencies
└── vercel.json                        Vercel services, routes and headers
```

Generated build directories, package dependencies, local virtual environments, private environment files, and credentials must not be committed.

---

## 4. Application routes and navigation

| URL | Displayed feature | Browser title |
|---|---|---|
| `/login` | Administrator login | SmartPark Admin-Login |
| `/admin/dashboard` | Dashboard and analytics | SmartPark Admin-Dashboard |
| `/admin/parking-spots` | Parking Layout | SmartPark Admin-Parking Layout |
| `/admin/find-my-car-test` | Find My Car | SmartPark Admin-Find My Car |
| `/admin/view-data` | User Management | SmartPark Admin-User Management |
| `/admin/notifications` | Violations | SmartPark Admin-Violations |
| `/admin/settings` | Settings | SmartPark Admin-Settings |

The URL names retain a few legacy identifiers, but the visible navigation uses the current product wording. The shared shell includes the side navigation, `Welcome Back`, the administrator role, a compact green `Online` AI indicator, the unresolved-violation badge, and Logout.

Route transitions use delayed skeleton loading. A skeleton appears only when navigation/data loading lasts long enough to be noticeable; quickly loaded pages are displayed immediately.

---

## 5. Identity, authentication and authorization flow

### 5.1 Login flow

1. The administrator enters an email and password on `/login`.
2. Firebase Authentication validates the credentials.
3. The client loads `admins/{firebaseUid}` from Firestore.
4. Access is allowed only when an administrator document exists.
5. Protected Angular routes are enforced by the authentication guard.
6. After login, the client calls the parking session initialization endpoint and starts a 60-second simulation update loop.
7. Logout stops the loop, signs out of Firebase, and returns to Login.

Password reset is handled through Firebase Authentication's password-reset email flow.

### 5.2 API authentication flow

1. The Angular HTTP interceptor obtains a current Firebase ID token.
2. It adds `Authorization: Bearer <token>` to application API calls.
3. Flask verifies the token with Firebase Admin, including revocation checking.
4. The backend loads `admins/{uid}`.
5. The role must be `staff` or `super_admin`.
6. Invalid, expired, missing, or unauthorized tokens receive HTTP 401/403 responses.

Authentication is applied to the hosted parking API and local AI routes. Health endpoints are intentionally public so availability can be checked before login-dependent actions.

### 5.3 Credential responsibilities

- The browser uses Firebase's client configuration. A Firebase web API key identifies the project and is not equivalent to a server private key.
- Python services use `FIREBASE_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS`.
- Service-account JSON and private keys are secrets and must never be placed in source control, client code, logs, or documentation.
- Firestore Security Rules are not stored in this repository. They must be maintained and reviewed in Firebase separately.

---

## 6. Application startup and session lifecycle

### 6.1 Hosted application

Vercel serves the Angular production build. Requests under `/api/parking/*` are rewritten to the Flask parking service; other application routes are returned by the Angular service so SPA navigation works after refresh.

The hosted parking service lazy-loads the simulator and research predictor after an authenticated request. This reduces startup work for health checks but means the first real request after a cold start can be slower.

### 6.2 Local complete development stack

`npm run dev:all` starts:

- Angular development server;
- YOLO detector;
- parking simulation API; and
- ANPR/EasyOCR API.

The gateway can be started separately with `npm run api:gateway`.

### 6.3 Hosted website plus local AI

`npm run ai:tunnel` performs the complete bridge process:

1. starts/checks the YOLO service on port 5050;
2. starts/checks the ANPR service on port 5002;
3. starts/checks the AI gateway on port 8000;
4. requests a Cloudflare Quick Tunnel;
5. waits for the public URL;
6. writes the URL and online status to `system_config/ai_api` in Firestore;
7. keeps checking local service health; and
8. writes offline status during graceful shutdown.

Only one instance should own each port. `Address already in use` means an older process is still running. Quick Tunnels have no uptime guarantee and their URL changes on restart. A named Cloudflare Tunnel is recommended for a stable production-like setup.

### 6.4 Browser AI discovery

The AI runtime service reads `system_config/ai_api` every 15 seconds. It accepts only:

- HTTPS `*.trycloudflare.com` URLs; or
- local HTTP `localhost`/`127.0.0.1` URLs.

It calls `/health` with an eight-second timeout and reports `online`, `degraded`, or `offline`. A gateway may be reachable while one underlying service is unavailable; that state is `degraded`.

---

## 7. Firestore data model

Firestore is the authoritative persistent database. Collection fields can evolve, but the following documents represent the current application contract.

### 7.1 Core collections

| Collection/document | Purpose and important fields |
|---|---|
| `admins/{uid}` | Admin identity, name and role (`staff` or `super_admin`) |
| `users/{uid}` | Registered user: name, email, student ID, plate, model, colour, `is_oku`, `is_flagged`, timestamps |
| `parking_logs/{id}` | Entry/exit sessions, user reference, plate, timestamps, duration/status |
| `find_my_car/{normalizedPlate}` | Confirmed parked vehicle, owner snapshot, generated location, image URLs/hash, confidence and status |
| `parking_maps/{imageName}` | Cloudinary image reference, hash, public ID, marked bay polygons and update time |
| `violations/{violationKey}` | Canonical violation record used by Violations UI and dashboard |
| `notifications/{notificationKey}` | Notification counterpart for detected violations |
| `settings/pricing` | Pricing edited by Settings |
| `settings/config` | Pricing currently read by dashboard revenue calculation |
| `system_config/ai_api` | Tunnel `baseUrl`, status and last update |
| `pending_car_detections/{token}` | Temporary ANPR result awaiting confirmation |

### 7.2 Parking simulation collections

| Collection/document | Purpose |
|---|---|
| `parking_simulation/current` | Latest complete parking state and row values |
| `parking_simulation/control` | Transaction lock/timestamp preventing duplicate simulation ticks |
| `parking_occupancy_history/{id}` | Historical snapshots used for traffic graphs and forecasting |

### 7.3 Violation record shape

A proper violation contains, where available:

- deterministic violation ID/key;
- type: Double Parking or OKU Parking;
- status and resolved boolean;
- detection and resolution timestamps;
- number plate;
- user/owner identity and contact details;
- parking/image source and location;
- reason/details;
- involved bays and overlap percentages;
- read state; and
- action/audit metadata.

The `violations` collection is canonical. The notification badge is derived from unresolved canonical violations, not the number of notification documents.

### 7.4 Persistence policy

- SQLite is not used by the active system.
- Simulation and occupancy history are shared through Firestore, so Vercel instances and browsers see a consistent state.
- Cloudinary stores binary images; Firestore stores their URLs, public IDs, hashes and metadata.
- Temporary in-memory state is used only as a performance convenience and is backed by Firestore where recovery matters.

---

## 8. Parking occupancy and simulation engine

### 8.1 Layout

The simulator models 24 rows across three sections:

- Section A: rows A–F, capacities 40, 42, 42, 44, 44, 45;
- Section B: rows G–Q, primarily capacity 48 with row Q at 50;
- Section C: rows R–X, capacities 45, 45, 48, 48, 48, 48, 50.

Each row records capacity, occupied count, available count, occupancy percentage, entries, exits, and status. Status thresholds are:

- `LOW`: below 50%;
- `MEDIUM`: 50% to below 80%;
- `HIGH`: 80% and above.

### 8.2 Simulation behavior

The engine calculates time-dependent arrival rates, departure rates and target occupancy. It applies mean reversion so values move toward a plausible time-of-day target instead of drifting without limit. Section A is modeled as busier and Section C as lighter. A full row cannot accept more arrivals, and empty rows cannot produce impossible departures.

Every accepted simulation tick updates current row state and writes a history snapshot. A Firestore transaction prevents separate tabs or Vercel instances from advancing the shared simulation more than once within approximately 55 seconds.

Important environment controls include:

- `PARKING_DATA_SOURCE`;
- `PARKING_SIM_UPDATE_INTERVAL_SECONDS`;
- `PARKING_SIM_TIMEZONE` (normally `Asia/Kuala_Lumpur`);
- host/port values for local operation.

### 8.3 Parking API endpoints

All routes below require an authorized administrator token except `/health`.

| Method and route | Function |
|---|---|
| `GET /health` | Lightweight service health |
| `GET /api/parking/occupancy` | Entire current layout and totals |
| `GET /api/parking/occupancy/{section}` | Section occupancy |
| `GET /api/parking/occupancy/{section}/{row}` | Individual row |
| `POST /api/parking/session/initialize` | Initialize/load session state |
| `POST /api/parking/simulate` | Advance simulation when interval permits |
| `POST /api/parking/simulation/update` | Explicit state update flow |
| `POST /api/parking/simulation/reset` | Reset simulation |
| `GET /api/parking/history` | Filtered history with optional section, row and limit |
| `GET /api/parking/traffic?period=week|month` | Aggregated simulated entries/exits |
| `POST /api/parking/analytics/predict` | Research-model forecast |

---

## 9. Dashboard and Live Analytics

The dashboard combines independent sources instead of presenting static fake values. It refreshes approximately every 60 seconds.

### 9.1 Summary values

- **Cars currently parked:** current occupancy API total.
- **Spots available:** current capacity minus occupied, matching Parking Layout.
- **OKU spots available:** intentionally fixed at 2 by the product requirement.
- **Active violations/double parking:** unresolved Firestore violation data.

### 9.2 Charts

| Chart | Source and meaning |
|---|---|
| Live Occupancy by Section | Current section totals from parking API |
| Today vs Tomorrow's Model Forecast | Current/reconstructed daily traffic and research-model prediction |
| Hourly Traffic: Live vs Research Profile | Live history compared with learned hourly baseline |
| Revenue Performance (RM) | Completed parking logs and configured charging formula |
| Vehicle Traffic | Simulation traffic API entries and exits, not fabricated browser values |
| Violations | Firestore OKU, double-parking and resolved totals |

The dashboard period selector supports the current supported reporting periods. The older daily subsection under Live Analytics was removed.

### 9.3 Revenue calculation

Only completed sessions with entry and exit timestamps can produce revenue. The calculation is:

```text
duration hours = max(0, exit - entry)
billable hours = max(0, duration hours - free_hours)
revenue RM     = billable hours × hourly_rate
```

It generates daily totals, a recent seven-day breakdown, a four-week breakdown, and free/paid session counts.

### 9.4 Failure behavior

Dashboard resources load in parallel. When a critical occupancy or Firebase request fails, the UI reports that some live analytics are unavailable. This does not necessarily mean every chart failed; it signals that at least one required source was unavailable, unauthorized, timed out, or returned unexpected data.

### 9.5 PDF reporting

The client uses jsPDF and AutoTable. Reports can include occupancy, timing/traffic, revenue, violations, or an all-sections report. Visible charts are captured for the report, structured data is added as tables, and pages receive report headings and footers. PDF generation is client-side; it does not upload the generated report.

---

## 10. Research analytics and prediction models

### 10.1 Research assets

`research/parking-analytics/` contains the parking datasets, preparation/EDA scripts, comparison work, feature definition, serialized models, and research notes. Hourly and monthly material is retained for repeatability. Runtime model artifacts include separate entry and exit models and `model_features.txt`.

The research compared Linear Regression, Random Forest, and Gradient Boosting. The deployed artifacts currently identify Linear Regression as the selected model. Recorded evaluation values displayed by the application are approximately:

- entry R²: 0.8764;
- exit R²: 0.7672.

These are stored research metrics, not metrics recalculated on each dashboard request.

### 10.2 Prediction preparation

The predictor merges live Firestore/simulation daily traffic with research baseline days. It builds enough recent history for lag and rolling features, using research data to fill missing live history. If the current day is incomplete, it projects a full-day total using the learned cumulative hourly profile.

### 10.3 Model features

The models use these 18 ordered features:

1. Entries
2. Exits
3. Month
4. DayOfWeekNum
5. IsWeekend
6. NetFlow
7. PrevDayEntries
8. PrevDayExits
9. EntryRolling7
10. ExitRolling7
11. EntryRollingStd7
12. EntriesLag7
13. ExitsLag7
14. EntryRolling3
15. ExitRolling3
16. TargetDayOfWeekNum
17. TargetIsWeekend
18. TargetMonth

Feature order must match the serialized models. Renaming, removing or reordering fields without retraining will invalidate predictions.

### 10.4 Output

The prediction endpoint returns tomorrow's predicted entries, exits, net flow, demand category, model/metric metadata, and hourly profile data for visualization. Demand categories use the current thresholds:

- Low: below 580.84 predicted demand;
- Medium: 580.84 to below 2631.20;
- High: 2631.20 and above.

---

## 11. Parking Layout feature

### 11.1 Standard occupancy view

Parking Layout displays Sections A–C, rows A–X, overall totals, section percentages, selected row details, and LOW/MEDIUM/HIGH state. It subscribes to the shared occupancy service and supports manual refresh in addition to background updates.

The values shown here are the source used to align the dashboard's currently parked and available values.

### 11.2 Add Parking map flow

1. Administrator opens **Add Parking**.
2. A JPEG, PNG or WebP image up to 20 MB is selected.
3. The image is uploaded through the detector API.
4. The detector hashes it with SHA-256 and stores/deduplicates it in Cloudinary.
5. The administrator marks each bay using four polygon corners.
6. Bay labels and polygon coordinates are saved in `parking_maps/{imageName}` with the image URL, Cloudinary public ID, hash and update time.
7. The saved map becomes available to the Test Parking Detection dialog in real time.

**Current limitation:** Edit Parking and Delete Parking display “coming soon” alerts. Only Add and Test are implemented workflows.

### 11.3 Test Parking Detection flow

The dialog lists saved map images from Firestore. Selecting an image uses its saved Cloudinary URL and most recent markings; it does not require a second upload.

When detection runs:

1. the browser calls the detector through the AI gateway;
2. the detector downloads/decodes the selected image;
3. YOLO segmentation finds vehicle masks using `yolov8m-seg.pt`;
4. Shapely intersects vehicle masks with each marked polygon;
5. occupancy, overlap and double-parking results are calculated;
6. annotated output and per-image statistics are returned; and
7. qualifying violations are persisted to Firestore.

Current main thresholds:

- YOLO car class: 2;
- confidence: approximately 0.40;
- inference size: 1280;
- vehicle ignored when less than 3% of its mask intersects the marked area;
- double parking when a vehicle occupies at least two bays with at least 25% of each relevant marked footprint.

One vehicle contained in one bay is normal occupancy, not double parking.

---

## 12. Double-parking violation flow

1. Parking detection identifies one vehicle significantly overlapping two or more marked bays.
2. The detector attempts to associate a readable plate and owner where data is available.
3. A deterministic key is built from the source image, vehicle index/location, plate and bounding information.
4. A Firestore batch writes corresponding records to `notifications` and `violations`.
5. If the same active violation already exists, it is not duplicated.
6. If it was resolved and later genuinely recurs, the paired records can be reopened.
7. The real-time Violations page shows it as unresolved.
8. Resolving it updates both canonical and notification records.

This dual-write design ensures detection notifications and the management table remain synchronized. The canonical `violations` record is required for the tab and navbar badge; a notification alone is insufficient.

---

## 13. OKU parking eligibility flow

The OKU test uses the currently selected saved parking-map image. It does not ask for another upload and does not store a new UI copy of the test image.

1. Administrator selects the OKU-bay map and clicks **Test OKU Bay Image**.
2. The detector verifies the selected saved image and sends it through the OCR/plate pipeline.
3. Plate text is normalized to remove formatting differences.
4. Firestore `users` is searched by normalized registered car plate.
5. The user's explicit `is_oku` value is evaluated.
6. If `is_oku === true`, no violation is created.
7. If `is_oku === false`, an OKU Parking violation and notification are created.
8. If no matching user exists or the field is absent/ambiguous, the fail-safe does not accuse the driver.

When duplicate user results exist, an OKU-eligible (`true`) match takes precedence to avoid a false violation. The violation key includes the plate and image digest to prevent repeated clicks from creating duplicate active records.

The eligibility decision must never rely on a truthy/falsy string conversion. It intentionally triggers only on an authoritative explicit boolean `false`.

---

## 14. Find My Car and ANPR

### 14.1 Components

The ANPR service uses a plate-detection YOLO model at `find_my_car_system/backend/models/best.pt` and EasyOCR on CPU. Models and OCR readers are loaded lazily to reduce initial process startup cost.

### 14.2 Add car from image

1. The page checks AI runtime health; Add Car Image is disabled while ANPR is offline.
2. Administrator uploads a supported car image.
3. The ANPR service hashes the image and rejects a previously confirmed duplicate image.
4. YOLO detects candidate number-plate regions.
5. OCR runs multiple preprocessing variants such as grayscale, denoising and thresholding.
6. Candidate text is cleaned and scored; the best plate is selected.
7. The normalized plate is checked against `users`.
8. A pending detection is returned with preview, confidence, user match and confirmation token.
9. Pending metadata is stored in `pending_car_detections` and temporary image storage so confirmation can survive a process change.
10. The administrator verifies/enters missing information and confirms.
11. The final image is stored in Cloudinary and `find_my_car/{normalizedPlate}` is written.
12. Temporary records and artifacts are cleaned up.

Registered user data is authoritative when a plate matches a user. For an unmatched vehicle, the confirmation workflow requires the administrator to supply the necessary owner/vehicle data.

### 14.3 Location assignment

The current Find My Car location is simulated rather than derived from a camera-to-bay mapping. Confirmation generates one internally consistent assignment:

- zone A, B or C;
- level 1–5;
- row 1–20; and
- slot in the format `A01-01`.

This is a known modeling limitation: it demonstrates the workflow but is not physical localization from the parking detector.

### 14.4 Search flow

1. Administrator types or selects a plate.
2. Text is normalized.
3. The ANPR API queries `find_my_car/{normalizedPlate}`.
4. If the car is present/parked, owner, vehicle, location, image and timestamps are returned.
5. If no current record exists, the UI presents a not-found state.

### 14.5 ANPR API surface

| Method and route | Purpose |
|---|---|
| `GET /` | ANPR service health |
| `POST /detect-plate` | Upload and recognize plate |
| `GET /registered-user/{plate}` | Find authoritative registered user |
| `POST /confirm-car` | Confirm pending detection and park car |
| `GET /find-car/{plate}` | Retrieve parked car |
| `GET /find_car/{plate}` | Legacy compatible lookup alias |
| `GET /sample-plates` | Sample/search helper values |

---

## 15. User Management

User Management subscribes to the Firestore `users` collection with a real-time listener. Creation or database changes appear automatically; there is intentionally no Reload Users button.

The table supports:

- name, student ID, plate, model, colour, email and OKU status;
- search by name, student ID or number plate;
- sorting and pagination;
- opening user details/history;
- flagging/unflagging a user through `is_flagged`; and
- exporting up to 50 parking-history records to PDF.

History is loaded from `parking_logs` by `user_id`.

**Scope clarification:** this repository consumes and manages user records but does not contain the main end-user registration application. Any duplicate email/user/number-plate prevention in that separate registration client or backend must be audited there as well. Firestore Security Rules or a transactional registration backend should enforce uniqueness server-side; a UI-only check is not sufficient.

---

## 16. Violations management

The Violations page uses a real-time listener on the canonical `violations` collection.

It provides:

- all, active, resolved, Double Parking and OKU Parking filters;
- text search;
- sorting and pagination;
- date, status, type, plate, user, location and details columns;
- resolution actions; and
- live synchronization with the dashboard and navbar badge.

Resolving a violation writes `resolved=true`, `is_read=true`, `status='resolved'` and resolution metadata to both `violations` and `notifications`. Resolved events remain historical records and are therefore included in the resolved series of the dashboard graph. They are excluded only from active counts and the badge.

---

## 17. Settings

The current Settings page loads and saves `free_hours` and `hourly_rate`. The default fallback is one free hour and RM1.00 per billable hour.

Known implementation gaps:

1. Settings writes `settings/pricing`, but `RevenueService` currently reads `settings/config`. Until these paths are unified, a saved setting may not change dashboard revenue.
2. `updated_by` is currently written as `placeholder_admin_id` instead of the authenticated UID.
3. The revenue calculator does not currently contain a specific `is_oku` free-parking exception.

These items should be fixed before treating Settings as an authoritative billing configuration interface.

---

## 18. AI gateway and Cloudflare boundary

The gateway is the only service intended to face the Cloudflare Tunnel. YOLO and OCR remain bound behind it.

The gateway:

- reports combined YOLO/OCR health;
- verifies Firebase administrator tokens for protected routes;
- proxies detector and ANPR requests;
- preserves required authorization, content, accept and origin headers;
- applies request-size and inference-time limits;
- provides compatibility aliases under `/detector-api/*` and `/anpr-api/*`; and
- safely retrieves Cloudinary images for OCR-related routes.

Cloudinary downloads are restricted to HTTPS, validated hosts/cloud name, accepted image content types, maximum size, and no redirect following. These checks reduce server-side request forgery and oversized/unexpected upload risk.

Typical inference timeout is longer than ordinary web requests because YOLO/EasyOCR can be slow on CPU. Vercel does not execute these AI models; the tunnel routes the request to the operator computer.

---

## 19. Cloudinary image lifecycle

### 19.1 Parking maps

- Image is validated and hashed.
- Existing hash can be reused to avoid duplicate storage.
- Cloudinary stores the source.
- Firestore stores URL/public ID/hash and polygon data.

### 19.2 Find My Car

- Incoming detection image is temporarily held while awaiting confirmation.
- A SHA-256 check prevents registering the same confirmed image twice.
- Confirmed images are stored in their durable Cloudinary location.
- Firestore contains references, not the binary file.
- Rejected/expired pending artifacts should be cleaned up.

### 19.3 OKU test

The selected existing parking-map image is processed. The test does not create another UI image record merely because the button was clicked.

---

## 20. Security controls

### 20.1 Implemented controls

- Firebase email/password authentication.
- Server-side Firebase ID-token verification and role validation.
- Revocation-aware verification.
- Exact/trusted CORS origin handling rather than unrestricted production origins.
- Content Security Policy response header.
- `X-Frame-Options: DENY` anti-clickjacking protection.
- `X-Content-Type-Options: nosniff`.
- restrictive referrer and permissions policies.
- HTTPS production traffic.
- file type and size validation.
- Cloudinary download allowlisting and redirect prevention.
- deterministic duplicate violation handling.
- explicit boolean OKU eligibility decision.
- Firestore transaction protection for simulation ticks.
- secrets kept in environment variables and ignored credential files.

### 20.2 ZAP report interpretation

The response headers were added to reduce reported CSP, clickjacking, content sniffing and cross-domain findings. Unix timestamps embedded in generated JavaScript are generally disclosure/informational findings rather than credentials. Cache-related informational findings require endpoint-specific review; static hashed assets should be cached, while authenticated/dynamic responses should not be publicly cached.

### 20.3 Required external controls

- Review and test Firestore Security Rules in Firebase.
- Restrict Firebase authorized domains.
- Rotate any credential that was exposed in a terminal, screenshot, chat or commit.
- Prefer a named Cloudflare Tunnel with access policies for long-term use.
- Enable Vercel/Cloudflare rate limiting where practical.
- Keep dependencies and model libraries updated after compatibility testing.
- Never expose local YOLO/OCR ports directly to the public internet.

---

## 21. Configuration and environment variables

Use `.env.example` files as the name-level reference. Never copy secret values into documentation or Git.

Common configuration groups are:

### Firebase server

- `FIREBASE_SERVICE_ACCOUNT_JSON`: complete service-account JSON stored as an environment value; or
- `GOOGLE_APPLICATION_CREDENTIALS`: local path to a private service-account file.

### Cloudinary

- `CLOUDINARY_URL`; and/or
- cloud name/API credentials required by the Python service;
- `CLOUDINARY_CLOUD_NAME` where host validation needs it.

### Parking

- `PARKING_DATA_SOURCE`;
- `PARKING_SIM_UPDATE_INTERVAL_SECONDS`;
- `PARKING_SIM_TIMEZONE`;
- port/host settings when running locally.

### AI gateway/tunnel

- gateway port and internal YOLO/OCR URLs when defaults are changed;
- allowed origins including the production Vercel origin.

Production server secrets belong in Vercel Environment Variables for the service that needs them. Local AI secrets belong in the root/local `.env`, never in `admin-web/src`.

---

## 22. Installation and commands

### 22.1 Prerequisites

- supported Node.js and npm;
- Python with virtual environment support;
- Cloudflare `cloudflared` for tunnel operation;
- Firebase project/client configuration;
- Firebase Admin service credentials;
- Cloudinary account credentials; and
- sufficient RAM/disk for YOLO, EasyOCR and their model weights.

### 22.2 Install

```bash
npm install
npm --prefix admin-web install --legacy-peer-deps
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

The repository launcher looks for an appropriate Python interpreter. Keep only one consistent virtual environment for predictable dependency resolution.

### 22.3 Common commands

```bash
npm run dev:all          # Angular + detector + parking + ANPR
npm run api:detector     # YOLO detector only
npm run api:parking      # parking API only
npm run api:anpr         # ANPR only
npm run api:gateway      # gateway only
npm run ai:tunnel        # local AI stack plus Cloudflare URL publication
npm run build            # Angular production build
npm run test:python      # parking simulator/backend unit tests
```

For the hosted Vercel site, the usual operator action is only `npm run ai:tunnel`; Vercel already hosts the browser app and parking API.

---

## 23. Vercel deployment

The repository uses Vercel Services:

- `web` builds `admin-web` and serves `dist/admin-web/browser`;
- `parking` runs `services.parking.main:app` with the required research assets included;
- rewrites send `/api/parking/*` to the parking service; and
- all Angular application routes fall back to the web output.

Pushing to the Git branch connected to Vercel creates a deployment. A production deployment must contain the required environment variables. Heavy YOLO/EasyOCR dependencies are intentionally not part of the Vercel function path.

See also:

- `docs/VERCEL.md`
- `docs/AI_TUNNEL.md`
- `docs/RUNNING.md`
- `docs/LLM_VERCEL_SETUP.md`

---

## 24. Testing and verification

### 24.1 Automated tests currently present

- parking simulator behavior and routes;
- OKU logic requiring explicit `is_oku=false`;
- AI gateway health, authorization/CORS and unavailable-upstream behavior;
- Angular build/type compilation.

### 24.2 Recommended release checks

1. Clean install succeeds.
2. Angular production build succeeds.
3. Python unit tests succeed.
4. Vercel `/health` and authenticated parking requests succeed.
5. Login succeeds for admin and rejects a normal user.
6. Dashboard and Parking Layout totals match.
7. Simulation updates only once per interval across two tabs.
8. User Management reflects a Firestore change without reload.
9. `npm run ai:tunnel` marks Firestore online and the header changes to Online.
10. Find My Car upload, OCR, confirmation and search complete.
11. Normal single-bay parking creates no double violation.
12. Double parking creates one active canonical violation and notification.
13. Repeating the same detection does not duplicate it.
14. Resolving updates the table, graph and navbar badge.
15. An OKU user produces no OKU violation.
16. An explicit non-OKU user produces one OKU violation.
17. Unknown/ambiguous plate fails safely without accusation.
18. PDF report downloads and contains expected sections.
19. Security headers are visible on HTML and API responses.

The repository does not currently contain a complete browser end-to-end test suite. Manual release verification remains important.

---

## 25. Troubleshooting guide

### `401 OK` or login/session initialization fails

- Inspect the response body, not the reason phrase.
- Confirm the browser sent a fresh Firebase ID token.
- Confirm `admins/{uid}` exists and has an allowed role.
- Confirm the deployed service has valid Firebase Admin credentials.
- Check system clock, token expiry, Firebase project mismatch and authorized domains.

### Header says Online but a feature says API offline

- Gateway health can be temporarily stale for up to the refresh interval.
- Check the gateway `/health` result for separate YOLO and OCR status.
- Confirm the feature uses the current Firestore tunnel URL.
- Confirm the old tunnel process did not terminate and publish offline.
- Check browser console/network for CORS, 401, timeout or CSP errors.

### `Address already in use` on 5050, 5002 or 8000

An old local service owns the port. Stop that exact process before starting `ai:tunnel` again. Do not launch multiple tunnel stacks concurrently.

### Parking occupancy works but YOLO/OCR does not

Parking occupancy is hosted on Vercel; AI runs on the local computer. Verify local model processes, gateway health, Cloudflare URL, Firebase `system_config/ai_api`, authorization headers and accepted image type/size.

### `Load failed` for a saved Cloudinary image

Verify the stored URL is valid HTTPS, the asset still exists, the configured cloud name matches, the gateway permits the host, and CSP allows that image/connect origin.

### Analytics unavailable

Check the parking API and Firestore independently. A failed request within the combined dashboard refresh can show the generic warning even if other cards still contain cached/valid data.

### Violation notification exists but Violations is empty

Check for the paired document in `violations`. The management UI intentionally reads the canonical collection. Also check status/resolved filters and Firestore listener permission.

### Settings changed but revenue did not

This is the documented `settings/pricing` versus `settings/config` path mismatch. Unify the path in code/data before relying on the new value.

---

## 26. Known limitations and technical debt

1. Parking Layout Edit and Delete are placeholders.
2. Settings and Revenue use different Firestore pricing document paths.
3. Settings writes a placeholder updater ID.
4. Find My Car assigns a simulated location, not camera-derived physical location.
5. Quick Tunnel URLs are temporary and have no uptime guarantee.
6. AI availability depends on the operator computer, network, tunnel and local model processes.
7. EasyOCR on CPU may be slow, especially on first lazy load.
8. Firestore Security Rules are external and cannot be verified from this repository.
9. Main end-user registration/uniqueness enforcement is outside this admin repository.
10. Revenue does not currently implement a specific OKU charging exception.
11. Research evaluation metrics are stored results, not continuously recalculated validation.
12. Complete browser end-to-end coverage is not yet present.
13. Older `docs/ARCHITECTURE.md` references should be treated as historical where they conflict with this document, especially SQLite.

---

## 27. Safe maintenance rules

- Preserve Firestore field names used by both Python and Angular.
- Perform multi-document violation changes with a batch.
- Use normalized number plates consistently for lookup and document IDs.
- Treat missing OKU status as unknown, not non-OKU.
- Keep model feature order synchronized with the serialized artifacts.
- Do not put YOLO/EasyOCR into the Vercel web function without redesigning size, memory and timeout constraints.
- Do not hard-code a temporary tunnel URL in Angular.
- Do not store private Firebase Admin credentials in frontend environment files.
- Do not remove historical resolved violations merely to clear the active badge.
- When changing capacity/layout, update simulator definitions, UI assumptions, tests and documentation together.
- When changing Firestore schema, migrate existing documents or implement backward-compatible reads.
- Re-run build, Python tests and the manual critical-flow checklist before deployment.

---

## 28. End-to-end flow summaries

### A. Normal administrator session

```text
Login -> Firebase Auth -> admins role check -> initialize parking session
      -> load Firestore + parking API -> render dashboard -> refresh every 60 s
      -> logout -> stop simulation timer -> Firebase sign-out
```

### B. Parking simulation to analytics

```text
Session timer -> authenticated /simulate -> Firestore transaction guard
              -> update parking_simulation/current
              -> append parking_occupancy_history
              -> Parking Layout/dashboard refresh
              -> traffic aggregation + research prediction + charts/PDF
```

### C. Double-parking detection

```text
Saved Cloudinary map + Firestore polygons -> tunnel -> gateway -> YOLO
-> vehicle/bay intersection -> double-parking threshold
-> Firestore batch: notification + canonical violation
-> real-time Violations table/dashboard/badge -> resolve both records
```

### D. OKU test

```text
Selected existing OKU image -> gateway -> OCR -> normalize plate
-> query users -> is_oku === true: no violation
               -> is_oku === false: notification + violation
               -> unknown/missing: fail safe, no violation
```

### E. Find My Car

```text
Car image -> duplicate hash check -> YOLO plate crop -> EasyOCR variants
-> best normalized plate -> registered-user match -> pending token
-> administrator confirms -> Cloudinary + find_my_car Firestore record
-> plate search -> owner/image/generated parking location displayed
```

### F. Local AI availability

```text
npm run ai:tunnel -> start three local APIs -> health checks
-> Cloudflare URL -> system_config/ai_api online
-> Angular polls every 15 s -> Online/degraded/offline UI
-> process shutdown -> Firestore offline
```

---

## 29. Ownership of truth

When values disagree, use this hierarchy:

| Information | Authoritative source |
|---|---|
| Admin identity/session | Firebase Authentication + `admins` |
| Registered user and OKU eligibility | `users` |
| Current parking occupancy | `parking_simulation/current` via parking API |
| Occupancy/traffic history | `parking_occupancy_history` |
| Saved maps and polygons | `parking_maps` |
| Active/resolved violation state | `violations` |
| Notification delivery record | `notifications` |
| Confirmed car location record | `find_my_car` |
| AI public endpoint/status | `system_config/ai_api` plus live gateway health |
| Parking images | Cloudinary, referenced by Firestore |
| Forecast behavior | serialized research models + ordered feature contract |

This separation explains why the dashboard, Parking Layout, Violations, User Management and AI indicator can update independently while still sharing a consistent underlying system.

---

## 30. Final operational summary

The always-hosted portion is Angular, the authenticated parking/simulation API, Firestore and Cloudinary. The compute-heavy portion is YOLO and EasyOCR on the operator's computer. Cloudflare connects those local services to the hosted site, and Firestore advertises the current tunnel URL. Firebase provides identity and the server verifies every protected call. Firestore holds all active state and history; Cloudinary holds images; research artifacts turn traffic history into tomorrow forecasts. Real-time listeners and scheduled refreshes keep administrative pages synchronized.

For normal operation:

1. keep the Vercel deployment and Firebase/Cloudinary configuration valid;
2. run `npm run ai:tunnel` whenever AI features are required;
3. verify the header is Online and gateway health reports both YOLO and OCR ready;
4. monitor Firestore canonical collections, particularly `violations`, `parking_simulation/current`, and `system_config/ai_api`; and
5. use the known-limitations section as the prioritized maintenance backlog.
