"""Update the trusted Firestore pointer to the current local AI tunnel."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.firestore_client import get_firestore_client


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("status", choices=("online", "offline"))
    parser.add_argument("--url", default="")
    args = parser.parse_args()
    document_path = os.getenv("AI_RUNTIME_CONFIG_PATH", "system_config/ai_api").strip("/")
    parts = document_path.split("/")
    if len(parts) != 2 or not all(parts):
        raise SystemExit("AI_RUNTIME_CONFIG_PATH must be collection/document")

    from firebase_admin import firestore

    payload = {"status": args.status, "updatedAt": firestore.SERVER_TIMESTAMP}
    if args.url:
        payload["baseUrl"] = args.url.rstrip("/")
    get_firestore_client().collection(parts[0]).document(parts[1]).set(payload, merge=True)
    print(f"Firestore {document_path} marked {args.status}", flush=True)


if __name__ == "__main__":
    main()
