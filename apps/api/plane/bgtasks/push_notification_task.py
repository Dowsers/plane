# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
plane-selfhost), feature 3 - "Notifications push en self-hosted".

CALL SITE (pre-implementation research point 2): hooked into
`plane.bgtasks.notification_task.notifications` right after each in-app
`Notification` is queued for `bulk_create` - NOT "in parallel with email".
Email itself is further decoupled from that same task (`EmailNotificationLog`
rows it also creates are only actually sent up to 5 minutes later, by the
`stack_email_notification` beat job) - push fires close to real-time
precisely because this task's own `.delay()` is called eagerly from
`notifications()` rather than waiting on that batching sweep, not because
of any literal "parallel with email" execution.

SINGLE SOURCE OF TRUTH FOR PUSH ELIGIBILITY: `notifications()` computes
WHICH `push_*` preference field(s) an activity maps to (`event_types`,
e.g. `["state_change"]`, `["state_change", "issue_completed"]`,
`["comment"]`, `["property_change"]`, `["mention"]`) but never itself
checks whether that toggle - or the master `push_enabled` switch, or quiet
hours, or the instance kill switch - is actually on. ALL of that gating
lives here, in one place, so the "independent of email preferences"
requirement (exigence 3) holds structurally: this task never reads
`preference.property_change`/`.state_change`/`.comment`/`.mention`/
`.issue_completed` (the EMAIL fields) at all, only their `push_`-prefixed
siblings.
"""

import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import pytz
from celery import shared_task
from django.utils import timezone
from pywebpush import WebPushException, webpush

from plane.db.models import ProjectMember, PushNotificationSubscription, State, User, UserNotificationPreference
from plane.license.models import PushNotificationConfig
from plane.license.utils.instance_value import get_configuration_value
from plane.settings.redis import redis_instance
from plane.utils.exception_logger import log_exception
from plane.utils.vapid import build_vapid_from_private_key

logger = logging.getLogger("plane.worker")

# Pre-implementation research point 7 - rate limiting. Adapted (not
# reused as-is) the fixed-window-per-minute `INCR`+`EXPIRE` idiom from
# `plane.utils.workflow_rule_engine._check_rate_limit`, rather than the
# Redis sorted-set sliding-window Lua script in `plane.api.rate_limit`
# (`TieredSlidingWindowRateThrottle`) - that one is built directly against
# DRF's `SimpleRateThrottle`/an authenticated `APIToken`-bearing HTTP
# request, neither of which exists inside a Celery task. A per-user fixed
# window is proportionate here: push volume is inherently bounded by
# notification-CREATION events (issue activity, mentions), not raw HTTP
# request volume, and the spec itself lists this guard as a "nice to
# have" open question rather than a hard requirement - a burst-tolerant
# fixed window is enough to stop a runaway automation loop (e.g. an
# external webhook mass-creating comments) from hammering a user's
# devices, without the added complexity of a sliding-window script for a
# guard this secondary. Fails OPEN on any Redis error, matching every
# other rate limiter in this codebase.
MAX_PUSH_PER_MINUTE_PER_USER = 30

# RFC 8292 requires the VAPID JWT to carry a contact address ("sub"
# claim). Used only as a last-resort fallback if an instance admin
# generated/entered VAPID keys but never filled in
# `PushNotificationConfig.vapid_admin_email` - sending should still work
# (most push services do not reject on the "sub" value's exact content),
# just with a non-actionable placeholder contact.
_FALLBACK_VAPID_ADMIN_EMAIL = "admin@example.com"


def resolve_push_event_types(field, project_id, new_identifier):
    """Classifies an `issue_activity` dict's `field` (plus, for a `state`
    field, whether the transition lands on a `group="completed"` state)
    into the `push_*` preference field name(s) it maps to - called from
    `plane.bgtasks.notification_task.notifications` at the exact same
    point that function computes its own, structurally identical,
    EMAIL-side `send_email` decision, but this only classifies (never
    reads a `push_*` preference field itself - that gating is entirely
    `send_push_notification`'s job, see this module's own docstring for
    why keeping it in one place matters for exigence 3).

    A `state` field can map to BOTH `state_change` AND `issue_completed`
    at once (mirrors the OR-shaped email gating: an activity that is a
    state change AND happens to complete the issue should fire push if
    EITHER toggle is on) - `send_push_notification` allows the send if
    ANY of the returned event types has its `push_<type>` preference
    enabled.
    """
    if field == "state":
        event_types = ["state_change"]
        if State.objects.filter(project_id=project_id, pk=new_identifier, group="completed").exists():
            event_types.append("issue_completed")
        return event_types
    if field == "comment":
        return ["comment"]
    return ["property_change"]


def _check_push_rate_limit(user_id):
    """Returns False (caller should skip sending) once a user has had
    `MAX_PUSH_PER_MINUTE_PER_USER` push notifications attempted within the
    current minute. Fails open (allows sending) if Redis is briefly
    unavailable - see module docstring."""
    try:
        ri = redis_instance()
        key = f"push_notification_rate:{user_id}:{int(time.time() // 60)}"
        count = ri.incr(key)
        if count == 1:
            ri.expire(key, 60)
        return count <= MAX_PUSH_PER_MINUTE_PER_USER
    except Exception as e:
        log_exception(e, warning=True)
        return True


def _is_within_quiet_hours(preference, user):
    """Exigence 2/4 - converts "now" into the user's own local time via
    `user.user_timezone` (the exact `pytz.timezone(user.user_timezone or
    "UTC")` idiom `plane.bgtasks.digest_task._maybe_enqueue_one` already
    established for per-user local-time scheduling in this fork), then
    checks containment in `[quiet_hours_start, quiet_hours_end)`, wrapping
    past midnight when `start > end` (e.g. 20:00 -> 08:00)."""
    if not preference.quiet_hours_enabled:
        return False
    start = preference.quiet_hours_start
    end = preference.quiet_hours_end
    if start is None or end is None:
        return False
    if start == end:
        # Degenerate zero-width window - almost certainly a UI input
        # mistake rather than a deliberate "quiet all day, every day"
        # request. Treat as "not in quiet hours" so a misconfiguration
        # cannot silently kill push forever (fail toward still notifying,
        # not toward permanent silence).
        return False

    tz = pytz.timezone(user.user_timezone or "UTC")
    now_local_time = timezone.now().astimezone(tz).time()

    if start < end:
        return start <= now_local_time < end
    return now_local_time >= start or now_local_time < end


def _is_active_project_member(project_id, user_id):
    """Exigence 7 - re-verify membership at SEND time, not just at the
    event-creation time `plane.bgtasks.notification_task.notifications`
    already filtered against. Deliberately the exact same `ProjectMember`
    + `is_active=True` idiom that function itself uses to compute its own
    `project_members` list, rather than a new/different membership check."""
    return ProjectMember.objects.filter(project_id=project_id, member_id=user_id, is_active=True).exists()


def _push_notifications_enabled():
    """Instance-wide kill switch (exigence 10) - re-checked live on every
    single send attempt, not cached at subscribe time, matching
    `ENABLE_SCIM`'s own "protocol layer re-checks the flag live" precedent
    (`plane.scim.authentication.SCIMTokenAuthentication`)."""
    (value,) = get_configuration_value([{"key": "PUSH_NOTIFICATIONS_ENABLED", "default": "0"}])
    return str(value) == "1"


def send_web_push_to_subscription(subscription, title, body, url, config, vapid):
    """Sends a single Web Push message via `pywebpush`. Returns `True` on
    success, `False` on any failure.

    Exigence 2 - a 410/404 ("Gone"/"Not Found", the standard Web Push
    signal that a subscription's push service endpoint no longer exists -
    the user revoked browser permission, uninstalled/cleared the browser,
    etc.) auto-deactivates this exact subscription (`is_active=False`) and
    is NOT retried - there is no Celery `retry=True`/`countdown` on this
    task, so a dead endpoint is simply marked dead once, not hammered.
    Any other failure (bad credentials, unreachable endpoint, timeout) is
    logged (exigence 11) but leaves the subscription active - a
    transient failure should not permanently revoke a subscription that
    may well work again on the next attempt.
    """
    payload = json.dumps({"title": title, "body": body, "url": url})
    vapid_claims = {"sub": f"mailto:{config.vapid_admin_email or _FALLBACK_VAPID_ADMIN_EMAIL}"}
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh_key, "auth": subscription.auth_key},
            },
            data=payload,
            vapid_private_key=vapid,
            vapid_claims=vapid_claims,
            ttl=86400,
        )
        PushNotificationSubscription.objects.filter(pk=subscription.pk).update(last_used_at=timezone.now())
        return True
    except WebPushException as e:
        status_code = getattr(e.response, "status_code", None)
        if status_code in (404, 410):
            PushNotificationSubscription.objects.filter(pk=subscription.pk).update(is_active=False)
            logger.info(f"Deactivated expired push subscription {subscription.pk} (status {status_code})")
        else:
            log_exception(e, warning=True)
        return False
    except Exception as e:
        log_exception(e, warning=True)
        return False


def _send_fcm_push(subscription, title, body, url, config):
    """STUB - FCM HTTP v1 sending is deliberately NOT implemented. See
    `plane.license.models.push_notification.PushNotificationConfig`'s
    module docstring ("FCM/APNS STUB DECISION") for the full rationale:
    categories 12 features 1/2/5 (the mobile app itself) were confirmed
    as total fabrication - no mobile client exists anywhere in this repo
    or its history that could ever hold a real FCM registration token, so
    a fully-wired `firebase-admin`/HTTP v1 client would be untestable dead
    code. This logs (so the gap is visible, never silently swallowed) and
    returns `False`."""
    logger.warning(
        f"FCM push to subscription {subscription.pk} skipped - FCM HTTP v1 sending is not "
        "implemented in this fork (no real mobile client exists anywhere to exercise it)."
    )
    return False


def _send_apns_push(subscription, title, body, url, config):
    """STUB - APNs HTTP/2 sending is deliberately NOT implemented. See
    `_send_fcm_push` above for the identical rationale (mobile app itself
    does not exist in this fork)."""
    logger.warning(
        f"APNs push to subscription {subscription.pk} skipped - APNs HTTP/2 sending is not "
        "implemented in this fork (no real mobile client exists anywhere to exercise it)."
    )
    return False


@shared_task
def send_push_notification(receiver_id, project_id, event_types, title, body, url):
    """
    Args:
        receiver_id: `User.id` of the notification's recipient.
        project_id: `Project.id` the underlying event belongs to, or
            `None` for an event with no project scope - used for the
            send-time membership re-check (exigence 7); when `None` the
            membership check is skipped entirely (there is no project to
            be a member of).
        event_types: list of `UserNotificationPreference` `push_*`
            suffixes (e.g. `["state_change"]`,
            `["state_change", "issue_completed"]`, `["comment"]`,
            `["property_change"]`, `["mention"]`). ANY matching enabled
            toggle allows the send - mirrors the OR-shaped gating
            `plane.bgtasks.notification_task.notifications` already uses
            for the equivalent EMAIL decision (a state-change activity
            that also happens to complete the issue can fire on either
            `push_state_change` or `push_issue_completed`).
        title / body / url: pre-rendered payload - computed once by the
            caller (which already has the actor/issue/project objects in
            scope) rather than re-fetched here, keeping this task's own
            query cost limited to exactly what gating needs.

    Never raises past its own boundary (exigence 11 - a push failure must
    never affect the in-app/email channels, which have already been
    committed by the time this task runs) and never blocks the HTTP
    request that triggered the underlying event, since it only ever runs
    via `.delay()`.
    """
    try:
        if not _push_notifications_enabled():
            return

        preference = UserNotificationPreference.objects.filter(user_id=receiver_id).first()
        if preference is None or not preference.push_enabled:
            return

        if not any(getattr(preference, f"push_{event_type}", False) for event_type in event_types):
            return

        user = User.objects.filter(pk=receiver_id).first()
        if user is None:
            return

        if _is_within_quiet_hours(preference, user):
            # Exigence 4 - the in-app `Notification` row was already
            # created (unconditionally) by the caller before this task
            # was even enqueued - only the push fan-out is suppressed
            # here.
            return

        if project_id and not _is_active_project_member(project_id, receiver_id):
            return

        if not _check_push_rate_limit(receiver_id):
            logger.info(f"Push rate limit exceeded for user {receiver_id}, dropping push notification")
            return

        subscriptions = list(PushNotificationSubscription.objects.filter(user_id=receiver_id, is_active=True))
        if not subscriptions:
            return

        config = PushNotificationConfig.get_solo()
        vapid = build_vapid_from_private_key(config.vapid_private_key)

        web_subscriptions = [s for s in subscriptions if s.device_type == PushNotificationSubscription.DeviceType.WEB]
        android_subscriptions = [
            s for s in subscriptions if s.device_type == PushNotificationSubscription.DeviceType.ANDROID
        ]
        ios_subscriptions = [s for s in subscriptions if s.device_type == PushNotificationSubscription.DeviceType.IOS]

        if web_subscriptions and vapid is None:
            logger.warning(
                "Push notification requested but no VAPID private key is configured "
                "- skipping Web Push send(s)."
            )
            web_subscriptions = []

        if not web_subscriptions and not android_subscriptions and not ios_subscriptions:
            return

        # Exigence 6 - deliver to every one of the user's active
        # subscriptions "en parallele" rather than sequentially.
        # `ThreadPoolExecutor` is proportionate here (`pywebpush.webpush`
        # is a blocking `requests` call, and a real user has a handful of
        # devices, not hundreds) - no need for a separate Celery subtask
        # per subscription.
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = []
            for subscription in web_subscriptions:
                futures.append(
                    executor.submit(send_web_push_to_subscription, subscription, title, body, url, config, vapid)
                )
            for subscription in android_subscriptions:
                futures.append(executor.submit(_send_fcm_push, subscription, title, body, url, config))
            for subscription in ios_subscriptions:
                futures.append(executor.submit(_send_apns_push, subscription, title, body, url, config))

            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as e:
                    # One subscription's failure must never affect
                    # delivery to the user's other subscriptions.
                    log_exception(e, warning=True)
    except Exception as e:
        log_exception(e)
        return
