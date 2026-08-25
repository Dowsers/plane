# @plane/sync-engine

Local-first/offline sync engine for `apps/web` - category 12 (Clavier/
Mobile/Desktop/Offline), feature 4, "Moteur de synchronisation
local-first/offline pour le web"
(`docs/feature-specs/12-keyboard-mobile-desktop.md` in `plane-selfhost`,
lines 260-333). See that spec section for the full requirements
("exigences 1-14") this package and its `apps/web` integration implement.

**Do not confuse this with feature 5** ("Edition mobile hors-ligne",
lines 335-419 of the same spec file) - that feature was dropped entirely
as total fabrication (no mobile app exists in this repo). This package
uses `updated_at`-based last-write-wins (spec's own exigence 8), not the
batch transactional endpoint / `Issue.version` OCC field /
`WorkspaceMemberSyncCursor` model feature 5's own spec proposed for a
different, unbuilt feature.

## Where the pieces run

```
apps/web/core/store/sync-engine.store.ts   (main thread, MobX)
  - owns the Worker, the navigator.onLine + heartbeat network monitor,
    the observable state the UI reads (queue entries, conflicts, online
    state)
  - exposes enqueueCreateIssue/enqueueUpdateIssue/enqueueCreateComment/
    enqueueUpdateComment/enqueueUpdatePageMetadata - thin wrappers that
    build a TMutationQueueEntry and post it to the worker
  - deliberately does NOT reroute the normal ONLINE mutation path through
    the queue: base-issues.store.ts/comment.store.ts/base-page.ts still
    call their existing axios-based services directly first, and only
    fall back to enqueue* from their OWN catch blocks, on a genuine
    network-level failure (isNetworkFailure). This is a smaller, safer
    integration surface than rerouting every mutation through an async
    queue unconditionally - the ONLINE path is completely untouched by
    this feature; only the failure branch changes.

apps/web/core/workers/sync-engine.worker.ts   (dedicated Web Worker)
  - a REAL dedicated Worker (exigence 3, and the user's explicit choice
    of this over an in-page scheduler), bundled by Vite's built-in
    `new Worker(new URL(...), { type: "module" })` support
  - thin bridge: self.onmessage/self.postMessage <-> SyncEngineCore

packages/sync-engine/src/core.ts   (SyncEngineCore, runs INSIDE the worker)
  - all the real orchestration: draining mutation_queue to the REST API
    (FIFO per entity type, dependency-aware via id_map, backed off,
    conflict-checked), pulling the delta/accessible-ids endpoints,
    periodic scheduling of both
  - framework-agnostic: only talks in TWorkerToMainMessage via a plain
    callback, no dependency on `self`/postMessage/any Worker-global - so
    it's independently testable outside a browser if ever needed

packages/sync-engine/src/{db,queue,cache,id-map,conflict,mutations,
request,delta,locks,broadcast,http-error}.ts
  - IndexedDB schema + CRUD, mutation-queue policy helpers, entity cache
    + LRU eviction, client-id<->server-id reconciliation, field-level
    LWW conflict resolution, REST-request building, delta/
    accessible-ids client, Web Locks + BroadcastChannel multi-tab
    coordination, and the axios-error-shape network-failure detector
```

## idb vs. Dexie.js

The spec's own "Considerations API/UX" section suggests either. This
package uses **`idb`** (https://github.com/jakearchibald/idb), not
Dexie:

- `idb` is a ~1.2kB, dependency-free, typed Promise wrapper around the
  _native_ IndexedDB API with no extra runtime abstraction of its own -
  no separate query language, no schema-migration DSL. Everything this
  feature actually needs (a handful of object stores, a couple of
  indexes, simple key/range lookups, one multi-store transaction in
  `evictLeastRecentlyViewedProjects`) is well within plain IndexedDB's
  own capabilities.
- Dexie's much larger surface (reactive `liveQuery`, its own
  transaction/relational-ish query builder, schema-versioning DSL) would
  be paying for abstraction this feature never exercises - none of the
  13 build points call for reactive queries (the MobX layer is already
  the reactive layer on top).
- `idb`'s own types come from the package itself - no extra `@types/*`
  dependency, and the generated `IDBPDatabase<PlaneOfflineSyncDBSchema>`
  type (see `db.ts`) gives every store/index full compile-time key/value
  checking, which was the main practical thing worth paying for either
  library for.

## Quota size

`cache.ts`'s `DEFAULT_QUOTA_BYTES = 30 * 1024 * 1024` (30 MB) per
workspace database. Reasoning:

- Metadata-only entity records (no attachments/binaries - out of scope
  per the spec's own "Hors perimetre"; Page rich-text bodies live
  entirely in the separate, pre-existing `y-indexeddb` store this
  feature deliberately never touches). A back-of-envelope ~1-2 KB per
  JSON issue/comment/page-metadata/reference record means 30 MB
  comfortably holds tens of thousands of issues.
- Small enough that this feature's own proactive LRU eviction
  (`evictLeastRecentlyViewedProjects`) reliably fires _before_ the
  browser's own origin-wide storage-pressure eviction ever has a reason
  to intervene - that eviction is out of this feature's control (it can
  hit ANY of this origin's IndexedDB data, not just this package's), so
  staying well clear of it via a small, predictable, self-imposed cap is
  safer than getting close to it.
