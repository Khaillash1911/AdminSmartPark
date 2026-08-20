from backend.parking_occupancy import app as parking_app


class AddRoutePrefix:
    """Services strips /api/parking; the existing Flask blueprint retains it."""

    def __init__(self, application):
        self.application = application

    def __call__(self, environ, start_response):
        path = environ.get("PATH_INFO", "/")
        environ["PATH_INFO"] = f"/api/parking{path if path.startswith('/') else '/' + path}"
        return self.application(environ, start_response)


app = AddRoutePrefix(parking_app)
