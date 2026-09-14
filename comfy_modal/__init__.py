"""ComfyUI on Modal: a CPU container serves the GUI, a GPU worker renders.

Modules, one concern each:
    config    names, paths, ports, idle windows
    catalog   which models and custom-node packs to install
    image     how the container image is built
    volumes   the three persistent volumes
    comfy     starting and talking to a local ComfyUI process
    worker    the GPU class (renders prompts, streams progress back)
    ui        the CPU class (serves the GUI behind an access key)
    app       the modal.App object that ties them together
"""
