# LLM Instructions: Set Up SmartPark on Vercel

Inspect the repository before making changes. The root `vercel.json` is already configured with Vercel Services. Do not replace the existing architecture or deploy the local AI models to Vercel.

## Intended deployment

Deploy only:

- The Angular dashboard from `admin-web/` at `/`.
- The lightweight Python parking API from `services/parking/main.py` at `/api/parking`.

Do not deploy PyTorch, Ultralytics, EasyOCR, OpenCV inference, `detection/yolov8m-seg.pt`, or `find_my_car_system/backend/models/best.pt`. YOLO and ANPR run on the owner's laptop through a Cloudflare Quick Tunnel. Angular discovers that URL from the Firestore document `system_config/ai_api`.

## Vercel setup

1. Import the GitHub repository into Vercel using the repository root as the project root.
2. Select the **Services** framework preset because `vercel.json` uses `experimentalServices`.
3. Keep the existing `vercel.json`; confirm it contains only the `web` and `parking` services.
4. Add these server-side Vercel environment variables for Preview and Production:

```text
FIREBASE_SERVICE_ACCOUNT_JSON=<complete Firebase service-account JSON>
PARKING_DATA_SOURCE=SIMULATION
PARKING_SIM_TIMEZONE=Asia/Kuala_Lumpur
```

5. Never place Firebase Admin credentials, Cloudinary secrets, or user tokens in Angular environment files or variables exposed to the browser.
6. Create a Preview deployment first. Verify Angular login, administrator-role checks, dashboard loading, parking initialization, and `/api/parking/occupancy`.
7. Promote the verified Preview to Production. Do not deploy automatically without the owner's approval.
8. Give the owner the final production origin, such as `https://project.vercel.app`, so it can be added to the laptop's local `ALLOWED_ORIGINS` value.

## Firebase requirement

Firestore Security Rules must allow authenticated administrators to read `system_config/ai_api`, but browser clients must not be allowed to write it. The trusted local launcher updates that document using Firebase Admin.

## After Vercel deployment

On the owner's Mac, the local AI system is started separately:

```bash
brew install cloudflared
npm run ai:tunnel
```

The launcher writes the generated `https://...trycloudflare.com` address to `system_config/ai_api`. A new Vercel deployment is not required when this tunnel URL changes.

Verify that the dashboard remains functional when AI is offline, and that AI requests work only when the laptop tunnel is online. Do not claim deployment success until the Vercel deployment, `/api/parking` endpoint, Firestore runtime document read, and public tunnel health check have actually been tested.
