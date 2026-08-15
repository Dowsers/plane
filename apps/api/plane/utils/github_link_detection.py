# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Issue-reference detection in GitHub PR text - see
docs/feature-specs/07-integrations-git.md ("1. GitHub natif", exigences
1-2) in plane-selfhost:

  "Le systeme DOIT detecter les references a un ticket Plane dans le
  titre, la description et les commits d'une PR GitHub, via une syntaxe
  d'identifiant de ticket (<PROJECT_IDENTIFIER>-<sequence_id>, ex.
  PROJ-123) precedee eventuellement d'un mot-cle de fermeture (close,
  closes, closed, fix, fixes, fixed, resolve, resolves, resolved) ou sans
  mot-cle (reference simple, sans transition automatique). Une PR
  referencee avec un mot-cle de fermeture DOIT creer un lien de type
  closes ; une reference sans mot-cle DOIT creer un lien de type
  references."

Design: two passes over the same text. First, find every closing-keyword
occurrence immediately followed by an identifier (optionally separated by
":"/whitespace) - each becomes a `closes` reference. Then find every
identifier occurrence anywhere in the text; any not already claimed by
the first pass becomes a `references` reference. A given (identifier,
sequence_id) pair is reported at most once, and `closes` always wins over
`references` for the same pair (an identifier can be plausibly matched by
both passes if it appears once after a keyword - it must not also produce
a second, `references`-typed entry for the exact same occurrence).
"""

import re

CLOSING_KEYWORDS = (
    "close",
    "closes",
    "closed",
    "fix",
    "fixes",
    "fixed",
    "resolve",
    "resolves",
    "resolved",
)

# Case-insensitive: GitHub PR authors don't reliably type identifiers in
# all-caps, and `Project.identifier` itself is normalized to uppercase on
# save (see `Project.save()`) - callers compare the extracted identifier
# against stored project identifiers with `identifier__iexact`, so
# case-insensitivity here doesn't risk over-matching, it just avoids
# under-matching a perfectly legitimate "proj-123".
_IDENTIFIER_RE = re.compile(r"\b([A-Za-z][A-Za-z0-9]*)-(\d+)\b")

_CLOSING_KEYWORD_RE = re.compile(
    r"\b(?:" + "|".join(CLOSING_KEYWORDS) + r")\s*:?\s*([A-Za-z][A-Za-z0-9]*)-(\d+)\b",
    re.IGNORECASE,
)


def detect_issue_references(text):
    """
    Returns a list of `{"identifier": str, "sequence_id": int, "link_type":
    "closes"|"references"}` dicts for every distinct issue reference found
    in `text` (`identifier` uppercased for consistent downstream lookup).
    `text` may be None/empty (returns `[]`) - callers pass possibly-blank
    PR bodies as-is rather than guarding at every call site.
    """
    if not text:
        return []

    references = {}

    for match in _CLOSING_KEYWORD_RE.finditer(text):
        identifier = match.group(1).upper()
        sequence_id = int(match.group(2))
        references[(identifier, sequence_id)] = "closes"

    for match in _IDENTIFIER_RE.finditer(text):
        identifier = match.group(1).upper()
        sequence_id = int(match.group(2))
        key = (identifier, sequence_id)
        if key not in references:
            references[key] = "references"

    return [
        {"identifier": identifier, "sequence_id": sequence_id, "link_type": link_type}
        for (identifier, sequence_id), link_type in references.items()
    ]


def detect_references_from_sources(title, body, commit_messages=None):
    """
    Convenience wrapper matching exigence 1's "titre, la description et
    les commits d'une PR" - scans all three sources and merges results
    (dedup + `closes` still wins over `references` for the same pair,
    even if e.g. the title has a bare reference and a commit message has
    the same identifier behind a closing keyword).
    """
    merged = {}
    for source in [title or "", body or "", *(commit_messages or [])]:
        for ref in detect_issue_references(source):
            key = (ref["identifier"], ref["sequence_id"])
            if key not in merged or ref["link_type"] == "closes":
                merged[key] = ref["link_type"]
    return [
        {"identifier": identifier, "sequence_id": sequence_id, "link_type": link_type}
        for (identifier, sequence_id), link_type in merged.items()
    ]
