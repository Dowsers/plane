# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Deterministic, rule-based natural-language filter parser.

See docs/feature-specs/04-views-filters.md ("Assistant de filtre en langage
naturel") in plane-selfhost. Scope boundary (deliberate, documented in the
feature's patch README): this module never calls an LLM. That is a separate,
already-existing connector in this fork (`apps/api/plane/app/views/external/
base.py`, `get_llm_response`/`get_llm_config`) built for a different feature
(the issue-description "AI assistant" button) - this module does not touch,
import from, or extend it. Everything here is regex/keyword matching plus
`difflib` fuzzy string matching from the Python standard library - no network
call, no new dependency.

Public entry point: `parse_natural_language_query`. Pure function - it takes
plain-Python candidate data (lists of dicts) rather than Django querysets or
model instances, specifically so it can be exercised standalone (no DB, no
Django settings) from `manage.py shell` or even a bare `python3` REPL - see
the verification steps in the feature's patch README.

Honesty notes baked into the design, not just the docs:
- `detect_language` is a stopword-overlap heuristic, not a real language
  model. It is intentionally simple and documented as such - see its
  docstring for exact, known failure modes.
- Fuzzy entity resolution never guesses silently: every candidate phrase
  that does not clear the similarity cutoff against the caller-supplied,
  already-scoped candidate lists is returned in `unresolved_terms`, never
  dropped (spec requirement 5).
- When the query's own wording implies logic this flat AND-only engine
  cannot express (an "or"/"ou" joining two different filter types), the
  parser does not silently pick a wrong-but-plausible-looking answer - it
  keeps only the earliest-mentioned condition, explains the simplification
  in the restatement, and reports `status="partial"` (spec requirement 6).
"""

import re
from calendar import monthrange
from datetime import date, datetime, timedelta
from difflib import SequenceMatcher
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

STATUS_SUCCESS = "success"
STATUS_PARTIAL = "partial"
STATUS_FAILED = "failed"

# State groups that together mean "not finished yet" - see
# `apps/api/plane/db/models/state.py::StateGroup`. Used both for the
# implicit "not completed" half of "overdue", and to describe it back.
NOT_COMPLETED_STATE_GROUPS = ["backlog", "unstarted", "started", "triage"]

FUZZY_MATCH_CUTOFF = 0.72

# ---------------------------------------------------------------------------
# Language detection - a lightweight stopword-overlap heuristic, not a real
# language model (no `langdetect`/`pycld3`/`fasttext`/`langid` in
# requirements/base.txt, and none is being added for this feature - see the
# feature's patch README). Known limits, spelled out rather than hidden:
#   - Very short queries ("Sarah", "urgent") often contain zero function
#     words in either language and fall through to the accent-character
#     tiebreak, then default to English.
#   - Code-mixed queries ("my tickets en retard") are scored on aggregate
#     overlap and will pick whichever language happens to have more
#     matching function words, not a per-phrase split.
#   - This only distinguishes EN/FR (the two languages this feature commits
#     to per the spec) - anything else is misclassified as one of the two.
# ---------------------------------------------------------------------------

_EN_STOPWORDS = {
    "the",
    "a",
    "an",
    "my",
    "mine",
    "me",
    "is",
    "are",
    "to",
    "for",
    "of",
    "in",
    "on",
    "and",
    "or",
    "this",
    "that",
    "with",
    "assigned",
    "issues",
    "issue",
    "tickets",
    "ticket",
    "all",
    "show",
    "please",
    "week",
    "today",
    "month",
    "next",
    "overdue",
    "items",
    "work",
}
_FR_STOPWORDS = {
    "le",
    "la",
    "les",
    "mes",
    "moi",
    "est",
    "sont",
    "à",
    "a",
    "pour",
    "de",
    "du",
    "des",
    "dans",
    "et",
    "ou",
    "ce",
    "cette",
    "avec",
    "assigné",
    "assignés",
    "assignée",
    "assignées",
    "tickets",
    "ticket",
    "tous",
    "toutes",
    "montre",
    "semaine",
    "aujourd'hui",
    "aujourdhui",
    "mois",
    "prochain",
    "retard",
    "éléments",
    "elements",
}
_FR_ACCENT_CHARS = set("àâäéèêëïîôöùûüçœ")

# Includes digits (so "Sprint 12" tokenizes as ["Sprint", "12"], not just
# ["Sprint"]) - only `_` and other punctuation are excluded.
_WORD_PATTERN = re.compile(r"[^\W_]+(?:'[^\W_]+)?", re.UNICODE)


def detect_language(text: str) -> str:
    """Return "en" or "fr" based on function-word overlap. See module
    docstring for the documented limits of this heuristic."""
    lowered = text.lower()
    tokens = set(_WORD_PATTERN.findall(lowered))
    en_hits = len(tokens & _EN_STOPWORDS)
    fr_hits = len(tokens & _FR_STOPWORDS)
    if fr_hits > en_hits:
        return "fr"
    if en_hits > fr_hits:
        return "en"
    if any(ch in _FR_ACCENT_CHARS for ch in lowered):
        return "fr"
    return "en"


# ---------------------------------------------------------------------------
# Keyword tables - checked against the actual UI vocabulary shipped in this
# fork's i18n files (packages/i18n/src/locales/{en,fr}/translations.ts),
# rather than invented translations. French ships two overlapping priority
# vocabularies in this app ("Urgent"/"Haute"/"Moyenne"/"Basse" under
# `issue.priority.*`, and "Urgent"/"Élevé"/"Moyen"/"Faible" at the top
# level) - both are accepted here, with and without accents, since users
# type without accents constantly.
# ---------------------------------------------------------------------------

_PRIORITY_PATTERNS = {
    "urgent": re.compile(r"\burgente?s?\b", re.IGNORECASE),
    "high": re.compile(r"\b(high|hautes?|[ée]lev[ée]e?s?|elevee?s?)\b", re.IGNORECASE),
    "medium": re.compile(r"\b(medium|moyenn?es?)\b", re.IGNORECASE),
    "low": re.compile(r"\b(low|basses?|faibles?)\b", re.IGNORECASE),
}
_PRIORITY_LABELS = {
    "en": {"urgent": "urgent", "high": "high", "medium": "medium", "low": "low"},
    "fr": {"urgent": "urgent", "high": "haute", "medium": "moyenne", "low": "basse"},
}

_SELF_ASSIGN_PATTERN = re.compile(
    r"\b("
    r"assigned to me|assign(?:ed)? to myself|my (?:tickets|issues|items|tasks|work items)|mine|"
    r"assign[ée]e?s? à moi(?:-m[êe]me)?|à moi(?:-m[êe]me)?|mes (?:tickets|t[âa]ches|issues|[ée]l[ée]ments)"
    r")\b",
    re.IGNORECASE,
)

_STATE_GROUP_PATTERNS = {
    "backlog": re.compile(r"\bbacklog\b", re.IGNORECASE),
    "unstarted": re.compile(r"\b(todo|to-do|to do|not started|[àa] faire)\b", re.IGNORECASE),
    "started": re.compile(r"\b(in progress|ongoing|started|en cours)\b", re.IGNORECASE),
    "completed": re.compile(r"\b(done|completed|finished|termin[ée]e?s?)\b", re.IGNORECASE),
    "cancelled": re.compile(r"\b(cancell?ed|annul[ée]e?s?)\b", re.IGNORECASE),
}
_STATE_GROUP_LABELS = {
    "en": {
        "backlog": "backlog",
        "unstarted": "unstarted",
        "started": "in progress",
        "completed": "done",
        "cancelled": "cancelled",
        "triage": "triage",
    },
    "fr": {
        "backlog": "backlog",
        "unstarted": "à faire",
        "started": "en cours",
        "completed": "terminé",
        "cancelled": "annulé",
        "triage": "triage",
    },
}

_OVERDUE_PATTERN = re.compile(r"\b(overdue|en retard|past due|late)\b", re.IGNORECASE)
_TODAY_PATTERN = re.compile(r"\b(today|aujourd'?hui)\b", re.IGNORECASE)
_THIS_WEEK_PATTERN = re.compile(r"\b(this week|cette semaine)\b", re.IGNORECASE)
_NEXT_MONTH_PATTERN = re.compile(r"\b(next month|le mois prochain|mois prochain)\b", re.IGNORECASE)
_START_FIELD_HINT_PATTERN = re.compile(r"\b(start(?:ing|ed)?|d[ée]but|commenc\w*)\b", re.IGNORECASE)
_OR_WORD_PATTERN = re.compile(r"\bor\b|\bou\b", re.IGNORECASE)

_FIELD_TYPE_LABELS = {
    "en": {
        "assignee": "assignee",
        "priority": "priority",
        "date": "date",
        "state": "status",
        "label": "label",
        "cycle": "cycle",
        "module": "module",
    },
    "fr": {
        "assignee": "assigné",
        "priority": "priorité",
        "date": "date",
        "state": "statut",
        "label": "étiquette",
        "cycle": "cycle",
        "module": "module",
    },
}

# Words that are common enough to never be worth flagging as an "unresolved
# entity name" even though they survive the keyword-stripping pass - kept
# deliberately small; the honest failure mode of this heuristic is
# occasionally flagging a real stray word as unresolved (see module
# docstring), not silently swallowing real names.
_CONNECTOR_WORDS = _EN_STOPWORDS | _FR_STOPWORDS | {
    "show",
    "all",
    "with",
    "who",
    "which",
    "que",
    "qui",
    "avec",
    "sur",
    "par",
    "au",
    "aux",
    "un",
    "une",
    "ces",
    "ses",
    "leur",
    "leurs",
    "tout",
    "toute",
    "tous",
    "toutes",
    "not",
    "pas",
    "ne",
    # Generic domain nouns - when the keyword regexes above have already
    # consumed the *value* next to one of these (e.g. "high" out of "high
    # priority", "today" out of "due today"), the bare noun left behind
    # should never itself be treated as an unresolved entity name, and
    # should not glue onto an adjacent real name (e.g. "label Bug" ->
    # candidate phrase "Bug" alone, not "label Bug").
    "priority",
    "priorite",
    "priorité",
    "label",
    "labels",
    "etiquette",
    "étiquette",
    "etiquettes",
    "étiquettes",
    "state",
    "states",
    "status",
    "etat",
    "état",
    "etats",
    "états",
    "statut",
    "statuts",
    "cycle",
    "cycles",
    "module",
    "modules",
    "assignee",
    "assignees",
    "due",
    "date",
    "dates",
    "echeance",
    "échéance",
    "deadline",
    "delai",
    "délai",
}


def _month_bounds(base: date, months_ahead: int) -> tuple:
    month_index = base.month - 1 + months_ahead
    year = base.year + month_index // 12
    month = month_index % 12 + 1
    first = date(year, month, 1)
    last = date(year, month, monthrange(year, month)[1])
    return first, last


def _week_bounds(base: date) -> tuple:
    monday = base - timedelta(days=base.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


def _join_list(items, lang: str) -> str:
    items = [str(item) for item in items if item]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    conjunction = "and" if lang == "en" else "et"
    return f"{', '.join(items[:-1])} {conjunction} {items[-1]}"


def _mask_spans(text: str, spans) -> str:
    """Replace matched keyword spans with spaces (preserving length/offsets)
    so the remaining text can be scanned for entity-name candidates without
    re-matching words that were already consumed as keywords."""
    chars = list(text)
    for start, end in spans:
        for i in range(start, min(end, len(chars))):
            chars[i] = " "
    return "".join(chars)


_HARD_BREAK_CHARS = set(",.;:!?()[]{}\"|/\\\n")


def _extract_candidate_phrases(remainder: str):
    """Return `(phrase, start_index)` for each maximal run of consecutive
    non-stopword tokens in `remainder`. Each run is tried as a single fuzzy
    match candidate (so "Sarah Connor" is tried as one phrase, not two).

    Punctuation forces a break even between two non-stopword words (e.g.
    "assigned to Sarah, high priority" must never merge into a single
    "Sarah priority" candidate just because "high" was already masked out
    as a matched priority keyword) - a plain stopword/connector-word check
    alone is not enough once masking can remove a word from the middle of a
    clause.
    """
    phrases = []
    current_tokens: list = []
    current_start: Optional[int] = None
    prev_end = 0
    for match in _WORD_PATTERN.finditer(remainder):
        if any(char in _HARD_BREAK_CHARS for char in remainder[prev_end : match.start()]):
            if current_tokens:
                phrases.append((" ".join(current_tokens), current_start))
                current_tokens = []
                current_start = None
        prev_end = match.end()

        word = match.group(0)
        if len(word) < 2 or word.lower() in _CONNECTOR_WORDS:
            if current_tokens:
                phrases.append((" ".join(current_tokens), current_start))
                current_tokens = []
                current_start = None
            continue
        if current_start is None:
            current_start = match.start()
        current_tokens.append(word)
    if current_tokens:
        phrases.append((" ".join(current_tokens), current_start))
    return phrases


def _best_pool_match(phrase: str, pool):
    """`pool` is a list of `(id, name)`. Returns `(id, name, ratio)` for the
    best match at or above `FUZZY_MATCH_CUTOFF`, or `None`."""
    phrase_norm = phrase.strip().lower()
    if not phrase_norm:
        return None
    best = None
    for entity_id, name in pool:
        if not name:
            continue
        ratio = SequenceMatcher(None, phrase_norm, str(name).strip().lower()).ratio()
        if ratio >= FUZZY_MATCH_CUTOFF and (best is None or ratio > best[2]):
            best = (entity_id, name, ratio)
    return best


def _build_member_pool(members):
    pool = []
    for member in members:
        member_id = member.get("id")
        if not member_id:
            continue
        names = {
            member.get("display_name"),
            member.get("first_name"),
            member.get("last_name"),
            f"{member.get('first_name') or ''} {member.get('last_name') or ''}".strip(),
        }
        email = member.get("email") or ""
        if "@" in email:
            names.add(email.split("@", 1)[0])
        for name in names:
            if name:
                pool.append((member_id, name))
    return pool


def _register(state: dict, field_type: str, start: int, leaf: dict) -> None:
    """Add a leaf condition to the accumulator, merging it into an existing
    leaf with the same key when one already exists for this field type
    (e.g. two priority words -> one `priority__in` list, not two ANDed
    leaves that could never both be true at once)."""
    first_index = state["field_first_index"]
    if field_type not in first_index or start < first_index[field_type]:
        first_index[field_type] = start
    if field_type not in state["field_types_order"]:
        state["field_types_order"].append(field_type)

    leaves = state["leaves_by_type"].setdefault(field_type, [])
    (key, value), = leaf.items()
    for existing in leaves:
        if key in existing:
            if isinstance(existing[key], list) and isinstance(value, list):
                for item in value:
                    if item not in existing[key]:
                        existing[key].append(item)
            else:
                existing[key] = value
            return
    leaves.append(dict(leaf))


def _describe_leaf(field_type: str, leaf: dict, lang: str, user_id: str, resolved_names: dict) -> Optional[str]:
    (key, value), = leaf.items()

    if key == "assignee_id__in":
        names = []
        for member_id in value:
            if member_id == user_id:
                names.append("me" if lang == "en" else "moi")
            else:
                names.append(resolved_names.get(member_id, member_id))
        joined = _join_list(names, lang)
        return f"assigned to {joined}" if lang == "en" else f"assigné à {joined}"

    if key == "priority__in":
        names = [_PRIORITY_LABELS[lang].get(level, level) for level in value]
        joined = _join_list(names, lang)
        return f"priority {joined}" if lang == "en" else f"priorité {joined}"

    if key == "state_group__in":
        if set(value) == set(NOT_COMPLETED_STATE_GROUPS):
            # Represented by the paired date leaf's "overdue" phrasing instead
            # of being spelled out again - see the overdue handling below.
            return None
        names = [_STATE_GROUP_LABELS[lang].get(group, group) for group in value]
        joined = _join_list(names, lang)
        return f"status {joined}" if lang == "en" else f"statut {joined}"

    if key == "state_id__in":
        joined = _join_list([resolved_names.get(i, i) for i in value], lang)
        return f"state {joined}" if lang == "en" else f"état {joined}"

    if key == "label_id__in":
        joined = _join_list([resolved_names.get(i, i) for i in value], lang)
        return f"label {joined}" if lang == "en" else f"étiquette {joined}"

    if key == "cycle_id__in":
        joined = _join_list([resolved_names.get(i, i) for i in value], lang)
        return f"cycle {joined}" if lang == "en" else f"cycle {joined}"

    if key == "module_id__in":
        joined = _join_list([resolved_names.get(i, i) for i in value], lang)
        return f"module {joined}" if lang == "en" else f"module {joined}"

    is_start_field = key.startswith("start_date")
    field_word_en = "start date" if is_start_field else "due date"
    field_word_fr = "date de début" if is_start_field else "échéance"

    if key.endswith("__lt"):
        if is_start_field:
            return "started before today" if lang == "en" else "a débuté avant aujourd'hui"
        return "overdue" if lang == "en" else "en retard"

    if key.endswith("__exact"):
        return f"{field_word_en} today" if lang == "en" else f"{field_word_fr} aujourd'hui"

    if key.endswith("__range"):
        start_value, end_value = value
        if lang == "en":
            return f"{field_word_en} between {start_value} and {end_value}"
        return f"{field_word_fr} entre {start_value} et {end_value}"

    return None


def parse_natural_language_query(
    query: str,
    *,
    user_id: str,
    candidates: Optional[dict] = None,
    timezone_name: str = "UTC",
    now: Optional[datetime] = None,
) -> dict:
    """Parse a natural-language filter query into the exact `rich_filters`
    wire format (`{"and": [<leaf>, ...]}`) already consumed by
    `ComplexFilterBackend`/`IssueFilterSet`.

    Args:
        query: the raw user-typed text.
        user_id: the requesting user's id, used for self-assignment phrases
            ("assigned to me"/"mes tickets"/...).
        candidates: optional dict with keys "members", "labels", "states",
            "cycles", "modules", each a list of plain dicts (at minimum
            `{"id": ..., "name": ...}`, members additionally
            `display_name`/`first_name`/`last_name`/`email`) - already
            scoped by the caller to the relevant project/workspace. Labels/
            states/cycles/modules are only matched against when provided
            (the workspace-scoped caller, e.g. My Issues, passes only
            "members" - see the feature's patch README for why label/state/
            cycle/module name resolution is project-scoped only).
        timezone_name: an IANA timezone name (e.g. "Europe/Paris") used to
            compute "today" for relative-date phrases. Falls back to UTC on
            an invalid/unknown name.
        now: injectable "current" datetime for deterministic testing; if
            timezone-aware, converted to `timezone_name` before extracting
            "today". Defaults to the real current time.

    Returns:
        dict with keys: `status` ("success"/"partial"/"failed"),
        `filters` (the `{"and": [...]}` fragment, or `{}` if nothing could
        be understood), `restatement` (human-readable, in the detected
        language), `unresolved_terms` (list of original-cased phrases that
        looked like entity references but matched nothing), and
        `detected_language` ("en"/"fr").
    """
    candidates = candidates or {}
    members = candidates.get("members") or []
    labels = candidates.get("labels") or []
    states = candidates.get("states") or []
    cycles = candidates.get("cycles") or []
    modules = candidates.get("modules") or []

    text = (query or "").strip()
    if not text:
        return {
            "status": STATUS_FAILED,
            "filters": {},
            "restatement": "The query was empty - nothing to parse.",
            "unresolved_terms": [],
            "detected_language": "en",
        }

    lang = detect_language(text)

    try:
        tz = ZoneInfo(timezone_name) if timezone_name else ZoneInfo("UTC")
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        tz = ZoneInfo("UTC")
    reference_now = now or datetime.now(tz)
    if reference_now.tzinfo is not None:
        reference_now = reference_now.astimezone(tz)
    today_local = reference_now.date()

    state: dict = {"field_first_index": {}, "field_types_order": [], "leaves_by_type": {}}
    matched_spans = []
    resolved_names: dict = {}

    # ---- self assignment ----
    match = _SELF_ASSIGN_PATTERN.search(text)
    if match:
        matched_spans.append(match.span())
        _register(state, "assignee", match.start(), {"assignee_id__in": [user_id]})

    # ---- priority ----
    found_priorities = []
    for level, pattern in _PRIORITY_PATTERNS.items():
        level_match = pattern.search(text)
        if level_match:
            matched_spans.append(level_match.span())
            found_priorities.append((level_match.start(), level))
    if found_priorities:
        found_priorities.sort(key=lambda item: item[0])
        levels = []
        for _, level in found_priorities:
            if level not in levels:
                levels.append(level)
        _register(state, "priority", found_priorities[0][0], {"priority__in": levels})

    # ---- state group keywords ----
    found_groups = []
    for group, pattern in _STATE_GROUP_PATTERNS.items():
        group_match = pattern.search(text)
        if group_match:
            matched_spans.append(group_match.span())
            found_groups.append((group_match.start(), group))
    if found_groups:
        found_groups.sort(key=lambda item: item[0])
        groups = []
        for _, group in found_groups:
            if group not in groups:
                groups.append(group)
        _register(state, "state", found_groups[0][0], {"state_group__in": groups})

    # ---- relative dates ----
    start_field_hint_match = _START_FIELD_HINT_PATTERN.search(text)
    use_start_date = bool(start_field_hint_match)
    if start_field_hint_match:
        matched_spans.append(start_field_hint_match.span())
    date_field = "start_date" if use_start_date else "target_date"

    overdue_match = _OVERDUE_PATTERN.search(text)
    if overdue_match:
        matched_spans.append(overdue_match.span())
        _register(state, "date", overdue_match.start(), {f"{date_field}__lt": today_local.isoformat()})
        # "Overdue" implies "not already completed/cancelled" - only add this
        # if the query didn't already ask for an explicit status, so we
        # never silently override an explicit status the user asked for.
        if "state" not in state["leaves_by_type"]:
            _register(
                state,
                "date",
                overdue_match.start(),
                {"state_group__in": list(NOT_COMPLETED_STATE_GROUPS)},
            )

    today_match = _TODAY_PATTERN.search(text)
    if today_match:
        matched_spans.append(today_match.span())
        _register(state, "date", today_match.start(), {f"{date_field}__exact": today_local.isoformat()})

    week_match = _THIS_WEEK_PATTERN.search(text)
    if week_match:
        matched_spans.append(week_match.span())
        monday, sunday = _week_bounds(today_local)
        _register(
            state,
            "date",
            week_match.start(),
            {f"{date_field}__range": [monday.isoformat(), sunday.isoformat()]},
        )

    next_month_match = _NEXT_MONTH_PATTERN.search(text)
    if next_month_match:
        matched_spans.append(next_month_match.span())
        first, last = _month_bounds(today_local, 1)
        _register(
            state,
            "date",
            next_month_match.start(),
            {f"{date_field}__range": [first.isoformat(), last.isoformat()]},
        )

    # ---- fuzzy entity-name resolution over whatever text is left ----
    remainder = _mask_spans(text, matched_spans)
    unresolved_terms = []

    member_pool = _build_member_pool(members)
    label_pool = [(item["id"], item.get("name")) for item in labels if item.get("id")]
    state_pool = [(item["id"], item.get("name")) for item in states if item.get("id")]
    cycle_pool = [(item["id"], item.get("name")) for item in cycles if item.get("id")]
    module_pool = [(item["id"], item.get("name")) for item in modules if item.get("id")]

    pools = [
        ("assignee", "assignee_id__in", member_pool),
        ("label", "label_id__in", label_pool),
        ("state", "state_id__in", state_pool),
        ("cycle", "cycle_id__in", cycle_pool),
        ("module", "module_id__in", module_pool),
    ]

    for phrase, start in _extract_candidate_phrases(remainder):
        best_overall = None  # (field_type, lookup_field, entity_id, name, ratio)
        for field_type, lookup_field, pool in pools:
            match_result = _best_pool_match(phrase, pool)
            if match_result and (best_overall is None or match_result[2] > best_overall[4]):
                best_overall = (field_type, lookup_field, match_result[0], match_result[1], match_result[2])

        if best_overall:
            field_type, lookup_field, entity_id, name, _ratio = best_overall
            _register(state, field_type, start, {lookup_field: [entity_id]})
            resolved_names[entity_id] = name
        elif any(char.isalpha() for char in phrase):
            unresolved_terms.append(phrase)

    # Dedupe unresolved terms while preserving first-seen order.
    seen = set()
    deduped_unresolved = []
    for term in unresolved_terms:
        key = term.lower()
        if key not in seen:
            seen.add(key)
            deduped_unresolved.append(term)
    unresolved_terms = deduped_unresolved

    field_types_order = state["field_types_order"]
    leaves_by_type = state["leaves_by_type"]
    field_first_index = state["field_first_index"]

    # ---- "or"/"ou" across different filter types can't be expressed by a
    # flat AND list - keep only the earliest-mentioned condition type and
    # explain the simplification (spec requirement 6). A same-field "or"
    # (e.g. "assigned to Sarah or to me") is NOT a conflict - it's exactly
    # what a multi-value `__in` already expresses, so it only triggers this
    # branch when at least two *different* field types were found.
    or_conflict = bool(_OR_WORD_PATTERN.search(text)) and len(field_types_order) >= 2

    if or_conflict:
        dominant_type = min(field_types_order, key=lambda item: field_first_index[item])
        dropped_types = [item for item in field_types_order if item != dominant_type]
        kept_types = [dominant_type]
        final_leaves = list(leaves_by_type[dominant_type])
    else:
        dropped_types = []
        kept_types = sorted(field_types_order, key=lambda item: field_first_index[item])
        final_leaves = [leaf for field_type in kept_types for leaf in leaves_by_type[field_type]]

    if not final_leaves:
        status = STATUS_FAILED
    elif or_conflict or unresolved_terms:
        status = STATUS_PARTIAL
    else:
        status = STATUS_SUCCESS

    # ---- restatement ----
    if status == STATUS_FAILED:
        if lang == "en":
            restatement = (
                'I could not understand this query - try mentioning a priority, an assignee, '
                'a status, or a date (e.g. "my urgent tickets").'
            )
        else:
            restatement = (
                "Je n'ai pas compris cette requête - essayez de mentionner une priorité, un "
                "assigné, un statut ou une date (ex. « mes tickets urgents »)."
            )
        # Requirement 5: unresolved terms are never silently dropped - even
        # when nothing else could be understood either, say so in the
        # human-readable text too, not just the structured field.
        if unresolved_terms:
            quoted_terms = ", ".join(f'"{term}"' for term in unresolved_terms)
            if lang == "en":
                restatement += f" Could not match {quoted_terms} to any member, label, state, cycle, or module."
            else:
                restatement += (
                    f" Impossible de faire correspondre {quoted_terms} à un membre, une étiquette, "
                    f"un état, un cycle ou un module."
                )
    else:
        descriptions = []
        for field_type in kept_types:
            for leaf in leaves_by_type[field_type]:
                description = _describe_leaf(field_type, leaf, lang, user_id, resolved_names)
                if description:
                    descriptions.append(description)

        core = _join_list(descriptions, lang)
        no_filter_message = "No recognized filter." if lang == "en" else "Aucun filtre reconnu."
        sentence = (core[0].upper() + core[1:]) if core else no_filter_message
        parts = [sentence]

        if or_conflict:
            dropped_labels = _join_list([_FIELD_TYPE_LABELS[lang][item] for item in dropped_types], lang)
            if lang == "en":
                parts.append(
                    f'This assistant cannot combine different filter types with "or" yet, so it kept '
                    f"only the first condition and ignored: {dropped_labels}. Use the advanced filter "
                    f"builder for that."
                )
            else:
                parts.append(
                    f"Cet assistant ne peut pas encore combiner plusieurs types de filtres avec « ou », "
                    f"il n'a donc gardé que la première condition et a ignoré : {dropped_labels}. "
                    f"Utilisez le constructeur de filtres avancés pour cela."
                )

        if unresolved_terms:
            quoted_terms = ", ".join(f'"{term}"' for term in unresolved_terms)
            if lang == "en":
                parts.append(f"Could not match {quoted_terms} to any member, label, state, cycle, or module.")
            else:
                parts.append(
                    f"Impossible de faire correspondre {quoted_terms} à un membre, une étiquette, "
                    f"un état, un cycle ou un module."
                )

        restatement = " ".join(parts)

    return {
        "status": status,
        "filters": {"and": final_leaves} if final_leaves else {},
        "restatement": restatement,
        "unresolved_terms": unresolved_terms,
        "detected_language": lang,
    }
