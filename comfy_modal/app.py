import modal

from . import config
from .image import image

app = modal.App(config.APP_NAME, image=image)
