# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import re
import unicodedata

# Django imports
from django.db import models
from django.db.models import (
    Q,
    OuterRef,
    Subquery,
    Value,
    UUIDField,
    CharField,
    PositiveSmallIntegerField,
    When,
    Case,
)
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db.models.functions import Coalesce, Concat, Lower
from django.utils import timezone
from rest_framework.exceptions import ParseError

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE
from plane.app.views.base import BaseAPIView
from plane.db.models import (
    Workspace,
    Project,
    Issue,
    IssueComment,
    Cycle,
    Module,
    Page,
    IssueView,
    Initiative,
    ProjectMember,
    ProjectPage,
    WorkspaceMember,
)
from plane.db.models.functions import ImmutableConcat, ImmutableUnaccent
from plane.utils.agent_actor import member_visibility_q

# Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
# plane-selfhost), feature 6 ("Recherche approfondie dans la Command
# Palette") - every category in `GlobalSearchEndpoint.MODELS_MAPPER` is
# capped at this many rows per response by default (exigence 3); the
# `types`/`limit`/`offset` query params let a "Voir tous les resultats"
# follow-up call page past this for one category at a time (see
# `GlobalSearchEndpoint.get`'s docstring for the pagination contract).
DEFAULT_SEARCH_LIMIT = 5
MAX_SEARCH_LIMIT = 50
MAX_SEARCH_OFFSET = 10_000

# ~120 total characters (exigence 4), split evenly on both sides of the
# matched term.
SNIPPET_RADIUS = 60


def _normalize_for_match(text):
    """Lowercase + strip diacritics, preserving a 1:1 character offset
    with the original string (only combining accent marks are dropped, so
    every base Latin letter keeps its original position) - this lets an
    offset found in the normalized string be used directly to slice the
    ORIGINAL (accented, original-case) string for a snippet, with no
    second re-scan of the raw text (exigence 4's own reasoning, mirrored
    here on the Python side of the split described below).

    This is the Python-side mirror of `ImmutableUnaccent(Lower(...))`
    (the Postgres-side expression used for the actual, index-accelerated
    matching) - used here only to re-locate, inside a small number of
    already-matched rows, WHERE the match is so a snippet/highlight
    offset can be built. Never used to decide whether a row matches.
    """
    if not text:
        return ""
    decomposed = unicodedata.normalize("NFKD", text)
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return stripped.lower()


def _build_snippet(original_text, term):
    """Pre-truncated (~120 char, exigence 4) excerpt of `original_text`
    centered on the first case/accent-insensitive occurrence of `term`,
    with the match's offset *within the returned snippet* so the frontend
    never has to re-scan the full text (API considerations section).
    Returns `None` if there is no match (should not normally happen for a
    row that already passed the DB-level filter, but defensive since this
    re-scan uses a slightly different, Python-side normalization).

    Contract: `{"text": <plain, HTML-free excerpt>, "highlight_start":
    <int>, "highlight_end": <int>}`, both offsets into `text`.
    """
    if not original_text or not term:
        return None

    normalized_text = _normalize_for_match(original_text)
    normalized_term = _normalize_for_match(term)
    idx = normalized_text.find(normalized_term)
    if idx == -1:
        return None

    match_end = idx + len(normalized_term)
    start = max(0, idx - SNIPPET_RADIUS)
    end = min(len(original_text), match_end + SNIPPET_RADIUS)

    snippet_text = original_text[start:end]
    offset_shift = 0
    if start > 0:
        snippet_text = "…" + snippet_text
        offset_shift = 1
    if end < len(original_text):
        snippet_text = snippet_text + "…"

    return {
        "text": snippet_text,
        "highlight_start": (idx - start) + offset_shift,
        "highlight_end": (match_end - start) + offset_shift,
    }


def _avatar_url_case(prefix):
    """The `avatar_asset`-or-`avatar` fallback expression already used by
    `SearchEndpoint.user_mention` below, factored out so the new `member`
    category (and `issue_comment`'s `actor`) build it identically instead
    of re-deriving it."""
    return Case(
        When(
            **{f"{prefix}avatar_asset__isnull": False},
            then=Concat(Value("/api/assets/v2/static/"), f"{prefix}avatar_asset", Value("/")),
        ),
        When(**{f"{prefix}avatar_asset__isnull": True}, then=f"{prefix}avatar"),
        default=Value(None),
        output_field=CharField(),
    )


