import modal

from . import config

models = modal.Volume.from_name(config.VOLUME_MODELS, create_if_missing=True)
data = modal.Volume.from_name(config.VOLUME_DATA, create_if_missing=True)
io = modal.Volume.from_name(config.VOLUME_IO, create_if_missing=True)
