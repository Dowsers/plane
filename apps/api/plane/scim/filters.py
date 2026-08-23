# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 2 "SCIM 2.0 natif", exigence 5.

Minimal SCIM filter-expression parser (RFC 7644 SS3.4.2.2). No filter-
expression parser exists anywhere else in this codebase (confirmed by this
feature's own pre-implementation research) - `DjangoFilterBackend`'s
exact-match query params are a fundamentally different grammar. Deliberately
NOT a general-purpose SCIM filter grammar (no `and`/`or`/`not`, no `co`/
`sw`/`ew`/`pr`/`gt`/... operators, no parenthesized/nested expressions) -
only the two forms exigence 5 itself names:

    filter=userName eq "value"
    filter=emails.value eq "value"

Anything else - a different attribute, a different operator, a compound
expression - is REJECTED with an explicit SCIM 400 (exigence 5's own
wording: "toute requete de filtre non supportee renvoie une erreur SCIM 400
explicite plutot qu'un resultat silencieusement vide"), never silently
ignored or downgraded to an empty/unfiltered result.
"""

import re
from typing import Optional, Tuple

from plane.scim.exceptions import SCIMError

# Attribute names are matched case-insensitively (SCIM attribute names are
# case-insensitive per RFC 7643 SS2.1); the `eq` operator keyword is also
# matched case-insensitively (IdPs are inconsistent about casing here).
_FILTER_RE = re.compile(
    r'^\s*(?P<attr>userName|emails\.value)\s+eq\s+"(?P<value>(?:[^"\\]|\\.)*)"\s*$',
    re.IGNORECASE,
)

SUPPORTED_FILTER_ATTRS = ("userName", "emails.value")


def parse_scim_filter(raw_filter: Optional[str]) -> Optional[Tuple[str, str]]:
    """Returns `(attribute, value)` with `attribute` normalized to exactly
    `"userName"` or `"emails.value"`, or `None` if `raw_filter` is falsy
    (no filter was requested at all - a normal, unfiltered list).

    Raises `SCIMError` (400, `scimType="invalidFilter"`) for any non-empty
    `raw_filter` that isn't one of the two supported forms - this is the
    one case this function must never return `None` for, per exigence 5.
    """
    if not raw_filter:
        return None

    match = _FILTER_RE.match(raw_filter)
    if not match:
        supported = " / ".join('%s eq "..."' % attr for attr in SUPPORTED_FILTER_ATTRS)
        raise SCIMError(
            detail=f"Unsupported filter expression: {raw_filter!r}. Only {supported} are supported.",
            status_code=400,
            scim_type="invalidFilter",
        )

    attr = match.group("attr")
    value = match.group("value").replace('\\"', '"')
    normalized_attr = "userName" if attr.lower() == "username" else "emails.value"
    return normalized_attr, value
