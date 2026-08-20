from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

from backend import ai_gateway


class AiGatewayTests(unittest.TestCase):
    def setUp(self):
        ai_gateway.app.config.update(TESTING=True, TESTING_AUTH_DISABLED=True)
        self.client = ai_gateway.app.test_client()

    @patch("backend.ai_gateway.requests.get")
    def test_health_aggregates_service_state_without_inference(self, get):
        get.side_effect = [Mock(ok=True), Mock(ok=False)]
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "degraded", "yolo": "ready", "ocr": "offline"})

    @patch("backend.ai_gateway.requests.request")
    def test_gateway_forwards_existing_detector_payload(self, request):
        request.return_value = Mock(
            content=b'{"success":true}', status_code=200, headers={"Content-Type": "application/json"}
        )
        response = self.client.post("/detector-api/detect-map", json={"image_url": "https://example.invalid/a.jpg"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["success"])
        self.assertTrue(request.call_args.kwargs["url"].endswith("/detect-map"))

    @patch("backend.ai_gateway.requests.request", side_effect=ai_gateway.requests.ConnectionError())
    def test_unavailable_internal_service_returns_502(self, _request):
        response = self.client.post("/api/detection/parking", json={})
        self.assertEqual(response.status_code, 502)
        self.assertIn("offline", response.get_json()["message"])

    def test_invalid_cloudinary_url_is_rejected(self):
        response = self.client.post("/api/anpr/recognize", json={"imageUrl": "https://example.com/car.jpg"})
        self.assertEqual(response.status_code, 400)

    def test_missing_authentication_is_rejected(self):
        ai_gateway.app.config["TESTING_AUTH_DISABLED"] = False
        response = self.client.post("/api/detection/parking", json={})
        self.assertEqual(response.status_code, 401)

    @patch("firebase_admin.auth.verify_id_token", return_value={"uid": "normal-user"})
    @patch("backend.security.get_firestore_client")
    def test_authenticated_non_admin_is_rejected(self, firestore, _verify):
        snapshot = Mock(exists=False)
        firestore.return_value.collection.return_value.document.return_value.get.return_value = snapshot
        ai_gateway.app.config["TESTING_AUTH_DISABLED"] = False
        response = self.client.post(
            "/api/detection/parking",
            json={},
            headers={"Authorization": "Bearer valid-user-token"},
        )
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