class GlobalSearchEndpoint(BaseAPIView):
    """Endpoint to search across multiple fields in the workspace and
    also show related workspace if found
    """

    def filter_workspaces(self, query, _slug, _project_id, _workspace_search, limit, offset):
        fields = ["name"]
        q = Q()
        if query:
            for field in fields:
                q |= Q(**{f"{field}__icontains": query})
        return list(
            Workspace.objects.filter(q, workspace_member__member=self.request.user)
            .order_by("-created_at")
            .distinct()
            .values("name", "id", "slug")[offset : offset + limit]
        )

    def filter_projects(self, query, slug, _project_id, _workspace_search, limit, offset):
        fields = ["name", "identifier"]
        q = Q()
        if query:
            for field in fields:
                q |= Q(**{f"{field}__icontains": query})
        return list(
            Project.objects.filter(
                q,
                project_projectmember__member=self.request.user,
                project_projectmember__is_active=True,
                archived_at__isnull=True,
                workspace__slug=slug,
            )
            .order_by("-created_at")
            .distinct()
            .values("name", "id", "identifier", "workspace__slug")[offset : offset + limit]
        )

    def filter_issues(self, query, slug, project_id, workspace_search, limit, offset):
        # Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
        # plane-selfhost), feature 6 - name matching stays case-insensitive
        # AND (a deliberate small extension beyond the letter of exigence 2,
        # which only asks this of the new description matching) becomes
        # accent-insensitive too, via the same `ImmutableUnaccent(Lower(...))`
        # expression as `description_stripped` - both for exigence 9's own
        # broad wording ("la recherche est insensible... aux accents", not
        # scoped to only the new fields) and because that's what actually
        # makes the `issue_name_trgm_gin_idx` index (mandated by the spec's
        # own "implications sur le modele de donnees" section) load-bearing
        # rather than dead weight - a plain `name__icontains` never matches
        # this index's expression regardless of whether the index exists.
        # This only ever WIDENS matches (accented variants also match a
        # plain-ASCII query and vice versa), never narrows, so existing
        # title-search behaviour is a strict subset of the new behaviour.
        q = Q()
        normalized_query = None
        if query:
            normalized_query = _normalize_for_match(query)
            # Match whole integers only (exclude decimal numbers)
            sequences = re.findall(r"\b\d+\b", query)
            for sequence_id in sequences:
                q |= Q(sequence_id=sequence_id)
            q |= Q(project__identifier__icontains=query)
            q |= Q(_name_norm__contains=normalized_query)
            q |= Q(_description_norm__contains=normalized_query)

        issues = Issue.issue_objects.annotate(
            _name_norm=ImmutableUnaccent(Lower("name")),
            _description_norm=ImmutableUnaccent(Lower("description_stripped")),
        ).filter(
            q,
            project__project_projectmember__member=self.request.user,
            project__project_projectmember__is_active=True,
            project__archived_at__isnull=True,
            workspace__slug=slug,
        )

        if workspace_search == "false" and project_id:
            issues = issues.filter(project_id=project_id)

        rows = issues.distinct().values(
            "name",
            "id",
            "sequence_id",
            "project__identifier",
            "project_id",
            "workspace__slug",
            "description_stripped",
        )[offset : offset + limit]

        results = []
        for row in rows:
            description_stripped = row.pop("description_stripped", None)
            matched_in = "title"
            snippet = None
            if normalized_query and normalized_query not in _normalize_for_match(row["name"] or ""):
                candidate_snippet = _build_snippet(description_stripped, query) if description_stripped else None
                if candidate_snippet:
                    matched_in = "description"
                    snippet = candidate_snippet
            row["matched_in"] = matched_in
            row["snippet"] = snippet
            results.append(row)
        return results

    def filter_cycles(self, query, slug, project_id, workspace_search, limit, offset):
        fields = ["name"]
        q = Q()
        if query:
            for field in fields:
                q |= Q(**{f"{field}__icontains": query})

        cycles = Cycle.objects.filter(
            q,
            project__project_projectmember__member=self.request.user,
            project__project_projectmember__is_active=True,
            project__archived_at__isnull=True,
            workspace__slug=slug,
        )

        if workspace_search == "false" and project_id:
            cycles = cycles.filter(project_id=project_id)

        return list(
            cycles.order_by("-created_at")
            .distinct()
            .values("name", "id", "project_id", "project__identifier", "workspace__slug")[offset : offset + limit]
        )

    def filter_modules(self, query, slug, project_id, workspace_search, limit, offset):
        fields = ["name"]
        q = Q()
        if query:
            for field in fields:
                q |= Q(**{f"{field}__icontains": query})

        modules = Module.objects.filter(
            q,
            project__project_projectmember__member=self.request.user,
            project__project_projectmember__is_active=True,
            project__archived_at__isnull=True,
            workspace__slug=slug,
        )

        if workspace_search == "false" and project_id:
            modules = modules.filter(project_id=project_id)

        return list(
            modules.order_by("-created_at")
            .distinct()
            .values("name", "id", "project_id", "project__identifier", "workspace__slug")[offset : offset + limit]
        )

    def filter_pages(self, query, slug, project_id, workspace_search, limit, offset):
        fields = ["name"]
        q = Q()
        if query:
            for field in fields:
                q |= Q(**{f"{field}__icontains": query})

        # Category 10, feature 4 ("Wiki workspace en GA", exigence 10) -
        # this used to inner-join through
        # `projects__project_projectmember`, meaning a project-less
        # `is_global=True` Wiki page (the new workspace-level Page this
        # feature introduces) could never surface here (Cmd+K/Power-K),
        # since it has zero `ProjectPage` links to join through. The
        # `global_page_q` branch below adds those pages back in, gated by
        # the same public/private `access` + owner rule that already
        # governs read access to a project Page (exigence 8) - just
        # without the project-membership requirement a workspace Page by
        # definition doesn't have.
        project_page_q = Q(
            projects__project_projectmember__member=self.request.user,
            projects__project_projectmember__is_active=True,
            projects__archived_at__isnull=True,
        )
        global_page_q = Q(
            is_global=True,
            workspace__workspace_member__member=self.request.user,
            workspace__workspace_member__is_active=True,
        ) & (Q(owned_by=self.request.user) | Q(access=Page.PUBLIC_ACCESS))

        pages = (
            Page.objects.filter(q, workspace__slug=slug)
            .filter(project_page_q | global_page_q)
            .annotate(
                project_ids=Coalesce(
                    ArrayAgg("projects__id", distinct=True, filter=~Q(projects__id=True)),
                    Value([], output_field=ArrayField(UUIDField())),
                )
            )
            .annotate(
                project_identifiers=Coalesce(
                    ArrayAgg(
                        "projects__identifier",
                        distinct=True,
                        filter=~Q(projects__id=True),
                    ),
                    Value([], output_field=ArrayField(CharField())),
                )
            )
        )

        if workspace_search == "false" and project_id:
            project_subquery = ProjectPage.objects.filter(page_id=OuterRef("id"), project_id=project_id).values_list(
                "project_id", flat=True
            )[:1]

            pages = pages.annotate(project_id=Subquery(project_subquery)).filter(project_id=project_id)

        return list(
            pages.order_by("-created_at")
            .distinct()
            # "is_global" added so the frontend can badge Wiki results
            # distinctly from project pages (exigence 10) - the badge
            # itself is a frontend concern for a later task, but the flag
            # has to be present in this payload for that task to use it.
            .values("name", "id", "project_ids", "project_identifiers", "workspace__slug", "is_global")[
                offset : offset + limit
            ]
        )

    def filter_views(self, query, slug, project_id, workspace_search, limit, offset):
        fields = ["name"]
        q = Q()
        if query:
            for field in fields:
                q |= Q(**{f"{field}__icontains": query})

        issue_views = IssueView.objects.filter(
            q,
            project__project_projectmember__member=self.request.user,
            project__project_projectmember__is_active=True,
            project__archived_at__isnull=True,
            workspace__slug=slug,
        )

        if workspace_search == "false" and project_id:
            issue_views = issue_views.filter(project_id=project_id)

        return list(
            issue_views.order_by("-created_at")
            .distinct()
            .values("name", "id", "project_id", "project__identifier", "workspace__slug")[offset : offset + limit]
        )

    def filter_intakes(self, query, slug, project_id, workspace_search, limit, offset):
        fields = ["name", "sequence_id", "project__identifier"]
        q = Q()
        if query:
            for field in fields:
                if field == "sequence_id":
                    # Match whole integers only (exclude decimal numbers)
                    sequences = re.findall(r"\b\d+\b", query)
                    for sequence_id in sequences:
                        q |= Q(**{"sequence_id": sequence_id})
                else:
                    q |= Q(**{f"{field}__icontains": query})

        issues = Issue.objects.filter(
            q,
            project__project_projectmember__member=self.request.user,
            project__project_projectmember__is_active=True,
            project__archived_at__isnull=True,
            workspace__slug=slug,
        ).filter(models.Q(issue_intake__status=0) | models.Q(issue_intake__status=-2))

        if workspace_search == "false" and project_id:
            issues = issues.filter(project_id=project_id)

        return list(
            issues.order_by("-created_at")
            .distinct()
            .values(
                "name",
                "id",
                "sequence_id",
                "project__identifier",
                "project_id",
                "workspace__slug",
            )[offset : offset + limit]
        )

    def filter_initiatives(self, query, slug, _project_id, _workspace_search, limit, offset):
        fields = ["name"]
        q = Q()
        if query:
            for field in fields:
                q |= Q(**{f"{field}__icontains": query})

        initiatives = Initiative.objects.filter(
            q,
            workspace__slug=slug,
            workspace__workspace_member__member=self.request.user,
            workspace__workspace_member__is_active=True,
        )

        return list(
            initiatives.order_by("-created_at").distinct().values("name", "id", "workspace__slug")[
                offset : offset + limit
            ]
        )

    def filter_issue_comments(self, query, slug, project_id, workspace_search, limit, offset):
        """Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md
        in plane-selfhost), feature 6, exigence 2/7 - new category, absent
        from `MODELS_MAPPER` before this feature. Matches `comment_stripped`
        (plain text, no HTML - see `IssueComment.save()`) case/accent-
        insensitively via the same `ImmutableUnaccent(Lower(...))` +
        `issue_comment_trgm_gin_idx` mechanism as `filter_issues`'s
        description matching.

        Guest/INTERNAL exclusion (exigence 7): unlike
        `IssueCommentViewSet.get_queryset()` (the normal in-app comment
        thread, which applies NO `access` filter at all today), this is a
        deliberately NEW, stricter rule scoped to search only - an active
        Guest (role 5) on the comment's own project never sees an
        `access="INTERNAL"` comment in these results, even when a
        Member/Admin searching the exact same term does. The requester's
        role is resolved per-row via a correlated `Subquery` on
        `ProjectMember` (keyed by the comment's own `project_id`) rather
        than a plain `ROLE.GUEST` constant, since the same user can hold a
        different role on different projects.
        """
        if not query:
            return []

        normalized_query = _normalize_for_match(query)

        requester_role_subquery = ProjectMember.objects.filter(
            project_id=OuterRef("project_id"),
            member_id=self.request.user.id,
            is_active=True,
        ).values("role")[:1]

        comments = (
            IssueComment.objects.annotate(
                _comment_norm=ImmutableUnaccent(Lower("comment_stripped")),
                _requester_role=Subquery(requester_role_subquery, output_field=PositiveSmallIntegerField()),
            )
            .filter(
                _comment_norm__contains=normalized_query,
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
                workspace__slug=slug,
            )
            # A user who currently has NO active membership on the comment's
            # project can never reach this point at all (the join above
            # already requires one) - so `_requester_role` is never NULL
            # for a surviving row, and this exclude cannot be bypassed by a
            # missing membership.
            .exclude(access="INTERNAL", _requester_role=ROLE.GUEST.value)
        )

        if workspace_search == "false" and project_id:
            comments = comments.filter(project_id=project_id)

        rows = (
            comments.annotate(actor_avatar_url=_avatar_url_case("actor__"))
            .order_by("-created_at")
            .distinct()
            .values(
                "id",
                "issue_id",
                "issue__name",
                "issue__sequence_id",
                "project_id",
                "project__identifier",
                "workspace__slug",
                "comment_stripped",
                "actor_id",
                "actor__display_name",
                "actor_avatar_url",
            )[offset : offset + limit]
        )

        results = []
        for row in rows:
            comment_stripped = row.pop("comment_stripped", None)
            results.append(
                {
                    "comment_id": row.pop("id"),
                    "issue_id": row.pop("issue_id"),
                    "issue__name": row.pop("issue__name"),
                    "issue__sequence_id": row.pop("issue__sequence_id"),
                    "project_id": row.pop("project_id"),
                    "project__identifier": row.pop("project__identifier"),
                    "workspace__slug": row.pop("workspace__slug"),
                    "snippet": _build_snippet(comment_stripped, query),
                    "actor": {
                        "id": row.pop("actor_id"),
                        "display_name": row.pop("actor__display_name"),
                        "avatar_url": row.pop("actor_avatar_url"),
                    },
                }
            )
        return results

    def filter_members(self, query, slug, project_id, workspace_search, limit, offset):
        """Category 12, feature 6, exigence 3 - new category. Reuses
        `member_visibility_q` (the same helper `SearchEndpoint.user_mention`
        below already uses) rather than a bespoke bot-exclusion rule, and
        matches name/email case/accent-insensitively via the same
        `ImmutableUnaccent(Lower(...))` mechanism as the other two
        categories, backed by `user_search_trgm_gin_idx`.

        No Guest-exclusion is applied here (unlike `filter_issue_comments`)
        - this mirrors the EXISTING, unrestricted-by-role behaviour of
        `SearchEndpoint.user_mention` (the @mention autocomplete), which
        this category is functionally equivalent to; the spec itself
        leaves this as an open question (see "Questions ouvertes" #3) and
        the build instructions for this feature didn't ask for a new
        restriction here, so this deliberately matches existing precedent
        rather than inventing one.
        """
        if not query:
            return []

        normalized_query = _normalize_for_match(query)
        # Must stay structurally identical to `User.Meta.indexes`'s
        # `user_search_trgm_gin_idx` expression (same reasoning as
        # `ImmutableUnaccent` - see that class's docstring) - in
        # particular `ImmutableConcat`, not `Concat`, since Postgres's
        # built-in `concat()` is STABLE, not IMMUTABLE.
        name_expr = ImmutableUnaccent(
            Lower(
                ImmutableConcat(
                    Coalesce("member__first_name", Value("")),
                    Value(" "),
                    Coalesce("member__last_name", Value("")),
                    Value(" "),
                    Coalesce("member__display_name", Value("")),
                    Value(" "),
                    Coalesce("member__email", Value("")),
                )
            )
        )

        members = WorkspaceMember.objects.annotate(_member_norm=name_expr).filter(
            member_visibility_q("member__"),
            _member_norm__contains=normalized_query,
            is_active=True,
            workspace__slug=slug,
        )

        if workspace_search == "false" and project_id:
            members = members.filter(
                member__project_projectmember__project_id=project_id,
                member__project_projectmember__is_active=True,
            )

        rows = (
            members.annotate(avatar_url=_avatar_url_case("member__"))
            .order_by("-created_at")
            .distinct()
            .values("member_id", "member__display_name", "member__email", "avatar_url")[offset : offset + limit]
        )

        return [
            {
                "member_id": row["member_id"],
                "display_name": row["member__display_name"],
                "email": row["member__email"],
                "avatar_url": row["avatar_url"],
            }
            for row in rows
        ]

    def get(self, request, slug):
        """
        Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
        plane-selfhost), feature 6 ("Recherche approfondie dans la Command
        Palette") extended this endpoint with two new categories
        (`issue_comment`, `member`) and description-matching on `issue`
        (see `filter_issues`/`filter_issue_comments`/`filter_members`
        above), plus a pagination contract needed for the "Voir tous les
        resultats" follow-up call:

        - `types` (new, the spec's own param name) scopes which categories
          run, exactly like the pre-existing `entities` param (kept as a
          synonym for backward compatibility - `types` wins if both are
          given).
        - `limit` (default 5, exigence 3) / `offset` (default 0) apply to
          EVERY requested category uniformly. There is no `total_count`/
          `next` field: the contract is the standard offset-pagination
          convention - if a category's returned list length equals
          `limit`, the frontend should treat that as "there may be more"
          and offer "Voir tous les resultats" (re-calling with `types=
          <that one category>&limit=<bigger>&offset=<next offset>`);
          once a page returns fewer than `limit` items, that category is
          exhausted. Deliberately not built on `BasePaginator`/its cursor
          envelope (`grouped_by`/`next_cursor`/etc.) - that envelope
          expects ONE list per response, whereas this endpoint's existing,
          long-relied-upon shape is a flat `{"results": {<category>:
          [...]}}` dict of independently-paginated lists; forcing the
          cursor envelope on top would have meant either breaking that
          shape for all 9 pre-existing categories or maintaining two
          incompatible pagination mechanisms side by side for no real
          benefit, since this endpoint never needed cursor stability
          (results reshuffling slightly between keystrokes is normal and
          expected for a live search-as-you-type box).
        - Exigence 10: a category with zero matches is omitted from
          `results` entirely (previously every requested category's key
          was always present, even as `[]`) - safe to change because a
          caller already has to tolerate a missing key today (the
          pre-existing `entities` param already lets a caller ask for only
          a subset of categories).
        """
        query = request.query_params.get("search", False)
        types_param = request.query_params.get("types") or request.query_params.get("entities")
        workspace_search = request.query_params.get("workspace_search", "false")
        project_id = request.query_params.get("project_id", False)

        try:
            limit = int(request.query_params.get("limit", DEFAULT_SEARCH_LIMIT))
        except ValueError:
            raise ParseError(detail="Invalid limit parameter.")
        if limit < 1 or limit > MAX_SEARCH_LIMIT:
            raise ParseError(detail=f"Invalid limit value. Must be between 1 and {MAX_SEARCH_LIMIT}.")

        try:
            offset = int(request.query_params.get("offset", 0))
        except ValueError:
            raise ParseError(detail="Invalid offset parameter.")
        if offset < 0 or offset > MAX_SEARCH_OFFSET:
            raise ParseError(detail=f"Invalid offset value. Must be between 0 and {MAX_SEARCH_OFFSET}.")

        MODELS_MAPPER = {
            "workspace": self.filter_workspaces,
            "project": self.filter_projects,
            "issue": self.filter_issues,
            "issue_comment": self.filter_issue_comments,
            "member": self.filter_members,
            "cycle": self.filter_cycles,
            "module": self.filter_modules,
            "issue_view": self.filter_views,
            "page": self.filter_pages,
            "intake": self.filter_intakes,
            "initiative": self.filter_initiatives,
        }

        # Determine which entities to search
        if types_param:
            requested_entities = [e.strip() for e in types_param.split(",") if e.strip()]
            requested_entities = [e for e in requested_entities if e in MODELS_MAPPER]
        else:
            requested_entities = list(MODELS_MAPPER.keys())

        results = {}

        for entity in requested_entities:
            func = MODELS_MAPPER.get(entity)
            if not func:
                continue
            items = func(query or None, slug, project_id, workspace_search, limit, offset)
            # Exigence 10 - a category with no matches is omitted from the
            # response entirely rather than present as an empty list.
            if items:
                results[entity] = items

        return Response({"results": results}, status=status.HTTP_200_OK)


