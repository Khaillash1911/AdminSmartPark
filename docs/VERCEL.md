# Vercel Hobby deployment

The root `vercel.json` deploys only two Services:

| Public route | Service |
| --- | --- |
| `/` | Angular dashboard in `admin-web` |
| `/api/parking/*` | Lightweight request-driven parking API |

YOLO, PyTorch, Ultralytics, EasyOCR, OpenCV inference, and model weights are not deployed to Vercel. They remain on the demonstration laptop and are reached through `system_config/ai_api`; see [Local AI Quick Tunnel](AI_TUNNEL.md).

## Required Vercel variables

```text
FIREBASE_SERVICE_ACCOUNT_JSON=<complete service-account JSON>
PARKING_DATA_SOURCE=SIMULATION
PARKING_SIM_TIMEZONE=Asia/Kuala_Lumpur
```

Never put Firebase Admin or Cloudinary secrets into Angular environment files.

## Deployment

1. Import the repository using its root as the Vercel project root.
2. Select **Services** as the Framework Preset.
3. Add the variables above to Preview and Production.
4. Deploy a Preview and verify Angular login, parking initialization, and one simulation cycle.
5. Add the final Vercel origin to the laptop's `ALLOWED_ORIGINS` value.
6. Start `npm run ai:tunnel` locally and verify the Angular AI status and one controlled inference.

Deploying is intentionally left as a manual action.

## Persistent state

- `parking_simulation/current`: summarized current rows.
- `parking_simulation/control`: cross-tab timestamp lock.
- `parking_occupancy_history`: summarized movement history.
- `system_config/ai_api`: ephemeral AI gateway URL and status.
- `pending_car_detections`: ANPR confirmation state.
- Cloudinary: source, preview, crop, and confirmed images.

No hosted endpoint depends on SQLite, a permanent process, a fixed port, or durable process memory.
