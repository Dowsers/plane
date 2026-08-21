# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 10 (Docs/Wiki & Collaboration, docs/feature-specs/10-docs-wiki.md
in plane-selfhost), feature 5 - "Abonnements/notifications par page".

No generic notification-dispatch framework exists anywhere in this
codebase - three other categories already ship the same shape instead: a
small bespoke Celery task that calls `Notification.objects.create()`
directly with its own `entity_name` (`project_update_task.
notify_project_update_published`/`PROJECT_UPDATE`,
`view_subscription_task.notify_view_subscribers`/`VIEW_SUBSCRIPTION`, and
the SLA/workflow-transition engines' own `ISSUE_SLA`/`ISSUE_TRANSITION`
entity names). `notify_page_subscribers` below matches that established
pattern rather than inventing a generic framework, and is named exactly
per the spec's own "Point d'extension" section
(`notify_page_subscribers(page_id, event_type, actor_id, extra=None)`).

Three independent notification pipelines live in this module:

1. `notify_page_subscribers` - broadcasts to every current subscriber
   (minus the actor) for a page-level event: "edited" (debounced content
   edit), "renamed", "locked", "unlocked", "archived", "unarchived",
   "access_changed", "commented".
2. `notify_page_mention` - a single-target notification to ONE specific
   `@mentioned` user. Deliberately NOT folded into (1): a mention must
   reach only the person actually named, never fan out to the page's
   whole subscriber list the way every other event type does.
