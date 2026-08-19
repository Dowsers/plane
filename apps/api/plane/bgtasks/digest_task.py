# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Celery beat scheduling + generation/delivery orchestration for category 9
(AI features, docs/feature-specs/09-ai-features.md in plane-selfhost),
feature 5 - "Digest periodique automatise". See
`plane.utils.digest_content` for the pure aggregation/rendering logic and
`plane.db.models.digest` for the model shapes.

PER-USER-TIMEZONE POLLING (genuinely new scheduling infrastructure in this
fork - every other Celery beat entry in `plane.celery` is a flat UTC
crontab sweep with no per-user local-time concept):

`enqueue_due_digests` runs every `DIGEST_POLL_WINDOW_MINUTES` minutes
(matches its own beat schedule entry in `plane.celery`). On each run, for
every enabled `DigestPreference` whose workspace hasn't killed the
feature, it converts "now" into that ONE user's local time via
`user.user_timezone` (never the workspace's), and only enqueues a
generation task if the local time-of-day falls within the current polling
window (`_time_matches_window`) - and, for `WEEKLY`, only on the matching
`day_of_week` (Python `date.weekday()` convention: Monday=0..Sunday=6).
The matched window's `(period_start, period_end)` is derived
deterministically from "today's" (user-local) scheduled instant converted
to UTC, so polling the same window more than once (e.g. two beat ticks 15
minutes apart both falling inside a 30-minute window) computes the exact
same bounds both times - `DigestRun`'s own DB unique constraint (not any
locking here) is what makes the second attempt a clean no-op.

