"""Deploy entrypoint:  modal deploy modal_app.py
Importing the classes registers them on the app; see comfy_modal/ for the code."""
from comfy_modal.app import app  # noqa: F401
from comfy_modal.ui import UI  # noqa: F401
from comfy_modal.worker import Worker  # noqa: F401