- `estimateWorkspaceCacheBytes` is a rough `JSON.stringify(...).length *
2` estimate, not byte-exact (IndexedDB's own on-disk encoding overhead
  isn't modeled) - adequate for a soft, proactive trigger, not a hard
  accounting requirement.

Exported as `DEFAULT_QUOTA_BYTES` so a later tuning pass can override it
without touching the eviction algorithm itself.

## Dependency reconciliation (client id -> server id)

When an Issue (or a comment on an issue that hasn't synced yet) is
created OFFLINE, its queue entry's `id` (a `crypto.randomUUID()`) is used
as BOTH the optimistic local `entityId` AND the `Idempotency-Key` sent
with the eventual HTTP request (`mutations.ts`'s `buildCreateMutation`).
A dependent mutation (e.g. a comment on a not-yet-synced issue, or a
second edit to that same not-yet-synced issue) records that client id in
its own `dependsOnClientId` field. At send time, `core.ts`'s
`resolveEntryForSend` looks `dependsOnClientId` up in the `id_map` store
(`id-map.ts`) and substitutes the real server id into whichever of
`entityId`/`route.issueId` matches it; an entry whose dependency isn't
resolved yet is left `pending` and revisited on the next flush pass.

**Every enqueue call site that could reference a not-yet-synced entity
MUST set `dependsOnClientId` correctly** - this is checked via
`SyncEngineStore.isPendingClientId(entityType, id)` at each call site
(`comment.store.ts`'s `createComment`/`updateComment`,
`base-issues.store.ts`'s `updateIssue`). Getting this wrong sends a
request with a client-generated id in the URL, which 404s and
permanently fails the entry (a 4xx exits the retry loop immediately) -
this exact bug was found and fixed during this feature's own build (the
`updateIssue`/`updateComment` catch blocks were initially missing this
check) and is exactly the class of thing an adversarial data-integrity
review should re-verify.

**Known, narrower, disclosed gap**: `dependsOnClientId` is a single
field, so it can only encode ONE outstanding dependency. An update to a
comment where BOTH the comment itself AND its parent issue were created
offline in the same session and NEITHER has synced yet has two
simultaneous unresolved dependencies (the comment's own id, and its
`route.issueId`) that this single field can't both capture. In practice
this is safe because `core.ts`'s `drainQueue` processes entity types in
a FIXED order (`issue` fully before `issue_comment` before `page`) within
one flush pass, so by the time any `issue_comment` entry is even
attempted, every `issue` create queued so far has already been attempted
in the SAME pass - the parent issue's client id is either already
resolved in `id_map` (the common case) or itself still blocked/backed
off (in which case leaving the comment's `route.issueId` unsubstituted
and letting the request 404-and-fail is a real, narrow limitation, not
silently wrong data - it fails visibly in the "Syncing" panel with manual
Retry available). Redesigning `dependsOnClientId` into a list to close
this narrow gap was judged disproportionate to this session's remaining
scope; documented here rather than silently left unstated.

The backend's own reconciliation hook for the SAME mapping is
`external_source: "offline_web_sync"` / `external_id: <clientId>`,
stamped on every CREATE request body (`request.ts`) - this fork's
existing Slack/intake-form client-reconciliation convention, reused here
per this feature's own pre-implementation research. It lets the server
independently confirm the same mapping if the client ever needs to
re-derive it (e.g. after a hard refresh mid-flush, before the `id_map`
IndexedDB write is guaranteed to have committed) - this package's own
client-side `id_map` is the fast path; `external_id` is the durable,
server-side fallback record of the same fact, not currently consumed by
any read path in this codebase (a future "did my offline-created issue
actually make it?" reconciliation UI could query it, out of scope here).

## Conflict resolution: field-level LWW, and the Page CRDT boundary

`conflict.ts`'s `resolveFieldLevelConflicts` implements exigence 8/9 -
see that module's own docstring for the full per-field comparison rule
(comparing the SERVER's `updated_at` against the mutation's own
`createdAt`, not request-arrival order, and per-FIELD not per-entity, so
an offline edit to one field is never discarded just because a DIFFERENT
field changed elsewhere). Applies to **Issue and IssueComment fields
only**.

**Page rich-text body content must NEVER go through this path** - it
defers entirely to the existing Yjs/Hocuspocus CRDT merge (category 10's
already-real infrastructure). This feature only ever queues Page
METADATA updates (`enqueueUpdatePageMetadata` - name, access, lock,
parent, sort order, ...); `base-page.ts`'s `updateDescription()` method
(the rich-text save path) is completely untouched by this feature and is
never called from anywhere this package's code runs. This boundary is
enforced structurally (there is no `enqueueUpdatePageDescription`
function anywhere in this package) rather than by a runtime check, which
is deliberately the stronger guarantee - there's no field to accidentally
misroute because the queue-building API for Page never accepts
description content in the first place. Also: **Page CREATE is not
offline-capable at all** in this feature - opening a queued
`enqueueCreatePage` was considered and rejected, because a new Page's
Yjs/Hocuspocus collaboration "room" is keyed on the SERVER-issued page
id, which doesn't exist yet for an offline-only client-generated id;
making that work would mean teaching Hocuspocus to accept client-
generated room ids, which is a materially larger change out of this
feature's "reuse the existing Yjs/y-indexeddb infra as-is" scope. A user
creating a brand-new Page while genuinely offline still gets a normal
error today (pre-existing behavior, unchanged) - only editing an
ALREADY-EXISTING page's metadata is offline-capable.

## Multi-tab safety

`locks.ts`'s `withFlushLock` (Web Locks API, `mode: "exclusive", ifAvailable:
true`) is the actual mutual-exclusion mechanism - a real, spec-guaranteed
guarantee that only one tab's worker is ever inside `drainQueue()` at a
given moment, on any browser that supports `navigator.locks` (all current
evergreen browsers). `broadcast.ts`'s `BroadcastChannel` is a SEPARATE,
purely cosmetic cross-tab notification bus (so a background tab's UI -
queue count, offline banner, conflict toasts - stays current even though
only the leader tab is actually talking to the network) and ALSO the
fallback mutual-exclusion signal on a browser without `navigator.locks`
support (every tab reacts to a `queue-changed` broadcast by attempting
its own flush) - that fallback path is explicitly best-effort, NOT a real
double-send guarantee, since IndexedDB reads/writes across two truly
concurrent flush attempts on such a browser could theoretically race.
This is disclosed, not silently assumed to be safe.

**What this session could NOT verify**: there is no real browser
available in this sandbox, so the Web Locks mutual exclusion was
verified by code review (the API contract, `ifAvailable: true` semantics
per spec) and `tsc`, not by actually opening two browser tabs on the same
workspace and observing a real double-flush attempt get correctly
rejected.

## Known backend limitation (delta pagination)

`delta.ts`'s `MAX_SAME_SINCE_PAGES` docstring covers this in full: the
backend's documented "call again with the exact same `since` while
`has_more` is true" paging contract is only genuinely advanceable if a
repeated identical request can return a different page, but the actual
shipped `_delta_bucket` (`plane.utils.offline_sync`, backend half of this
feature) pages with a plain `updated_at__gt=since` filter + `LIMIT`, no
offset/keyset - so an identical repeated request returns the identical
first page every time. This never matters when fewer than 1000 rows
changed since the last poll (the overwhelming common case - `has_more`
is `false` on the first response). It only bites a workspace whose FIRST
full sync covers more than 1000 issues/comments/pages. This client
bounds the number of identical-`since` repeats per entity per poll
(`MAX_SAME_SINCE_PAGES = 5`) so the worker never hangs - a purely
defensive client-side mitigation, not a fix for the underlying gap (a
real fix needs a keyset/opaque per-page cursor on the backend, out of
this frontend-scoped task). `pullDelta`'s return value reports which
entities hit this ceiling (`incompleteEntities`) so a future caller could
surface it; nothing in this feature's own 13 build points currently
consumes that field (not user-facing today).

## Known scope limits (MobX hydration)

`sync-engine.store.ts`'s `handleWorkerMessage` mirrors the worker's
periodic delta-pull results into the same MobX stores every existing
view already reads from, so already-open views stay current without
themselves re-fetching. A few deliberate, disclosed boundaries on that:

- **Page metadata has no MobX hydration path** - existing `BasePage`
  instances aren't a flat id-keyed map like Issue/Cycle/Module/Label/
  State, and the rich-text body this feature must never touch is already
  covered by the pre-existing Yjs/y-indexeddb path regardless of this
  gap.
- **Access-revocation MobX purge is scoped to `issue` only** - the one
  case where leaving a now-inaccessible record visible in-memory is a
  real, user-facing confidentiality concern rather than just harmless
  staleness. `issue_comment` and the reference entities rely on the
  IndexedDB-level purge (already applied before the worker's message is
  even sent) plus the natural staleness bound of a future reload/re-fetch.
- **Id-remap (`applyIdRemapToStores`) does not remove the OLD client-id
  entry** once a create resolves - it ADDS a record under the new real
  id so anything that already knows the real id resolves correctly, but
  a view's own ordered id list (kanban/list/grouped ids, tracked
  independently per view-type store, see the "issue-list cache fallback"
  section below) may still reference the OLD id for the remainder of the
  browser session. A live rename across every one of those list
  structures was judged a larger, separate change; leaving a stale entry
  visible under its old id is the lower-risk direction versus a card
  disappearing outright.

## Issue-list/Kanban/Cycle-board offline read-through (exigence 7)

`BaseIssuesStore.applyCachedIssuesFallback` (`apps/web/core/store/issue/
helpers/base-issues.store.ts`) is the mechanism: when a `fetchIssues`
call fails with a genuine network error (`isNetworkFailure`) while the
offline-sync feature is enabled and the app is actually offline, it reads
this project's cached issues from IndexedDB
(`SyncEngineStore.getCachedEntitiesByProject`) and feeds them through the
EXACT SAME `onfetchIssues`/`processIssueResponse`/`updateGroupedIssueIds`
pipeline a real server response would use - there is no second, parallel
rendering path to keep in sync with the real one.

**Disclosed limitation**: the cache holds a FLAT list of issues, not the
server's filtered/grouped/sorted pagination shape, so this always renders
as a single ungrouped `ALL_ISSUES` bucket
(`processIssueResponse`'s own "array response = ungrouped" branch)
regardless of the view's actual group-by/filter/sort configuration - a
degraded but honest "here is everything cached for this project" list,
not a faithful replay of the exact view the user had configured.

**Wired into**: `ProjectIssues`, `CycleIssues`, `ModuleIssues` (all 3
`fetchIssues` methods) - the stores backing the two view types exigence
7's own wording explicitly names ("liste/Kanban d'issues... board d'un
Cycle").

**Deliberately NOT wired into**: the workspace/profile/project-views/
archived issue stores (lower-priority views, not named in the spec's own
wording), `fetchNextIssues` pagination on any store (a cache-backed "next
page" has no well-defined meaning against a flat, unpaginated cache
snapshot), or Page detail fetches (`ProjectPageStore`/
`WorkspacePageStore`'s `fetchPageDetails`) - unlike Issue, a `Page`
instance is a class (`ProjectPage extends BasePage`) that expects a much
larger, more specific field set to construct correctly (editor-bootstrap-
related fields in particular); synthesizing one from a partial cached
metadata record was judged materially riskier than the flat-map Issue
case, with correctness that could not be verified without a real browser

- consciously left as an honest scope boundary rather than a shipped, un-
  verifiable guess. In practice, a Page's own document BODY already renders
  offline regardless (the pre-existing Yjs/y-indexeddb path persists it
  locally independent of this feature); it's specifically the page metadata
  fetch failing outright on a cold, offline page load that isn't mitigated.

## Power K offline annotations (exigence 13)

The spec names three examples of server-dependent actions to visually
disable while offline: export, running an automation, and full-text
server search. Of these, only full-text server search
(`apps/web/core/components/power-k/ui/modal/search-menu.tsx`) exists as
an actual mechanism in this fork's Power K today - "export" and "running
an automation" are not currently modeled as Power K commands anywhere in
this codebase (grepped the full `power-k/config/*` command list; nothing
matches) - a spec-vs-fork premise correction in the same spirit as this
initiative's other categories' research findings, not an oversight.
`search-menu.tsx` now skips the live search request outright while
`isFeatureEnabled && !isOnline` and renders a dedicated "requires a
connection" message in place of the request (distinct from the generic
"no results" empty state, so a user isn't misled into thinking their
search genuinely matched nothing). Issue CRUD commands
(`create_work_item`, and the context-based work-item state/priority/
assignee/label/cycle/module pages) are untouched and stay active, since
they're exactly what this feature makes genuinely offline-capable.

## Rollout toggle

`Workspace.is_offline_sync_enabled` (`apps/api/plane/db/models/
workspace.py`, migration `0178_offline_sync_rollout_toggle`) - a plain
`BooleanField`, default `False`, same flat-boolean-on-Workspace
convention as `is_initiatives_enabled`/`is_roadmap_enabled`/
`is_flexible_query_enabled`. Exposed generically by the existing
`WorkspaceSerializer` (`fields = "__all__"`) - no new serializer/view
code needed. Workspace Settings > Features has a new toggle row
(admin-only, matching every other feature toggle on that page).
`SyncEngineStore.bootForWorkspace` only spins up the Worker/IndexedDB
when this is `true` for the active workspace - with it off, this whole
feature stays completely dormant (no Worker, no IndexedDB writes, no UI
elements rendered) for that workspace.