class SearchEndpoint(BaseAPIView):
    def get(self, request, slug):
        query = request.query_params.get("query", False)
        query_types = request.query_params.get("query_type", "user_mention").split(",")
        query_types = [qt.strip() for qt in query_types]
        count = int(request.query_params.get("count", 5))
        project_id = request.query_params.get("project_id", None)

        response_data = {}

        if project_id:
            for query_type in query_types:
                if query_type == "user_mention":
                    fields = [
                        "member__first_name",
                        "member__last_name",
                        "member__display_name",
                    ]
                    q = Q()

                    if query:
                        for field in fields:
                            q |= Q(**{f"{field}__icontains": query})

                    users = (
                        ProjectMember.objects.filter(
                            q,
                            member_visibility_q("member__"),
                            is_active=True,
                            workspace__slug=slug,
                            project_id=project_id,
                        )
                        .annotate(
                            member__avatar_url=Case(
                                When(
                                    member__avatar_asset__isnull=False,
                                    then=Concat(
                                        Value("/api/assets/v2/static/"),
                                        "member__avatar_asset",
                                        Value("/"),
                                    ),
                                ),
                                When(
                                    member__avatar_asset__isnull=True,
                                    then="member__avatar",
                                ),
                                default=Value(None),
                                output_field=CharField(),
                            )
                        )
                        .order_by("-created_at")
                    )

                    users = users.distinct().values(
                        "member__avatar_url",
                        "member__display_name",
                        "member__id",
                    )

                    response_data["user_mention"] = list(users[:count])

                elif query_type == "project":
                    fields = ["name", "identifier"]
                    q = Q()

                    if query:
                        for field in fields:
                            q |= Q(**{f"{field}__icontains": query})
                    projects = (
                        Project.objects.filter(
                            q,
                            Q(project_projectmember__member=self.request.user) | Q(network=2),
                            workspace__slug=slug,
                        )
                        .order_by("-created_at")
                        .distinct()
                        .values("name", "id", "identifier", "logo_props", "workspace__slug")[:count]
                    )
                    response_data["project"] = list(projects)

                elif query_type == "issue":
                    fields = ["name", "sequence_id", "project__identifier"]
                    q = Q()

                    if query:
                        for field in fields:
                            if field == "sequence_id":
                                sequences = re.findall(r"\b\d+\b", query)
                                for sequence_id in sequences:
                                    q |= Q(**{"sequence_id": sequence_id})
                            else:
                                q |= Q(**{f"{field}__icontains": query})

                    issues = (
                        Issue.issue_objects.filter(
                            q,
                            project__project_projectmember__member=self.request.user,
                            project__project_projectmember__is_active=True,
                            workspace__slug=slug,
                            project_id=project_id,
                        )
                        .order_by("-created_at")
                        .distinct()
                        .values(
                            "name",
                            "id",
                            "sequence_id",
                            "project__identifier",
                            "project_id",
                            "priority",
                            "state_id",
                            "type_id",
                        )[:count]
                    )
                    response_data["issue"] = list(issues)

                elif query_type == "cycle":
                    fields = ["name"]
                    q = Q()

                    if query:
                        for field in fields:
                            q |= Q(**{f"{field}__icontains": query})

                    cycles = (
                        Cycle.objects.filter(
                            q,
                            project__project_projectmember__member=self.request.user,
                            project__project_projectmember__is_active=True,
                            workspace__slug=slug,
                            project_id=project_id,
                        )
                        .annotate(
                            status=Case(
                                When(Q(actual_end_date__isnull=False), then=Value("COMPLETED")),
                                When(
                                    Q(actual_start_date__isnull=False) & Q(actual_end_date__isnull=True),
                                    then=Value("CURRENT"),
                                ),
                                When(
                                    Q(start_date__lte=timezone.now()) & Q(end_date__gte=timezone.now()),
                                    then=Value("CURRENT"),
                                ),
                                When(
                                    start_date__gt=timezone.now(),
                                    then=Value("UPCOMING"),
                                ),
                                When(end_date__lt=timezone.now(), then=Value("COMPLETED")),
                                When(
                                    Q(start_date__isnull=True) & Q(end_date__isnull=True),
                                    then=Value("DRAFT"),
                                ),
                                default=Value("DRAFT"),
                                output_field=CharField(),
                            )
                        )
                        .order_by("-created_at")
                        .distinct()
                        .values(
                            "name",
                            "id",
                            "project_id",
                            "project__identifier",
                            "status",
                            "workspace__slug",
                        )[:count]
                    )
                    response_data["cycle"] = list(cycles)

                elif query_type == "module":
                    fields = ["name"]
                    q = Q()

                    if query:
                        for field in fields:
                            q |= Q(**{f"{field}__icontains": query})

                    modules = (
                        Module.objects.filter(
                            q,
                            project__project_projectmember__member=self.request.user,
                            project__project_projectmember__is_active=True,
                            workspace__slug=slug,
                            project_id=project_id,
                        )
                        .order_by("-created_at")
                        .distinct()
                        .values(
                            "name",
                            "id",
                            "project_id",
                            "project__identifier",
                            "status",
                            "workspace__slug",
                        )[:count]
                    )
                    response_data["module"] = list(modules)

                elif query_type == "page":
                    fields = ["name"]
                    q = Q()

                    if query:
                        for field in fields:
                            q |= Q(**{f"{field}__icontains": query})

                    pages = (
                        Page.objects.filter(
                            q,
                            projects__project_projectmember__member=self.request.user,
                            projects__project_projectmember__is_active=True,
                            projects__id=project_id,
                            workspace__slug=slug,
                            access=0,
                        )
                        .order_by("-created_at")
                        .distinct()
                        .values(
                            "name",
                            "id",
                            "logo_props",
                            "projects__id",
                            "workspace__slug",
                        )[:count]
                    )
                    response_data["page"] = list(pages)
            return Response(response_data, status=status.HTTP_200_OK)

        else:
            for query_type in query_types:
                if query_type == "user_mention":
                    fields = [
                        "member__first_name",
                        "member__last_name",
                        "member__display_name",
                    ]
                    q = Q()

                    if query:
                        for field in fields:
                            q |= Q(**{f"{field}__icontains": query})
                    users = (
                        WorkspaceMember.objects.filter(
                            q,
                            member_visibility_q("member__"),
                            is_active=True,
                            workspace__slug=slug,
                        )
                        .annotate(
                            member__avatar_url=Case(
                                When(
                                    member__avatar_asset__isnull=False,
                                    then=Concat(
                                        Value("/api/assets/v2/static/"),
                                        "member__avatar_asset",
                                        Value("/"),
                                    ),
                                ),
                                When(
                                    member__avatar_asset__isnull=True,
                                    then="member__avatar",
                                ),
                                default=Value(None),
                                output_field=models.CharField(),
                            )
                        )
                        .order_by("-created_at")
                        .values("member__avatar_url", "member__display_name", "member__id")[:count]
                    )
                    response_data["user_mention"] = list(users)

                elif query_type == "project":
                    fields = ["name", "identifier"]
                    q = Q()

                    if query:
                        for field in fields:
                            q |= Q(**{f"{field}__icontains": query})
                    projects = (
                        Project.objects.filter(
                            q,
                            Q(project_projectmember__member=self.request.user) | Q(network=2),
                            workspace__slug=slug,
                        )
                        .order_by("-created_at")
                        .distinct()
                        .values("name", "id", "identifier", "logo_props", "workspace__slug")[:count]
                    )
                    response_data["project"] = list(projects)

                elif query_type == "issue":
                    fields = ["name", "sequence_id", "project__identifier"]
                    q = Q()

                    if query:
                        for field in fields:
                            if field == "sequence_id":
                                sequences = re.findall(r"\b\d+\b", query)
                                for sequence_id in sequences:
                                    q |= Q(**{"sequence_id": sequence_id})
                            else:
                                q |= Q(**{f"{field}__icontains": query})

                    issues = (
                        Issue.issue_objects.filter(
                            q,
                            project__project_projectmember__member=self.request.user,
                            project__project_projectmember__is_active=True,
                            workspace__slug=slug,
                        )
                        .order_by("-created_at")
                        .distinct()
                        .values(
                            "name",
                            "id",
                            "sequence_id",
                            "project__identifier",
                            "project_id",
                            "priority",
                            "state_id",
                            "type_id",
                        )[:count]
                    )
                    response_data["issue"] = list(issues)

                elif query_type == "cycle":
                    fields = ["name"]
                    q = Q()

                    if query:
                        for field in fields:
                            q |= Q(**{f"{field}__icontains": query})

                    cycles = (
                        Cycle.objects.filter(
                            q,
                            project__project_projectmember__member=self.request.user,
                            project__project_projectmember__is_active=True,
                            workspace__slug=slug,
                        )
                        .annotate(
                            status=Case(
                                When(Q(actual_end_date__isnull=False), then=Value("COMPLETED")),
                                When(
                                    Q(actual_start_date__isnull=False) & Q(actual_end_date__isnull=True),
                                    then=Value("CURRENT"),
                                ),
                                When(
                                    Q(start_date__lte=timezone.now()) & Q(end_date__gte=timezone.now()),
                                    then=Value("CURRENT"),
                                ),
                                When(
                                    start_date__gt=timezone.now(),
                                    then=Value("UPCOMING"),
                                ),
                                When(end_date__lt=timezone.now(), then=Value("COMPLETED")),
                                When(
                                    Q(start_date__isnull=True) & Q(end_date__isnull=True),
                                    then=Value("DRAFT"),
                                ),
                                default=Value("DRAFT"),
                                output_field=CharField(),
                            )
                        )
                        .order_by("-created_at")
                        .distinct()
                        .values(
                            "name",
                            "id",
                            "project_id",
                            "project__identifier",
                            "status",
                            "workspace__slug",
                        )[:count]
                    )
                    response_data["cycle"] = list(cycles)

                elif query_type == "module":
                    fields = ["name"]
                    q = Q()

                    if query:
                        for field in fields:
                            q |= Q(**{f"{field}__icontains": query})

                    modules = (
                        Module.objects.filter(
                            q,
                            project__project_projectmember__member=self.request.user,
                            project__project_projectmember__is_active=True,
                            workspace__slug=slug,
                        )
                        .order_by("-created_at")
                        .distinct()
                        .values(
                            "name",
                            "id",
                            "project_id",
                            "project__identifier",
                            "status",
                            "workspace__slug",
                        )[:count]
                    )
                    response_data["module"] = list(modules)

                elif query_type == "page":
                    fields = ["name"]
                    q = Q()

                    if query:
                        for field in fields:
                            q |= Q(**{f"{field}__icontains": query})

                    pages = (
                        Page.objects.filter(
                            q,
                            projects__project_projectmember__member=self.request.user,
                            projects__project_projectmember__is_active=True,
                            workspace__slug=slug,
                            access=0,
                            is_global=True,
                        )
                        .order_by("-created_at")
                        .distinct()
                        .values(
                            "name",
                            "id",
                            "logo_props",
                            "projects__id",
                            "workspace__slug",
                        )[:count]
                    )
                    response_data["page"] = list(pages)
            return Response(response_data, status=status.HTTP_200_OK)
