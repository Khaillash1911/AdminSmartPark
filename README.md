# SmartPark APU

SmartPark APU is an Angular administration dashboard backed by a lightweight hosted parking service and two laptop-hosted AI services:

- parking occupancy simulation;
- YOLO parking and double-parking detection;
- Find My Car image upload, number-plate detection, and OCR.

Firebase stores application data and notifications. Cloudinary stores uploaded parking and vehicle images.

## Start here

- [Installation and run instructions](docs/RUNNING.md)
- [Vercel Hobby deployment](docs/VERCEL.md)
- [Local AI Quick Tunnel](docs/AI_TUNNEL.md)
- [System architecture](docs/ARCHITECTURE.md)
- [Backend services](backend/README.md)
- [Parking analytics research](research/parking-analytics/README.md)

## Repository layout

```text
admin-web/                    Angular admin dashboard
backend/                      Parking occupancy simulator API
detection/                    Parking segmentation/detection API
find_my_car_system/backend/   Find My Car and OCR API
docs/                         Project documentation
research/parking-analytics/   Separate analytics datasets and scripts
services/                    Lightweight Vercel Python service
scripts/                     Portable local process launch helpers
```

Run the complete local stack with `npm run dev:all`, or expose only the laptop AI services with `npm run ai:tunnel`. Secrets, virtual environments, dependency folders, uploads, OCR crops, and generated reports are intentionally excluded from Git.
