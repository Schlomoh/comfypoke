"""The versions in requirements-image.txt, by package name, as uv_pip_install takes them. Read on the laptop only:
inside a container the image is already built, and the file is not shipped (add_local_python_source takes .py files)."""
import re
from pathlib import Path

import modal

_FILE = Path(__file__).with_name("requirements-image.txt")
PINS = {re.split(r"[\[=]", line)[0].lower(): line.strip()
        for line in (_FILE.read_text().splitlines() if modal.is_local() else []) if line.strip() and not line.startswith("#")}


def pinned(*names: str) -> list[str]:
    """The requirement lines for these packages; on the laptop a name missing from the file stops the deploy."""
    return [PINS[n.lower()] for n in names] if modal.is_local() else list(names)
