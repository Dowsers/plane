# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 10 (Docs/Wiki & Collaboration, docs/feature-specs/10-docs-wiki.md
in plane-selfhost), features 1+3 (merged) - "Commentaires ancres sur les
Pages" + "Resolution de fils de commentaires". Shared helpers used by both
the project-scoped and workspace-scoped comment viewsets
(`plane.app.views.page.comment`/`.workspace`), so neither the resolve/
reopen/delete role matrix nor the orphan-anchor reconciliation logic is
duplicated across the two URL scopes - same reasoning
`plane.utils.page_collection` already documents for feature 4.
"""

from bs4 import BeautifulSoup


def extract_comment_anchor_ids(description_html):
    """All `data-comment-id` attribute values still present anywhere in
    `description_html`, regardless of which tag carries them.

    The `InlineComment` Tiptap Mark (packages/editor, a separate later
    frontend task) serializes as a plain `<span data-comment-id="...">`,
    not a custom component tag the way `mention-component`/
    `image-component` are - so, unlike
    `plane.bgtasks.page_transaction_task.extract_all_components`, this
    matches on the attribute itself rather than a tag name.
    """
    if not description_html:
        return set()
    try:
        soup = BeautifulSoup(description_html, "html.parser")
    except Exception:
        return set()
    return {
        tag.get("data-comment-id")
        for tag in soup.find_all(attrs={"data-comment-id": True})
        if tag.get("data-comment-id")
    }


def reconcile_page_comment_anchors(page_id, description_html):
    """Decision #3 of this feature's build brief: orphan detection is
    server-side, via HTML reconciliation on every description save - NOT a
    client-side full-document scan. Flips `PageComment.is_orphaned` (both
    ways - an orphaned anchor can come back, e.g. via undo) for every ROOT
    thread on `page_id` (only roots carry `anchor_id` - see
    `PageComment.save()`), based purely on whether at least one occurrence
    of that thread's `anchor_id` is still present in `description_html`.

    Duplicated anchor text (exigence 7 of feature 1 - copy/paste elsewhere
    in the document) is handled for free by this same rule: "at least one
    occurrence of this anchor_id found" already means "not orphaned",
    however many occurrences actually exist - no special-casing needed.

    Called from `plane.bgtasks.page_transaction_task.page_transaction` -
    see that module's docstring for why that task is the right choke point
    (it is already invoked, with the freshly-saved `description_html` and
    `page_id`, from every current description-mutating view in both the
    project-scoped and workspace-scoped Page endpoints - see this
    feature's own build report for the full list of call sites).
    """
    # Local import: avoids a module-load-order dependency between
    # plane.utils and plane.db.models.
    from plane.db.models import PageComment

    root_threads = PageComment.objects.filter(page_id=page_id, parent__isnull=True)
    if not root_threads.exists():
        return

    present_ids = {str(value) for value in extract_comment_anchor_ids(description_html)}

    root_threads.exclude(anchor_id__in=present_ids).update(is_orphaned=True)
    if present_ids:
        root_threads.filter(anchor_id__in=present_ids).update(is_orphaned=False)


def can_user_moderate_page_comment_thread(user, page, thread, project_id=None):
    """Decision #6 of this feature's build brief - the role matrix agreed
    on by feature 1 exigence 4 (who may resolve/reopen a thread) and
    reused identically for delete authorization (feature 1 exigence 5 /
    feature 3 exigence 8, which name the exact same three roles): the
    comment's/thread's own author, the Page's owner (`owned_by`), or an
    Admin - project Admin for a project-scoped page, workspace Admin for a
    workspace-scoped Wiki page (feature 4).

    `thread` is whichever `PageComment` row authorization is being decided
    for: the thread ROOT for resolve/reopen (only roots carry
    `is_resolved`), but any comment or reply for delete authorization
    (exigence 5: "seul l'auteur ... la suppression est possible par
    l'auteur, l'auteur de la Page, ou un admin" - a reply's own author may
    delete just that reply, independently of who authored the thread
    root).

    `project_id`, when given (the project-scoped call sites), narrows the
    "project Admin" check to that specific project context rather than
    "Admin of ANY project this Page happens to be linked to via
    `ProjectPage`" - the more conservative reading, and the one that
    matches what the calling URL is actually scoped to.
    """
    from plane.app.permissions import ROLE
    from plane.db.models import ProjectMember, WorkspaceMember

    if thread.actor_id == user.id:
        return True
    if page.owned_by_id == user.id:
        return True

    admin_role = ROLE.ADMIN.value

    if page.is_global:
        return WorkspaceMember.objects.filter(
            member=user, workspace_id=page.workspace_id, role=admin_role, is_active=True
        ).exists()

    project_filter = (
        {"project_id": project_id}
        if project_id
        else {"project_id__in": page.projects.values_list("id", flat=True)}
    )
    return ProjectMember.objects.filter(
        member=user, workspace_id=page.workspace_id, role=admin_role, is_active=True, **project_filter
    ).exists()


def page_comment_write_block_reason(page):
    """Decision from this feature's build brief: a locked (`is_locked`)
    or archived (`archived_at` set) Page allows reading existing comment
    threads but blocks creating new comments/replies and resolving/
    reopening a thread. Returns an `ERROR_CODES` (plane.utils.error_codes)
    key string if blocked, else `None` - callers build the actual
    `Response` themselves, mirroring the exact shape
    `PagesDescriptionViewSet.partial_update`
    (`plane.app.views.page.base`) already uses for the same two states.
    """
    if page.is_locked:
        return "PAGE_LOCKED"
    if page.archived_at:
        return "PAGE_ARCHIVED"
    return None
