from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any


DEFAULT_SERVICE_ACCOUNT = (
    Path(__file__).resolve().parents[1]
    / "find_my_car_system"
    / "backend"
    / "serviceAccountKey.json"
)


_firebase_initialization_lock = threading.Lock()


def get_firestore_client() -> Any:
    """Create the shared Admin SDK client for local or hosted environments."""
    import firebase_admin
    from firebase_admin import credentials, firestore

    # Vercel can dispatch concurrent requests into the same warm function. Guard
    # the check-and-create sequence so only one request initializes the default
    # Firebase app while the others wait and reuse it.
    with _firebase_initialization_lock:
        try:
            firebase_admin.get_app()
        except ValueError:
            credential_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
            credential_path = Path(
                os.getenv("GOOGLE_APPLICATION_CREDENTIALS", str(DEFAULT_SERVICE_ACCOUNT))
            )

            if credential_json:
                credential = credentials.Certificate(json.loads(credential_json))
            elif credential_path.is_file():
                credential = credentials.Certificate(str(credential_path))
            else:
                # Supports Application Default Credentials on managed hosting.
                credential = credentials.ApplicationDefault()

            firebase_admin.initialize_app(credential)

    return firestore.client()
