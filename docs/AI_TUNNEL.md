# Local AI tunnel

YOLO and EasyOCR run only on the demonstration laptop. Vercel hosts Angular and the lightweight parking API; it does not package PyTorch, Ultralytics, EasyOCR, or either model file.

## Prepare once on macOS

```bash
brew install cloudflared
python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
npm install
```

Copy `.env.example` to `.env` and fill in local values. Never commit `.env` or a service-account JSON file. `ALLOWED_ORIGINS` must include the exact Vercel production origin. Firebase Admin can use the existing default service-account location or `GOOGLE_APPLICATION_CREDENTIALS`.

## Start

```bash
npm run ai:tunnel
```

The launcher starts YOLO on `127.0.0.1:5050`, ANPR on `127.0.0.1:5002`, the authenticated gateway on `127.0.0.1:8000`, and a Quick Tunnel pointing only at the gateway.

After health checks pass, it prints the generated HTTPS URL and writes exactly `system_config/ai_api` through Firebase Admin:

```json
{
  "baseUrl": "https://random-name.trycloudflare.com",
  "status": "online",
  "updatedAt": "<server timestamp>"
}
```

Angular reads this document after administrator login, validates the Quick Tunnel origin, checks `/health`, and uses the origin only for AI calls. The rest of the dashboard continues working while AI is offline.

Expected output:

```text
[YOLO] ... Running on http://127.0.0.1:5050
[OCR] ... Running on http://127.0.0.1:5002
[GATEWAY] ... Running on http://127.0.0.1:8000
========================================================================
SMARTPARK AI PUBLIC URL: https://random-name.trycloudflare.com
Local gateway: http://127.0.0.1:8000
========================================================================
Firestore system_config/ai_api marked online
```

## Test

Health does not run inference:

```bash
curl http://127.0.0.1:8000/health
curl https://YOUR-TUNNEL.trycloudflare.com/health
```

YOLO, using a current administrator Firebase ID token:

```bash
curl -X POST https://YOUR-TUNNEL.trycloudflare.com/api/detection/parking \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"image_url":"https://res.cloudinary.com/YOUR_CLOUD/image/upload/example.jpg","parking_spots":{}}'
```

EasyOCR/ANPR from Cloudinary:

```bash
curl -X POST https://YOUR-TUNNEL.trycloudflare.com/api/anpr/recognize \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"imageUrl":"https://res.cloudinary.com/YOUR_CLOUD/image/upload/example.jpg"}'
```

Press `Ctrl+C` once to terminate all children. The launcher attempts to mark the runtime document offline; Angular still performs its own health check because a forced shutdown can prevent that write.

## Manual configuration

- Permit authenticated administrator clients to read `system_config/ai_api` in Firestore Security Rules. Do not permit client writes; the launcher writes through Firebase Admin.
- Put the exact Vercel origin and any deliberately approved preview origins in local `ALLOWED_ORIGINS`.
- Deploy the updated Angular/lightweight services normally. Restarting the tunnel does not require redeployment.

Quick Tunnel URLs are ephemeral and suitable for this FYP demonstration, not an always-on production SLA. The laptop, internet, Firebase credentials, and Cloudinary must be available. First inference can be slower while models initialize.
