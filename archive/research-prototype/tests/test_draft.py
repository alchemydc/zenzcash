from pathlib import Path
from typing import Any

import pytest
from hypothesis import given
from hypothesis import strategies as st

from zforum.attest.draft import DraftError, DraftText, normalize_draft
from zforum.fsio import load_json

_loaded_vectors = load_json(Path(__file__).parent / "vectors" / "receipt-v1.json")
assert isinstance(_loaded_vectors, dict)
VECTORS: dict[str, Any] = _loaded_vectors


def test_draft_normalisation_matches_the_vector() -> None:
    draft = DraftText.parse(VECTORS["draft_input"])
    assert draft.value == VECTORS["draft_normalized"]
    assert draft.sha256().value == VECTORS["draft_sha256"]


@pytest.mark.parametrize(
    "text,message",
    [
        ("", "draft is empty"),
        (" \n\t ", "draft is empty"),
        ("a\rb", "draft contains a carriage return that is not part of CRLF (at index 1)"),
        ("hello\nzforum-receipt: zfr1.x.y", "draft already contains a receipt line (line 2)"),
    ],
)
def test_draft_rejections(text: str, message: str) -> None:
    with pytest.raises(DraftError, match=rf"^{message.replace('(', r'\(').replace(')', r'\)').replace('.', r'\.')}$"):
        DraftText.parse(text)


def test_draft_text_constructor_refuses_unnormalised_text() -> None:
    with pytest.raises(DraftError, match="^DraftText must already be normalised"):
        DraftText("  padded  ")


draft_texts = st.text(alphabet=st.characters(exclude_characters="\r", exclude_categories=["Cs"]), min_size=1).filter(
    lambda text: text.strip() != "" and not any(line.strip().startswith("zforum-receipt:") for line in text.split("\n"))
)


@given(draft_texts)
def test_normalisation_is_idempotent_and_crlf_insensitive(text: str) -> None:
    normalized = normalize_draft(text)
    assert normalize_draft(normalized) == normalized
    assert normalize_draft(text.replace("\n", "\r\n")) == normalized




def test_whitespace_is_python_isspace_and_lengths_are_code_points() -> None:
    # The browser verifier (site/js/receipt.js) mirrors exactly these cases.
    assert normalize_draft("\x1c x \x85") == "x"
    assert normalize_draft("\ufeffx") == "\ufeffx"
    with pytest.raises(DraftError, match=r"^draft contains a carriage return that is not part of CRLF \(at index 1\)$"):
        normalize_draft("😀\rx")
