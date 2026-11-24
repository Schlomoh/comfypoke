"""Which face in a picture belongs to which person of its prompt, for the face pass of a picture with several people.

A person with a face photo takes the face that looks most like it, best matches first, each face once; a match below
MIN_MATCH is no match. The people left over take the faces left over by where they stand, left to right, but only
when there are as many of each: otherwise a face would be redrawn as someone it is not, and it is left as rendered.

No ComfyUI imports, so tests/test_face_assign.py can run it without a GPU.
"""
from collections.abc import Sequence

MIN_MATCH = 0.3  # above buffalo_l's 0.22, where two people part on photo benchmarks
RANK = {"left": 0, "center": 1, "right": 2}


def assign(faces: Sequence[tuple[float, Sequence[float]]], people: Sequence[tuple[str, Sequence[float] | None]]) -> list[int | None]:
    """`faces`: (x of the face's center, its normalized embedding). `people`: (where they stand, "" for anywhere; their
    face photo's normalized embedding, or None). Returns, per person, the index of their face, or None."""
    out: list[int | None] = [None] * len(people)
    taken: set[int] = set()
    pairs = sorted(((sum(a * b for a, b in zip(ref, emb)), p, f) for p, (_, ref) in enumerate(people) if ref is not None
                    for f, (_, emb) in enumerate(faces)), reverse=True)
    for sim, p, f in pairs:
        if sim >= MIN_MATCH and out[p] is None and f not in taken:
            out[p] = f
            taken.add(f)
    rest = sorted((p for p in range(len(people)) if out[p] is None), key=lambda p: (RANK.get(people[p][0], 1), p))
    left = sorted((f for f in range(len(faces)) if f not in taken), key=lambda f: faces[f][0])
    if len(rest) == len(left):
        for p, f in zip(rest, left):
            out[p] = f
    return out
