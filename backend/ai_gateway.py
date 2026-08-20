"""Authenticated local gateway for SmartPark's laptop-hosted AI services."""

from __future__ import annotations

import os
from urllib.parse import urlparse

import requests
from flask import Flask, Response, jsonify, request

from backend.security import authenticate_admin_request, configure_cors


YOLO_INTERNAL_URL = os.getenv("YOLO_INTERNAL_URL", "http://127.0.0.1:5050").rstrip("/")
OCR_INTERNAL_URL = os.getenv("OCR_INTERNAL_URL", "http://127.0.0.1:5002").rstrip("/")
GATEWAY_PORT = int(os.getenv("AI_GATEWAY_PORT", "8000"))
HEALTH_TIMEOUT = float(os.getenv("AI_HEALTH_TIMEOUT_SECONDS", "3"))
INFERENCE_TIMEOUT = float(os.getenv("AI_INFERENCE_TIMEOUT_SECONDS", "180"))
MAX_IMAGE_BYTES = int(os.getenv("AI_MAX_IMAGE_BYTES", str(20 * 1024 * 1024)))
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_IMAGE_BYTES
configure_cors(app)


def _service_health(base_url: str, path: str) -> str:
    try:
        response = requests.get(f"{base_url}/{path.lstrip('/')}" if path else base_url, timeout=HEALTH_TIMEOUT)
        return "ready" if response.ok else "offline"
    except requests.RequestException:
        return "offline"


@app.get("/health")
def health():
    yolo = _service_health(YOLO_INTERNAL_URL, "health")
    ocr = _service_health(OCR_INTERNAL_URL, "")
    status = "online" if yolo == ocr == "ready" else "degraded"
    return jsonify({"status": status, "yolo": yolo, "ocr": ocr})


def _proxy(base_url: str, path: str):
    auth_error = authenticate_admin_request()
    if auth_error is not None:
        return auth_error

    headers = {}
    # Preserve browser CORS context when proxying. Without these headers the
    # upstream Flask-CORS layer chooses its first localhost origin, and Safari
    # blocks the otherwise successful response from the Vercel site.
    for name in (
        "Authorization",
        "Content-Type",
        "Accept",
        "Origin",
        "Access-Control-Request-Method",
        "Access-Control-Request-Headers",
    ):
        if value := request.headers.get(name):
            headers[name] = value

    try:
        upstream = requests.request(
            method=request.method,
            url=f"{base_url}/{path.lstrip('/')}",
            params=request.args,
            headers=headers,
            data=request.get_data(),
            timeout=INFERENCE_TIMEOUT,
        )
    except requests.Timeout:
        return jsonify({"success": False, "message": "AI processing timed out"}), 504
    except requests.RequestException as exc:
        app.logger.warning("AI upstream unavailable: %s", type(exc).__name__)
        return jsonify({"success": False, "message": "AI detection service is currently offline. Start the local AI services and try again."}), 502

    excluded = {"content-encoding", "content-length", "transfer-encoding", "connection"}
    response_headers = [(key, value) for key, value in upstream.headers.items() if key.lower() not in excluded]
    return Response(upstream.content, upstream.status_code, response_headers)


def _download_cloudinary_image(image_url: str) -> tuple[bytes, str]:
    parsed = urlparse(image_url)
    allowed_cloud = os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()
    if parsed.scheme != "https" or parsed.hostname != "res.cloudinary.com":
        raise ValueError("A valid Cloudinary HTTPS image URL is required")
    if allowed_cloud and f"/{allowed_cloud}/" not in parsed.path:
        raise ValueError("The Cloudinary image belongs to an unapproved account")

    with requests.get(image_url, stream=True, timeout=(5, 20), allow_redirects=False) as response:
        response.raise_for_status()
        content_type = response.headers.get("Content-Type", "").split(";", 1)[0].lower()
        if content_type not in IMAGE_TYPES:
            raise ValueError("Cloudinary URL must return JPEG, PNG, or WebP content")
        data = bytearray()
        for chunk in response.iter_content(64 * 1024):
            data.extend(chunk)
            if len(data) > MAX_IMAGE_BYTES:
                raise ValueError("Image must be smaller than 20 MB")
        return bytes(data), content_type


@app.post("/api/anpr/recognize")
def recognize_url():
    auth_error = authenticate_admin_request()
    if auth_error is not None:
        return auth_error
    payload = request.get_json(silent=True) or {}
    try:
        image, content_type = _download_cloudinary_image(str(payload.get("imageUrl", "")).strip())
        upstream = requests.post(
            f"{OCR_INTERNAL_URL}/detect-plate",
            files={"file": ("cloudinary-image", image, content_type)},
            headers={"Authorization": request.headers["Authorization"]},
            timeout=INFERENCE_TIMEOUT,
        )
        return Response(upstream.content, upstream.status_code, {"Content-Type": upstream.headers.get("Content-Type", "application/json")})
    except ValueError as exc:
        return jsonify({"success": False, "message": str(exc)}), 400
    except requests.Timeout:
        return jsonify({"success": False, "message": "AI processing timed out"}), 504
    except requests.RequestException:
        return jsonify({"success": False, "message": "OCR service is currently offline"}), 502


# Preferred public aliases.
@app.route("/api/detection/parking", methods=["POST", "OPTIONS"])
@app.route("/api/detection/double-parking", methods=["POST", "OPTIONS"])
def detect_parking():
    return _proxy(YOLO_INTERNAL_URL, "detect-map")


@app.route("/api/detection/oku", methods=["POST", "OPTIONS"])
def detect_oku():
    return _proxy(YOLO_INTERNAL_URL, "detect-oku-violation")


@app.route("/api/find-car/<path:plate>", methods=["GET", "OPTIONS"])
def find_car(plate: str):
    return _proxy(OCR_INTERNAL_URL, f"find-car/{plate}")


# Compatibility routes keep all existing Angular payloads and responses intact.
@app.route("/detector-api/<path:path>", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
def detector_proxy(path: str):
    return _proxy(YOLO_INTERNAL_URL, path)


@app.route("/anpr-api", defaults={"path": ""}, methods=["GET", "POST", "OPTIONS"])
@app.route("/anpr-api/<path:path>", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
def anpr_proxy(path: str):
    return _proxy(OCR_INTERNAL_URL, path)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=GATEWAY_PORT, debug=False, use_reloader=False, threaded=True)
