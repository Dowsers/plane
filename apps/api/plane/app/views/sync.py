# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
plane-selfhost), feature 4 - "Moteur de synchronisation local-first/
offline pour le web", backend half.

Two workspace-scoped read endpoints backing the (frontend-only, built by
a later task) offline sync engine's IndexedDB cache. Both are pure `GET`s
with zero side effects - all the actual offline-capable mutations go
through the three existing creation endpoints `plane.utils.idempotency`
was wired into (`IssueViewSet.create`, `IssueCommentViewSet.create`,
`PageViewSet.create`/`WorkspacePageViewSet.create`) plus their existing
`update`/`partial_update` counterparts, unchanged by this feature (LWW
conflict resolution is a client-side comparison against the
`updated_at`/`updated_by` this feature confirmed - or added, where
missing - on every relevant serializer; the server doesn't need to know
anything new to support it).

`WorkspaceSyncEndpoint` (`GET .../sync/`) - incremental delta:
    Query params:
      - `since` (optional): ISO-8601 datetime string, normally the
        `cursor` value returned by this endpoint's own previous response.
        Omit entirely for a first-ever/full sync.
      - `entities` (optional): comma-separated subset of `issue`,
        `issue_comment`, `cycle`, `module`, `label`, `state`, `page`.
        Omit for all of them.
    Response shape:
        {
          "cursor": "<iso-8601 datetime>",
          "issue": {"results": [...], "has_more": bool, "deleted_ids": [...]},
          "issue_comment": {"results": [...], "has_more": bool},
          "page": {"results": [...], "has_more": bool, "deleted_ids": [...]},
          "cycle": {"results": [...]},
          "module": {"results": [...]},
          "label": {"results": [...]},
          "state": {"results": [...]}
        }
    Only the keys named in `entities` are present. `deleted_ids` is only
    present on `issue`/`page` (the two entities with a real soft-delete
    tombstone concept in this feature's scope) and only when `since` was
    provided (a first/full sync has nothing to reconcile tombstones
    against yet). `has_more` is only meaningful for the 3 delta-capable
    entities (`issue`/`issue_comment`/`page`) - `cycle`/`module`/`label`/
    `state` always return their full currently-visible set in one shot
    (see `plane.utils.offline_sync` module docstring for why that's
    proportionate for this feature's read-only-reference-data scope).

    Paging contract: if any requested entity's `has_more` is `true`, the
    client MUST call again with the EXACT SAME `since` (not the new
    `cursor`) to fetch the next page of that entity, repeating until every
    requested delta-capable entity reports `has_more: false` - only then
    should the client persist the latest response's `cursor` as its new
    `since` for the next independent poll. This is deliberately simpler
    than a heavier opaque per-entity page cursor: `since` is a single,
    valid filter value throughout an entire "drain everything currently
    pending" burst, and the `cursor` returned on every response in that
    burst is safe to keep using as `since` even if the client stops
    partway through and resumes later (it never skips data - see
    `plane.utils.offline_sync.build_delta_response`'s inline comment for
    the exact "capture the cursor before querying" safety argument).

`WorkspaceSyncAccessibleIdsEndpoint` (`GET .../sync/accessible-ids/`) -
access-revocation reconciliation (exigence 11's own gap: a lost-access
event, e.g. removed from a project or an issue moved to a now-
inaccessible project, does NOT bump the entity's `updated_at`, so it can
never show up as a delta via the endpoint above - the client would keep
stale, now-unauthorized data cached forever with no signal to purge it):
    Query params:
      - `entities` (optional): same accepted set as above.
    Response shape:
        {
          "generated_at": "<iso-8601 datetime>",
          "issue": ["<uuid>", ...],
          "issue_comment": ["<uuid>", ...],
          "cycle": [...], "module": [...], "label": [...], "state": [...],
          "page": [...]
        }
    Every value is the COMPLETE current set of ids of that type visible
    to the requesting user right now - nothing incremental. The client
    diffs each list against its own IndexedDB id set for that entity type
    and purges anything present locally but absent here (this also
    transparently covers real deletions the client hasn't heard about
    yet, not just access revocations - either way, "no longer present"
    is the correct purge signal).

    Recommended polling cadence (frontend contract, not enforced
    server-side): call this endpoint every ~15 minutes while the app is
    foregrounded/online, AND immediately on every online-transition
    (`navigator.onLine` flipping true / the exigence 6 reconnect
    heartbeat succeeding after a prior failure). Every request here is
    cheap (id lists only, same accessible-* querysets `sync/` itself
    uses), but membership changes are rare enough that running this on
    every single delta poll (which exigence 6 implies happens far more
    often, on the order of seconds) would be disproportionate - a bounded
    ~15 minute worst-case staleness window for a revoked-access purge is
    a reasonable trade, and is itself already better than exigence 11's
    own wording ("purgés... à la synchronisation suivante"), which sets
    no real-time bound at all.
"""

from django.utils.dateparse import parse_datetime

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.utils.offline_sync import build_accessible_ids_response, build_delta_response, parse_entities

from .base import BaseAPIView


class WorkspaceSyncEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        since = request.GET.get("since") or None
        if since is not None and parse_datetime(since) is None:
            return Response(
                {"error": "`since` must be a valid ISO-8601 datetime string."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        entities = parse_entities(request.GET.get("entities"))
        response = build_delta_response(slug=slug, user=request.user, since=since, entities=entities)
        return Response(response, status=status.HTTP_200_OK)


class WorkspaceSyncAccessibleIdsEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        entities = parse_entities(request.GET.get("entities"))
        response = build_accessible_ids_response(slug=slug, user=request.user, entities=entities)
        return Response(response, status=status.HTTP_200_OK)
