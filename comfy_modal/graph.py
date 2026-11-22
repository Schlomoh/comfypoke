"""Building ComfyUI API prompts without picking node ids by hand. `G.add` hands out the next id and returns a
reference to the node's first output; a node can carry a `stage` (what the phone shows while it runs) and a
`role` (the nodes the studio watches: a sampler whose steps it counts, the output it sends back). Both ride
in the node's `_meta`, which ComfyUI keeps for titles and otherwise ignores, so a prompt describes itself:
the studio and its mock read them back with `stages` and `roles`, and no id means anything on its own."""


class Ref(list):
    """[node id, output index], as ComfyUI wants a link."""

    def out(self, n: int) -> "Ref":
        return Ref([self[0], n])


# Roles whose progress messages are the step counter the phone shows; an upscaler's single step needs none.
COUNTED = ("sampler", "dresser", "swapper")


class G:
    def __init__(self):
        self.nodes: dict[str, dict] = {}

    def add(self, class_type: str, inputs: dict | None = None, *, stage: str | None = None, role: str | None = None,
            **more) -> Ref:
        """A node; `inputs` for names that are not Python identifiers ("render_style.shader"), `more` for the rest."""
        nid = str(len(self.nodes) + 1)
        node = {"class_type": class_type, "inputs": {**(inputs or {}), **more}}
        meta = {k: v for k, v in (("stage", stage), ("role", role)) if v}
        if meta:
            node["_meta"] = meta
        self.nodes[nid] = node
        return Ref([nid, 0])

    def prompt(self) -> dict:
        return self.nodes


def stages(prompt: dict) -> dict[str, str]:
    """Node id to the stage the phone shows while it runs."""
    return {nid: n["_meta"]["stage"] for nid, n in prompt.items() if n.get("_meta", {}).get("stage")}


def counted(prompt: dict) -> set[str]:
    """The samplers whose steps the phone counts, a render's and its finish's alike."""
    return {nid for nid, n in prompt.items() if n.get("_meta", {}).get("role") in COUNTED}


def roles(prompt: dict) -> dict[str, str]:
    """Role to node id; with two of a role (a render and its finish), the later one."""
    return {n["_meta"]["role"]: nid for nid, n in prompt.items() if n.get("_meta", {}).get("role")}
