"""The face pass's assignment of faces to people (comfy_nodes/studio_face/assign.py)."""
import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location("assign", Path(__file__).parents[1] / "comfy_nodes/studio_face/assign.py")
assign_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(assign_mod)
assign = assign_mod.assign

A, B, C = (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)


def test_photos_pick_their_faces_wherever_they_stand():
    faces = [(100, B), (500, A)]
    assert assign(faces, [("left", A), ("right", B)]) == [1, 0]


def test_without_photos_left_to_right_by_side():
    faces = [(700, C), (100, A), (400, B)]
    assert assign(faces, [("right", None), ("left", None), ("center", None)]) == [0, 1, 2]


def test_people_without_a_side_keep_their_order():
    assert assign([(300, A), (100, B)], [("", None), ("", None)]) == [1, 0]


def test_photo_first_then_the_rest_by_place():
    faces = [(100, C), (500, A), (900, B)]
    assert assign(faces, [("", A), ("left", None), ("right", None)]) == [1, 0, 2]


def test_a_weak_match_is_no_match():
    weak = (0.2, 0.98, 0.0)
    # one face, two people: the photo does not match, and a face left over for two people is not guessed
    assert assign([(100, weak)], [("", A), ("", None)]) == [None, None]


def test_more_faces_than_people_leaves_them_as_rendered():
    assert assign([(100, A), (300, B), (500, C)], [("left", None), ("right", None)]) == [None, None]
    assert assign([(100, A), (300, B), (500, C)], [("", B), ("", None)]) == [1, None]


def test_no_faces():
    assert assign([], [("left", A), ("right", None)]) == [None, None]


def test_levels_mark_whose_face_and_number_the_rest():
    levels = assign_mod.levels
    assert levels([1, 0], 2) == [2, 1]
    assert levels([None, 2], 4) == [5, 6, 2, 7]  # person 2 took the third face; the others come after PEOPLE
    assert levels([], 0) == []
    assert levels([None] * 4, 8) == [5, 6, 7, 8, 9, 10, 0, 0]  # a crowd: the faces past TOP are left out
    assert assign_mod.TOP * assign_mod.LEVEL <= 255
