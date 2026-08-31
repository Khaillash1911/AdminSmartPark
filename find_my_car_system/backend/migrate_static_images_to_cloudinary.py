"""Upload legacy static images to Cloudinary and repair Firestore image URLs.

Run from the repository root:
    ./.venv/bin/python find_my_car_system/backend/migrate_static_images_to_cloudinary.py
"""

import os
import re
import hashlib
from pathlib import Path
from urllib.parse import urlparse, unquote

import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv

from firebase_config import db


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}

load_dotenv(BASE_DIR / ".env", override=True)
parsed_cloudinary_url = urlparse(os.getenv("CLOUDINARY_URL", "").strip())
cloudinary.reset_config()
if all((parsed_cloudinary_url.hostname, parsed_cloudinary_url.username, parsed_cloudinary_url.password)):
    cloudinary.config(
        cloud_name=parsed_cloudinary_url.hostname,
        api_key=unquote(parsed_cloudinary_url.username),
        api_secret=unquote(parsed_cloudinary_url.password),
        secure=True
    )


def clean_plate(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", value.upper())


def image_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as image_file:
        for chunk in iter(lambda: image_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def public_id_for(path: Path) -> str:
    relative = path.relative_to(STATIC_DIR).with_suffix("")
    folder_map = {
        "car_images": "cars",
        "plate_crops": "plate_crops",
        "results": "results",
    }
    parts = list(relative.parts)
    parts[0] = folder_map.get(parts[0], parts[0])
    return "smartpark/" + "/".join(parts)


def main() -> None:
    if not cloudinary.config().cloud_name:
        raise SystemExit(
            "Cloudinary is not configured. Copy .env.example to .env and set CLOUDINARY_URL first."
        )

    images = sorted(
        path for path in STATIC_DIR.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    )
    uploaded: dict[str, dict[str, str]] = {}

    for path in images:
        public_id = public_id_for(path)
        result = cloudinary.uploader.upload(
            str(path),
            public_id=public_id,
            resource_type="image",
            overwrite=True,
            invalidate=True,
        )
        uploaded[path.name] = {
            "url": result["secure_url"],
            "public_id": result["public_id"],
        }
        print(f"Uploaded {path.relative_to(STATIC_DIR)} -> {result['secure_url']}")

    updated = 0
    for document in db.collection("find_my_car").stream():
        car = document.to_dict()
        plate = clean_plate(str(car.get("car_plate_search") or car.get("car_plate") or document.id))
        changes = {}

        car_candidates = [
            (name, info) for name, info in uploaded.items()
            if name.startswith(plate) and (STATIC_DIR / "car_images" / name).exists()
        ]
        if car_candidates:
            # Token-suffixed files were created by the newer confirmation flow;
            # lexical order deterministically selects the last one if duplicates exist.
            selected_name, selected = sorted(car_candidates)[-1]
            changes["image_url"] = selected["url"]
            changes["cloudinary_public_id"] = selected["public_id"]
            changes["image_sha256"] = image_sha256(STATIC_DIR / "car_images" / selected_name)

            token_match = re.search(r"_([a-f0-9]{8})\.[^.]+$", selected_name, re.IGNORECASE)
            if token_match:
                token = token_match.group(1).lower()
                plate_candidates = [
                    info for name, info in uploaded.items()
                    if name.lower().startswith(token)
                    and (STATIC_DIR / "plate_crops" / name).exists()
                ]
                if plate_candidates:
                    changes["plate_image_url"] = plate_candidates[0]["url"]
                    changes["plate_cloudinary_public_id"] = plate_candidates[0]["public_id"]

        if changes:
            document.reference.set(changes, merge=True)
            updated += 1
            print(f"Updated Firestore find_my_car/{document.id}")

    print(f"Migration complete: {len(images)} images uploaded, {updated} Firestore records updated.")


if __name__ == "__main__":
    main()
