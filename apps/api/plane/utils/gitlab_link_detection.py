# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Issue-reference detection in GitLab MR text - see
docs/feature-specs/07-integrations-git.md ("2. GitLab natif", exigence 4)
in plane-selfhost:

  "Le systeme detecte les references a un ticket Plane (format
  IDENTIFIANT-NUMERO, ex. PLANE-123) dans le titre, la description et les
  commits d'une MR, via un pattern configurable par projet (valeur par
  defaut : (?:Closes|Fixes|Resolves|Relates to)?\\s*([A-Z]+-\\d+),
  insensible a la casse)."

Deliberately much simpler than github_link_detection.py: per this
feature's own data model (`GitlabMergeRequestIssueSync` has no
`link_type` field at all, unlike GitHub's `IssuePullRequestLink.link_type`
- see gitlab_integration.py's module docstring), every match is a single,
undifferentiated "this MR references this issue" fact - there is no
closes-vs-references split to resolve here, and the keyword group in the
pattern exists only to let the regex match past incidental prose, not to
carry any semantic weight of its own (see that same docstring for the
full reasoning).

The pattern is configurable per project
(`ProjectGitlabSyncSettings.link_pattern`), so this module works with
*any* caller-supplied pattern, not just the default - the only
requirement (documented on the model field and validated here) is that
it have at least one capturing group, the last of which is taken as the
identifier.
"""

import re

from plane.db.models.gitlab_integration import DEFAULT_GITLAB_LINK_PATTERN

_SPLIT_IDENTIFIER_RE = re.compile(r"^([A-Za-z][A-Za-z0-9]*)-(\d+)$")


def detect_issue_references(text, pattern=None):
    """
    Returns a list of `{"identifier": str, "sequence_id": int}` dicts for
    every distinct issue reference found in `text`, using `pattern` (or
    the spec's own default if not given/blank). Matches that don't
    resolve to a clean `IDENTIFIER-number` shape (e.g. a mis-configured
    custom pattern whose capturing group doesn't actually isolate an
    identifier) are silently skipped rather than raising - a bad regex
    saved by a project admin must degrade to "detects nothing" for that
    project, not crash webhook processing for every event.
    """
    if not text:
        return []

    compiled = _compile(pattern)
    if compiled is None:
        return []

    seen = {}
    for match in compiled.finditer(text):
        groups = [g for g in match.groups() if g]
        if not groups:
            continue
        raw = groups[-1].strip().upper()
        split = _SPLIT_IDENTIFIER_RE.match(raw)
        if split is None:
            continue
        identifier = split.group(1)
        sequence_id = int(split.group(2))
        seen[(identifier, sequence_id)] = True

    return [{"identifier": identifier, "sequence_id": sequence_id} for identifier, sequence_id in seen]


def detect_references_from_sources(title, body, commit_messages=None, pattern=None):
    """Same "title + description + commits" merge as the GitHub module's
    equivalent helper - see exigence 4's own list of scanned sources."""
    seen = {}
    for source in [title or "", body or "", *(commit_messages or [])]:
        for ref in detect_issue_references(source, pattern=pattern):
            seen[(ref["identifier"], ref["sequence_id"])] = True
    return [{"identifier": identifier, "sequence_id": sequence_id} for identifier, sequence_id in seen]


def _compile(pattern):
    try:
        return re.compile(pattern or DEFAULT_GITLAB_LINK_PATTERN, re.IGNORECASE)
    except re.error:
        return None
