"""Safety guards for AI-authored file replacements.

The apply/push flows write ``corrected_code`` as the *complete* new file, so if a model
returns only a fragment (a diff, or just the changed lines) pushing it silently deletes the
rest of the file. ``is_probable_fragment`` detects that failure mode without blocking normal
edits.
"""

from __future__ import annotations

# Structural markers that a genuine whole-file replacement should mostly preserve.
_STRUCTURAL_ANCHORS = (
    "#include",
    "int main",
    "using namespace",
    "<?php",
    "def ",
    "class ",
    "func ",
    "function ",
    "import ",
    "package ",
    "public class",
)


def is_probable_fragment(original_content: str | None, corrected_code: str | None) -> bool:
    """Return True when ``corrected_code`` looks like a fragment of a larger original file.

    A proposed replacement must contain the entire file. We only flag severe collapses so
    legitimate refactors are not blocked:

    * a multi-line file collapsing to (roughly) a third or fewer of its lines; or
    * losing two or more structural anchors that the original contained.
    """
    if not original_content or not corrected_code:
        return False

    original_lines = [line for line in original_content.splitlines() if line.strip()]
    corrected_lines = [line for line in corrected_code.splitlines() if line.strip()]

    if len(original_lines) < 4:
        return False

    if len(corrected_lines) <= max(1, len(original_lines) // 3):
        return True

    if len(corrected_lines) < len(original_lines):
        lost_anchors = [
            anchor
            for anchor in _STRUCTURAL_ANCHORS
            if anchor in original_content and anchor not in corrected_code
        ]
        if len(lost_anchors) >= 2:
            return True

    return False
