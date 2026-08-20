from __future__ import annotations

import os
import logging
from functools import wraps
from typing import Any, Callable

from flask import current_app, g, jsonify, request
from flask_cors import CORS

from backend.firestore_client import get_firestore_client


ADMIN_ROLES = {"super_admin", "staff"}
logger = logging.getLogger(__name__)


def configure_cors(app) -> None:
    origins = {
        "http://localhost:4200",
        "http://localhost:4300",
        "http://127.0.0.1:4200",
        "http://127.0.0.1:4300",
    }
    origins.update(
        item.strip().rstrip("/")
        for item in os.getenv("ALLOWED_ORIGINS", "").split(",")
        if item.strip()
    )
    for variable in ("VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL"):
        hostname = os.getenv(variable, "").strip()
        if hostname:
            origins.add(hostname if hostname.startswith("http") else f"https://{hostname}")
    CORS(app, origins=sorted(origins), allow_headers=["Authorization", "Content-Type"])


def authenticate_admin_request():
    if request.method == "OPTIONS" or current_app.config.get("TESTING_AUTH_DISABLED"):
        return None

    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        return jsonify({"error": "Missing Firebase bearer token"}), 401

    token = authorization.removeprefix("Bearer ").strip()
    try:
        from firebase_admin import auth

        # Initialize the Admin SDK before verifying the token. Vercel starts each
        # function in a clean process, so no default Firebase app exists yet.
        firestore_client = get_firestore_client()
        decoded = auth.verify_id_token(token, check_revoked=True)
        uid = decoded.get("uid") or decoded.get("sub")
        admin = firestore_client.collection("admins").document(uid).get()
        if not admin.exists:
            return jsonify({"error": "Administrator access required"}), 403
        admin_data = admin.to_dict() or {}
        if admin_data.get("role") not in ADMIN_ROLES:
            return jsonify({"error": "Invalid administrator role"}), 403
        g.admin = {"uid": uid, **admin_data}
        return None
    except Exception as exc:
        logger.exception("Firebase administrator authentication failed: %s", type(exc).__name__)
        return jsonify({"error": "Invalid or expired Firebase token"}), 401


def admin_required(view: Callable[..., Any]):
    @wraps(view)
    def wrapped(*args, **kwargs):
        error = authenticate_admin_request()
        return error if error is not None else view(*args, **kwargs)

    return wrapped