3. The debounce mechanism (`schedule_debounced_page_edit_notification`/
   `check_page_edit_debounce`) - collapses however many real content saves
   happen during one continuous editing session into exactly one "edited"
   notification per distinct editor per session (exigence 7). No debounce
   precedent exists anywhere else in this codebase; this is new
   infrastructure, deliberately kept simple:

   - Every substantive content save refreshes a Redis-backed (this
     project's cache backend is `django_redis`) "last edit timestamp" key
     per `(page_id, editor_id)`, and - only the first time in a session -
     stashes the pre-session `description_stripped` snapshot for the
     eventual PageActivity row's `old_value`.
   - The FIRST save in a session also schedules (`apply_async(countdown=
     ...)`, the same real-scheduling primitive `issue_version_sync.py`/
     `issue_embedding_task.py` already use in this codebase) a
     `check_page_edit_debounce` check `DEBOUNCE_WINDOW_SECONDS` later -
     guarded by `cache.add` so a second save inside the same still-pending
     window does NOT schedule a second check.
   - When a check fires, it re-reads the last-edit timestamp: if a newer
     edit landed since the check was scheduled (i.e. less than
     `debounce_seconds` has elapsed since THAT edit), it reschedules
     itself for the remaining time instead of firing - so the actual
     notification only ever fires once genuine inactivity is observed,
     however many times a save happened in between.
"""

from django.core.cache import cache
from django.utils import timezone

from celery import shared_task

from plane.bgtasks.notification_task import extract_comment_mentions

DEBOUNCE_WINDOW_SECONDS = 15 * 60

# Exigence 11 - only three UserNotificationPreference toggles exist
# (page_edits/page_mentions/page_comments), even though exigence 6 names
# more trigger categories than that. Every metadata-level event with no
# toggle of its own is treated as a variant of "edition" for preference
# purposes.
EVENT_PREFERENCE_FIELD = {
    "edited": "page_edits",
    "renamed": "page_edits",
    "locked": "page_edits",
    "unlocked": "page_edits",
    "archived": "page_edits",
    "unarchived": "page_edits",
    "access_changed": "page_edits",
    "commented": "page_comments",
    "mentioned": "page_mentions",
}


def _actor_display_name(actor):
    if actor is None:
        return "Someone"
    return actor.display_name or actor.email


def _event_title(page, actor_name, event_type, extra):
    extra = extra or {}
    titles = {
        "edited": f'{actor_name} edited "{page.name}"',
        "renamed": f'{actor_name} renamed a Page to "{page.name}"',
        "locked": f'{actor_name} locked "{page.name}"',
        "unlocked": f'{actor_name} unlocked "{page.name}"',
        "archived": f'{actor_name} archived "{page.name}"',
        "unarchived": f'{actor_name} restored "{page.name}"',
        "access_changed": f'{actor_name} changed the access of "{page.name}"',
        "commented": f'{actor_name} commented on "{page.name}"',
        "mentioned": f'{actor_name} mentioned you in "{page.name}"',
    }
    return titles.get(event_type, f'{actor_name} updated "{page.name}"')


@shared_task
def notify_page_subscribers(page_id, event_type, actor_id, extra=None):
    """Broadcast an event to every current `PageSubscriber` of `page_id`,
    excluding the actor (exigence 5) and re-checking CURRENT read access
    plus the receiver's `UserNotificationPreference` per subscriber.

    NOT used for "mentioned" - see `notify_page_mention` above for why.

    `extra` may carry "field"/"old_value"/"new_value" (mirrored onto both
    the `PageActivity` row created here and `Notification.data.
    page_activity`) and "comment_id".

    Exigence 13 (soft-deleted page): `Page.objects` (the default
    soft-delete-aware manager - see `plane.db.mixins.SoftDeletionManager`)
    already excludes a trashed page, so a missing `page` here silently
    no-ops - blocks any NEW notification without touching notifications
    already emitted earlier.
    """
    from plane.db.models import Notification, Page, PageActivity, PageSubscriber, User, UserNotificationPreference
    from plane.utils.access_control import can_user_access_object

    extra = extra or {}
    page = Page.objects.filter(pk=page_id).first()
    if page is None:
        return

    actor = User.objects.filter(pk=actor_id).first() if actor_id else None
    actor_name = _actor_display_name(actor)

    # The activity trail is recorded regardless of whether anyone ends up
    # actually being notified (correction #5 - "something happened on this
    # page").
    PageActivity.objects.create(
        workspace_id=page.workspace_id,
        page=page,
        actor_id=actor_id,
        verb=event_type,
        field=extra.get("field"),
        old_value=extra.get("old_value"),
        new_value=extra.get("new_value"),
        epoch=timezone.now().timestamp(),
    )

    preference_field = EVENT_PREFERENCE_FIELD.get(event_type, "page_edits")
    title = _event_title(page, actor_name, event_type, extra)

    subscribers = (
        PageSubscriber.objects.filter(page_id=page_id, unsubscribed_manually=False)
        .exclude(subscriber_id=actor_id)
        .select_related("subscriber")
    )

    bulk_notifications = []
    for page_subscriber in subscribers:
        receiver = page_subscriber.subscriber

        # Exigence 9 ("frozen" behaviour) - re-check CURRENT read access at
        # notify time, not just at subscribe time, so a subscriber who has
        # since lost access (e.g. the page went private) silently stops
        # receiving new notifications without their PageSubscriber row
        # being deleted.
        if not can_user_access_object(receiver, page.workspace, "page", page.id):
            continue

        preference = UserNotificationPreference.objects.filter(user_id=receiver.id).first()
        if preference is not None and not getattr(preference, preference_field, True):
            continue

        bulk_notifications.append(
            Notification(
                workspace_id=page.workspace_id,
                project=None,
                entity_identifier=page.id,
                entity_name="page",
                title=title,
                message=[{"data": title}],
                message_stripped=title,
                sender=f"in_app:page_activities:{event_type}",
                triggered_by_id=actor_id,
                receiver_id=receiver.id,
                data={
                    "page": {"id": str(page.id), "name": str(page.name)},
                    "page_activity": {
                        "verb": event_type,
                        "field": extra.get("field"),
                        "actor": str(actor_id) if actor_id else None,
                        "old_value": extra.get("old_value"),
                        "new_value": extra.get("new_value"),
                        "comment_id": extra.get("comment_id"),
                    },
                },
            )
        )

    if bulk_notifications:
        Notification.objects.bulk_create(bulk_notifications, batch_size=100)


@shared_task
def notify_page_mention(page_id, mentioned_user_id, actor_id, extra=None):
    """Single-target counterpart to `notify_page_subscribers` - the
    mention path (exigence 3/6) notifies ONLY the specific mentioned user,
    never the page's whole subscriber list.
    """
    from plane.db.models import Notification, Page, PageActivity, User, UserNotificationPreference
    from plane.utils.access_control import can_user_access_object

    extra = extra or {}
    if actor_id and str(mentioned_user_id) == str(actor_id):
        return  # exigence 5 - never notify a user for mentioning themselves

    page = Page.objects.filter(pk=page_id).first()
    if page is None:
        return

    actor = User.objects.filter(pk=actor_id).first() if actor_id else None
    actor_name = _actor_display_name(actor)

    PageActivity.objects.create(
        workspace_id=page.workspace_id,
        page=page,
        actor_id=actor_id,
        verb="mentioned",
        field=extra.get("field"),
        old_value=None,
        new_value=str(mentioned_user_id),
        epoch=timezone.now().timestamp(),
    )

    receiver = User.objects.filter(pk=mentioned_user_id).first()
    if receiver is None:
        return

    if not can_user_access_object(receiver, page.workspace, "page", page.id):
        return

    preference = UserNotificationPreference.objects.filter(user_id=receiver.id).first()
    if preference is not None and not preference.page_mentions:
        return

    title = _event_title(page, actor_name, "mentioned", extra)
    Notification.objects.create(
        workspace_id=page.workspace_id,
        project=None,
        entity_identifier=page.id,
        entity_name="page",
        title=title,
        message=[{"data": title}],
        message_stripped=title,
        sender="in_app:page_activities:mentioned",
        triggered_by_id=actor_id,
        receiver_id=receiver.id,
        data={
            "page": {"id": str(page.id), "name": str(page.name)},
            "page_activity": {
                "verb": "mentioned",
                "field": extra.get("field"),
                "actor": str(actor_id) if actor_id else None,
                "comment_id": extra.get("comment_id"),
            },
        },
    )


def _mentioned_user_ids(html):
    return set(extract_comment_mentions(html or ""))


def _auto_subscribe_and_notify_mention(page, subscriber_id, actor_id, extra=None):
    """Correction #3/exigence 4 - a user newly `@mentioned` gets
    auto-subscribed AND notified, UNLESS they had already explicitly
    unsubscribed from this page. That prior `unsubscribed_manually=True`
    is read here as "stop involving me in this page at all" - it blocks
    both the re-subscribe AND the mention notification for this event,
    not merely the subscription-list side effect, mirroring how an
    unsubscribe from a mailing list is expected to hold even across a
    fresh reason to be re-added.
    """
    from plane.db.models import PageSubscriber

    if actor_id and str(subscriber_id) == str(actor_id):
        return  # never auto-subscribe/notify a user for mentioning themselves

    existing = PageSubscriber.objects.filter(page_id=page.id, subscriber_id=subscriber_id).first()
    if existing is not None and existing.unsubscribed_manually:
        return

    if existing is None:
        PageSubscriber.objects.create(
            page_id=page.id,
            subscriber_id=subscriber_id,
            workspace_id=page.workspace_id,
            subscribed_manually=False,
            created_by_id=actor_id,
            updated_by_id=actor_id,
        )

    notify_page_mention.delay(str(page.id), str(subscriber_id), str(actor_id) if actor_id else None, extra=extra)


def handle_page_description_mentions(page, actor_id, new_description_html, old_description_html):
    """Wired from `plane.bgtasks.page_transaction_task.page_transaction`
    (correction #3 - that task already fires on every Page save, both
    project-scoped and workspace-scoped, and already extracts
    `user_mention` entities; this reuses `extract_comment_mentions`
    unchanged rather than adding a second HTML parser).

    Diffs old vs. new mentions the same way `notification_task.
    get_new_comment_mentions` already diffs old/new issue-comment HTML -
    only NEWLY added mentions trigger auto-subscribe+notify, so an
    already-known mention isn't re-notified on every subsequent save.
    `old_description_html` being `None` (a brand new Page) is treated as
    "no prior mentions", so a mention present in a page's very first body
    still triggers exigence 3/4 correctly.
    """
    new_mentions = _mentioned_user_ids(new_description_html)
    old_mentions = _mentioned_user_ids(old_description_html) if old_description_html is not None else set()
    added = new_mentions - old_mentions
    for mentioned_id in added:
        _auto_subscribe_and_notify_mention(page, mentioned_id, actor_id, extra={"field": "description"})


def handle_page_comment_mentions(page, comment, actor_id):
    """Wired from `PageCommentViewSet.create`/`.replies` (both scopes - the
    workspace-scoped viewset delegates to these same methods, see
    `plane.app.views.page.workspace.WorkspacePageCommentViewSet`).
    `extract_comment_mentions` reused unchanged against `PageComment.
    comment_html`, same as the description path above - no diffing needed,
    a freshly created comment has no "old" version.
    """
    for mentioned_id in _mentioned_user_ids(comment.comment_html):
        _auto_subscribe_and_notify_mention(
            page, mentioned_id, actor_id, extra={"field": "comment", "comment_id": str(comment.id)}
        )


def _debounce_cache_keys(page_id, actor_id):
    prefix = f"page_edit_debounce:{page_id}:{actor_id}"
    return f"{prefix}:last_edit_at", f"{prefix}:pending", f"{prefix}:old_value"


def schedule_debounced_page_edit_notification(
    page, actor_id, old_description_stripped, debounce_seconds=DEBOUNCE_WINDOW_SECONDS
):
    """See module docstring, mechanism (3). Called synchronously (not a
    task) from `page_transaction` on every substantive content save
    (`old_description_html is not None and new != old`) for both Page URL
    scopes.
    """
    if not actor_id:
        return

    last_edit_key, pending_key, old_value_key = _debounce_cache_keys(page.id, actor_id)
    ttl = debounce_seconds * 6 + 60

    # Refreshed on every substantive save - this is the "still editing"
    # signal `check_page_edit_debounce` re-reads when its countdown fires.
    cache.set(last_edit_key, timezone.now().timestamp(), timeout=ttl)
    # Only the FIRST save of a session stashes the pre-session snapshot -
    # `cache.add` is a no-op if a session is already in progress.
    cache.add(old_value_key, old_description_stripped or "", timeout=ttl)

    if cache.add(pending_key, "1", timeout=ttl):
        check_page_edit_debounce.apply_async(
            args=[str(page.id), str(actor_id), debounce_seconds], countdown=debounce_seconds
        )


@shared_task
def check_page_edit_debounce(page_id, actor_id, debounce_seconds=DEBOUNCE_WINDOW_SECONDS):
    """Fires (at most) once `debounce_seconds` after the LAST edit of a
    session - reschedules itself for the remaining time if a newer edit
    landed since it was scheduled, per exigence 7's own wording ("...ou
    fin de session de presence... par fenetre glissante").
    """
    from plane.db.models import Page

    last_edit_key, pending_key, old_value_key = _debounce_cache_keys(page_id, actor_id)
    last_edit_at = cache.get(last_edit_key)
    if last_edit_at is None:
        # Cache entries expired (or were never set) - nothing to fire.
        cache.delete(pending_key)
        cache.delete(old_value_key)
        return

    elapsed = timezone.now().timestamp() - last_edit_at
    # Small negative-drift tolerance for scheduler/clock imprecision.
    if elapsed < debounce_seconds - 0.5:
        remaining = max(debounce_seconds - elapsed, 1)
        check_page_edit_debounce.apply_async(args=[page_id, actor_id, debounce_seconds], countdown=remaining)
        return

    old_value = cache.get(old_value_key)
    cache.delete(last_edit_key)
    cache.delete(pending_key)
    cache.delete(old_value_key)

    page = Page.objects.filter(pk=page_id).first()
    if page is None:
        return

    notify_page_subscribers.delay(
        str(page.id),
        "edited",
        str(actor_id),
        extra={"field": "description", "old_value": old_value, "new_value": page.description_stripped},
    )
