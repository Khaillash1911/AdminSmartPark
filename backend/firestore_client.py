from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


DEFAULT_SERVICE_ACCOUNT = (
    Path(__file__).resolve().parents[1]
    / "find_my_car_system"
    / "backend"
    / "serviceAccountKey.json"
)


def get_firestore_client() -> Any:
    """Create the shared Admin SDK client for local or hosted environments."""
    import firebase_admin
    from firebase_admin import credentials, firestore

    if not firebase_admin._apps:
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
