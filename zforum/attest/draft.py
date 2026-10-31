"""Draft text exactly as the checker sees it and as a receipt hashes it.

Normalisation is part of the receipt format (SPEC section 12), not a repair: browsers submit
textarea content with CRLF line endings and Discourse trims surrounding whitespace, so both
are canonicalised by definition. Anything else (a lone CR, empty text, text that already
carries a receipt line) is rejected.
"""

import hashlib
from dataclasses import dataclass

from zforum.domain import Sha256Hex

RECEIPT_LINE_PREFIX = "zforum-receipt: "


class DraftError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class DraftText:
    value: str

    def __post_init__(self) -> None:
        if not isinstance(self.value, str):
            raise TypeError(f"DraftText needs a str, got {type(self.value).__name__}")
        if self.value != normalize_draft(self.value):
            raise DraftError("DraftText must already be normalised; construct it with DraftText.parse")

    @staticmethod
    def parse(text: str) -> "DraftText":
        return DraftText(normalize_draft(text))

    def sha256(self) -> Sha256Hex:
        return Sha256Hex(hashlib.sha256(self.value.encode("utf-8")).hexdigest())


def normalize_draft(text: str) -> str:
    with_lf = text.replace("\r\n", "\n")
    if "\r" in with_lf:
        raise DraftError(f"draft contains a carriage return that is not part of CRLF (at index {with_lf.index(chr(13))})")
    normalized = with_lf.strip()
    if not normalized:
        raise DraftError("draft is empty")
    for line_number, line in enumerate(normalized.split("\n"), start=1):
        if line.startswith(RECEIPT_LINE_PREFIX):
            raise DraftError(f"draft already contains a receipt line (line {line_number})")
    return normalized