CATCH-UP / STALENESS (exigence 8): `is_period_stale` is a simple age check
on the computed `period_end` - if generation is attempted (whether via the
beat path or a direct call) for a period whose end is already more than
`DIGEST_STALE_MAX_AGE` in the past, it is skipped entirely (no `DigestRun`
row is even created) rather than sending a very-late digest. This is
deliberately simple (per the explicit product decision already made for
this feature) rather than a full historical-backfill-then-cap mechanism.
"""

from datetime import datetime, timedelta

import pytz
from celery import shared_task
from django.core.mail import EmailMultiAlternatives, get_connection
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from plane.db.models import DigestFrequency, DigestPreference, DigestRun, DigestRunStatus
from plane.license.utils.instance_value import get_email_configuration
from plane.utils.digest_content import aggregate_digest_content, persist_digest_items, render_digest
from plane.utils.exception_logger import log_exception

# How often `enqueue_due_digests` itself is polled (see its beat schedule
# entry in `plane.celery`) - also the width of the local-time "did we just
# cross the user's configured time_of_day" matching window.
DIGEST_POLL_WINDOW_MINUTES = 30

# Exigence 8 - "ignore explicitement si la fenetre est depassee de plus de
# 24h (choix configurable)". Not exposed as a runtime setting - a single,
# documented constant, matching the fork's convention of hardcoding a
# single spec-given number when no other feature needs it configurable.
DIGEST_STALE_MAX_AGE = timedelta(hours=24)


def _time_matches_window(local_time, target_time, window_minutes) -> bool:
    """True if `local_time` is within `[target_time, target_time +
    window_minutes)`, wrapping around midnight."""
    now_minutes = local_time.hour * 60 + local_time.minute
    target_minutes = target_time.hour * 60 + target_time.minute
    diff = (now_minutes - target_minutes) % (24 * 60)
    return diff < window_minutes


def _compute_period(preference, local_now):
    """Deterministically derives `(period_start, period_end)` in UTC from
    "today" (in the user's local timezone) at the preference's configured
    `time_of_day`. Reproducible across repeated polls within the same
    window - see module docstring."""
    tz = local_now.tzinfo
    target_naive = datetime.combine(local_now.date(), preference.time_of_day)
    target_local = tz.localize(target_naive) if hasattr(tz, "localize") else target_naive.replace(tzinfo=tz)
    period_end = target_local.astimezone(pytz.UTC)
    delta = timedelta(days=7) if preference.frequency == DigestFrequency.WEEKLY else timedelta(days=1)
    period_start = period_end - delta
    return period_start, period_end


def is_period_stale(period_end, now=None) -> bool:
    now = now or timezone.now()
    return (now - period_end) > DIGEST_STALE_MAX_AGE


@shared_task
def enqueue_due_digests():
    """Beat-scheduled (every `DIGEST_POLL_WINDOW_MINUTES` minutes, see
    `plane.celery`). Exigence 13 - a workspace with `digest_feature_enabled
    =False` is filtered out here at the query level, so no generation task
    is ever enqueued for any of its members regardless of their individual
    `DigestPreference`.
    """
    now_utc = timezone.now()
    preferences = DigestPreference.objects.filter(
        is_enabled=True, workspace__digest_feature_enabled=True, user__is_active=True
    ).select_related("user", "workspace")

    for preference in preferences:
        try:
            _maybe_enqueue_one(preference, now_utc)
        except Exception as e:
            log_exception(e)


def _maybe_enqueue_one(preference, now_utc):
    user = preference.user
    tz = pytz.timezone(user.user_timezone or "UTC")
    local_now = now_utc.astimezone(tz)

    if preference.frequency == DigestFrequency.WEEKLY:
        if preference.day_of_week is None or local_now.weekday() != preference.day_of_week:
            return

    if not _time_matches_window(local_now.time(), preference.time_of_day, DIGEST_POLL_WINDOW_MINUTES):
        return

    period_start, period_end = _compute_period(preference, local_now)
    generate_and_send_digest.delay(str(preference.id), period_start.isoformat(), period_end.isoformat())


@shared_task
def generate_and_send_digest(preference_id, period_start_iso, period_end_iso):
    """Async wrapper - the real logic lives in `run_digest_generation`,
    which never raises past this boundary (defense in depth, same
    convention as `plane.bgtasks.issue_comment_summary_task`).
    """
    try:
        preference = DigestPreference.objects.select_related("user", "workspace").filter(pk=preference_id).first()
        if preference is None or not preference.is_enabled or not preference.workspace.digest_feature_enabled:
            return

        period_start = parse_datetime(period_start_iso)
        period_end = parse_datetime(period_end_iso)

        if is_period_stale(period_end):
            return

        run_digest_generation(preference, period_start, period_end)
    except Exception as e:
        log_exception(e)


def run_digest_generation(preference, period_start, period_end):
    """Core generate -> persist -> render -> deliver pipeline, given
    already-resolved period bounds. Used both by the scheduled
    `generate_and_send_digest` task and the synchronous preview endpoint
    (`plane.app.views.digest.UserDigestPreviewEndpoint`). Idempotent via
    `DigestRun`'s own DB unique constraint on `(user, workspace,
    period_start, period_end)` (exigence 7) - `get_or_create` turns a
    duplicate call for the exact same period into a no-op that returns the
    existing run rather than regenerating or raising.
    """
    digest_run, created = DigestRun.objects.get_or_create(
        user=preference.user,
        workspace=preference.workspace,
        period_start=period_start,
        period_end=period_end,
        defaults={"frequency": preference.frequency, "status": DigestRunStatus.PENDING},
    )
    if not created:
        return digest_run

    try:
        items = aggregate_digest_content(preference.user, preference.workspace, preference, period_start, period_end)
    except Exception as e:
        log_exception(e)
        digest_run.status = DigestRunStatus.FAILED
        digest_run.save(update_fields=["status", "updated_at"])
        return digest_run

    if not items:
        # Exigence 6 - nothing qualifying, nothing sent, no "empty digest"
        # notification of any kind.
        digest_run.status = DigestRunStatus.SKIPPED_EMPTY
        digest_run.save(update_fields=["status", "updated_at"])
        return digest_run

    persist_digest_items(digest_run, items)

    summary_text, generation_method = render_digest(preference.workspace, items)
    digest_run.summary_text = summary_text
    digest_run.generation_method = generation_method
    digest_run.item_count = len(items)
    digest_run.status = DigestRunStatus.GENERATED
    digest_run.save(update_fields=["summary_text", "generation_method", "item_count", "status", "updated_at"])

    _deliver_digest(preference, digest_run)
    return digest_run


def _deliver_digest(preference, digest_run):
    """In-app "delivery" (exigence 9) has no extra side effect beyond the
    `DigestRun` row itself - it IS the new, independent "Digests" surface
    (`GET .../users/me/digests/`), deliberately not a `Notification` row in
    the real-time feed. Email delivery failure is caught and logged but
    never re-raised - a transport error must not corrupt an already
    successfully generated digest.
    """
    delivered = preference.send_in_app

    if preference.send_email and preference.user.email:
        try:
            _send_digest_email(preference, digest_run)
            delivered = True
        except Exception as e:
            log_exception(e)

    if delivered:
        digest_run.status = DigestRunStatus.SENT
        digest_run.sent_at = timezone.now()
        digest_run.save(update_fields=["status", "sent_at", "updated_at"])


def _send_digest_email(preference, digest_run):
    """Bespoke direct-send email, same shape/reasoning as
    `plane.bgtasks.project_update_task._send_plain_email` - neither of this
    fork's two existing email-sending precedents
    (`email_notification_task.send_email_notification`, hardcoded to a
    single Issue-shaped context; `project_update_task._send_plain_email`,
    truly bespoke plain text) is a drop-in fit for a cross-entity digest,
    so this reuses only the shared low-level primitives
    (`get_email_configuration`/`EmailMultiAlternatives`)."""
    (EMAIL_HOST, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD, EMAIL_PORT, EMAIL_USE_TLS, EMAIL_USE_SSL, EMAIL_FROM) = (
        get_email_configuration()
    )

    frequency_label = "Weekly" if digest_run.frequency == DigestFrequency.WEEKLY else "Daily"
    subject = f"{frequency_label} digest for {preference.workspace.name} - {digest_run.item_count} update(s)"

    def _to_html_line(line):
        if line.startswith("## "):
            return f"<b>{line[3:]}</b>"
        if line.startswith("### "):
            return f"<i>{line[4:]}</i>"
        return line

    html_body = "<br>".join(_to_html_line(line) for line in digest_run.summary_text.splitlines())

    connection = get_connection(
        host=EMAIL_HOST,
        port=int(EMAIL_PORT),
        username=EMAIL_HOST_USER,
        password=EMAIL_HOST_PASSWORD,
        use_tls=EMAIL_USE_TLS == "1",
        use_ssl=EMAIL_USE_SSL == "1",
    )
    msg = EmailMultiAlternatives(
        subject=subject,
        body=digest_run.summary_text,
        from_email=EMAIL_FROM,
        to=[preference.user.email],
        connection=connection,
    )
    msg.attach_alternative(html_body, "text/html")
    msg.send()


def generate_preview_digest(preference):
    """Synchronous "envoyer un apercu" generation (exigence 15) -
    `POST .../users/me/digests/preview/`. Uses "right now" as `period_end`
    (never stale by construction) and the preference's own frequency for
    the lookback window, so distinct preview clicks naturally get distinct
    period bounds (down to microsecond precision) and are never
    deduplicated against each other or against a real scheduled run.
    """
    period_end = timezone.now()
    delta = timedelta(days=7) if preference.frequency == DigestFrequency.WEEKLY else timedelta(days=1)
    period_start = period_end - delta
    return run_digest_generation(preference, period_start, period_end)
