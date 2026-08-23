# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import os
import logging

# Third party imports
from celery import Celery
from pythonjsonlogger.jsonlogger import JsonFormatter
from celery.signals import after_setup_logger, after_setup_task_logger
from celery.schedules import crontab

# Module imports
from plane.settings.redis import redis_instance

# Set the default Django settings module for the 'celery' program.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "plane.settings.production")

ri = redis_instance()

app = Celery("plane")

# Using a string here means the worker will not have to
# pickle the object when using Windows.
app.config_from_object("django.conf:settings", namespace="CELERY")

app.conf.beat_schedule = {
    # Intra day recurring jobs
    "check-every-five-minutes-to-send-email-notifications": {
        "task": "plane.bgtasks.email_notification_task.stack_email_notification",
        "schedule": crontab(minute="*/5"),  # Every 5 minutes
    },
    "run-every-6-hours-for-instance-trace": {
        "task": "plane.license.bgtasks.tracer.instance_traces",
        "schedule": crontab(hour="*/6", minute=0),  # Every 6 hours
    },
    # Occurs once every day
    "check-every-day-to-delete-hard-delete": {
        "task": "plane.bgtasks.deletion_task.hard_delete",
        "schedule": crontab(hour=0, minute=0),  # UTC 00:00
    },
    "check-every-day-to-archive-and-close": {
        "task": "plane.bgtasks.issue_automation_task.archive_and_close_old_issues",
        "schedule": crontab(hour=1, minute=0),  # UTC 01:00
    },
    "check-every-day-to-delete_exporter_history": {
        "task": "plane.bgtasks.exporter_expired_task.delete_old_s3_link",
        "schedule": crontab(hour=1, minute=30),  # UTC 01:30
    },
    "check-every-day-to-delete-file-asset": {
        "task": "plane.bgtasks.file_asset_task.delete_unuploaded_file_asset",
        "schedule": crontab(hour=2, minute=0),  # UTC 02:00
    },
    "check-every-day-to-delete-api-logs": {
        "task": "plane.bgtasks.cleanup_task.delete_api_logs",
        "schedule": crontab(hour=2, minute=30),  # UTC 02:30
    },
    "check-every-day-to-delete-email-notification-logs": {
        "task": "plane.bgtasks.cleanup_task.delete_email_notification_logs",
        "schedule": crontab(hour=2, minute=45),  # UTC 02:45
    },
    "check-every-day-to-delete-page-versions": {
        "task": "plane.bgtasks.cleanup_task.delete_page_versions",
        "schedule": crontab(hour=3, minute=0),  # UTC 03:00
    },
    "check-every-day-to-delete-issue-description-versions": {
        "task": "plane.bgtasks.cleanup_task.delete_issue_description_versions",
        "schedule": crontab(hour=3, minute=15),  # UTC 03:15
    },
    "check-every-day-to-delete-webhook-logs": {
        "task": "plane.bgtasks.cleanup_task.delete_webhook_logs",
        "schedule": crontab(hour=3, minute=30),  # UTC 03:30
    },
    "check-every-day-to-delete-exporter-history": {
        "task": "plane.bgtasks.exporter_expired_task.delete_old_s3_link",
        "schedule": crontab(hour=3, minute=45),  # UTC 03:45
    },
    # Recurring cycle auto-scheduling - see
    # docs/feature-specs/02-cycles-intake.md in plane-selfhost.
    "check-every-hour-for-cycle-auto-schedule": {
        "task": "plane.bgtasks.cycle_auto_schedule_task.cycle_auto_schedule_task",
        "schedule": crontab(minute=0),  # every hour, on the hour
    },
    "check-every-hour-for-cycle-auto-rollover": {
        "task": "plane.bgtasks.cycle_auto_rollover_task.cycle_auto_rollover_task",
        "schedule": crontab(minute=15),  # every hour, shortly after scheduling runs
    },
    # Recurring issue templates - see
    # docs/feature-specs/06-automation-workflow-sla.md ("Work items
    # récurrents", section 3) in plane-selfhost.
    "check-every-hour-for-recurring-issue-generation": {
        "task": "plane.bgtasks.recurring_issue_task.generate_recurring_issues",
        "schedule": crontab(minute=0),  # every hour, on the hour
    },
    # Intake responsibility escalation - see
    # docs/feature-specs/02-cycles-intake.md in plane-selfhost.
    "check-every-5-minutes-for-intake-escalations": {
        "task": "plane.bgtasks.intake_escalation_task.check_intake_escalations",
        "schedule": crontab(minute="*/5"),
    },
    # Structured project status update reminders - see
    # docs/feature-specs/03-projects-roadmaps-initiatives.md in
    # plane-selfhost.
    "check-every-hour-for-project-update-reminders": {
        "task": "plane.bgtasks.project_update_task.send_project_update_reminders",
        "schedule": crontab(minute=30),  # every hour, offset from other hourly tasks
    },
    # SLA policy risk-status recalculation - see
    # docs/feature-specs/06-automation-workflow-sla.md ("Politiques de
    # SLA", section 2) in plane-selfhost.
    "check-every-5-minutes-for-sla-recalculation": {
        "task": "plane.bgtasks.sla_task.recalculate_sla_statuses_task",
        "schedule": crontab(minute="*/5"),
    },
    # Category 7 integration event log retention (Sentry, exigence 8) -
    # see docs/feature-specs/07-integrations-git.md in plane-selfhost.
    "check-every-day-to-delete-integration-event-logs": {
        "task": "plane.bgtasks.cleanup_task.delete_integration_event_logs",
        "schedule": crontab(hour=4, minute=0),  # UTC 04:00, after the other daily cleanup tasks
    },
    # Automated periodic digest ("Pulse" equivalent) - see
    # docs/feature-specs/09-ai-features.md ("5. Digest periodique
    # automatise") in plane-selfhost. Unlike every other entry above (flat
    # UTC crontab sweeps), this polls every 30 minutes and itself computes,
    # per `DigestPreference`, whether THAT user's local time-of-day
    # (`user.user_timezone`) currently falls in the matching window - see
    # `plane.bgtasks.digest_task` module docstring.
    "check-every-30-minutes-for-due-digests": {
        "task": "plane.bgtasks.digest_task.enqueue_due_digests",
        "schedule": crontab(minute="*/30"),
    },
    "check-every-day-to-delete-old-digest-runs": {
        "task": "plane.bgtasks.cleanup_task.delete_old_digest_runs",
        "schedule": crontab(hour=4, minute=15),  # UTC 04:15, after the other daily cleanup tasks
    },
    # In-app AI chat assistant proposal expiry - see
    # docs/feature-specs/09-ai-features.md ("3. Assistant de chat IA
    # in-app", exigence 8) in plane-selfhost. Runs more often than the
    # daily cleanup sweeps above since a proposal becoming un-approvable
    # exactly on time (not up to a day late) is user-facing behavior, not
    # just housekeeping.
    "check-every-hour-to-expire-ai-change-proposals": {
        "task": "plane.bgtasks.cleanup_task.expire_ai_change_proposals",
        "schedule": crontab(minute=45),  # every hour, offset from other hourly tasks
    },
    # Category 11 (docs/feature-specs/11-admin-security-sso.md in
    # plane-selfhost), features 3+5 merged, exigence 7 - workspace audit
    # log retention purge (`AUDIT_LOG_RETENTION_DAYS`, default 90 days).
    "check-every-day-to-purge-expired-audit-logs": {
        "task": "plane.bgtasks.cleanup_task.purge_expired_audit_logs",
        "schedule": crontab(hour=4, minute=30),  # UTC 04:30, after the other daily cleanup tasks
    },
    # Category 11 (docs/feature-specs/11-admin-security-sso.md in
    # plane-selfhost), feature 1 "SSO SAML 2.0 natif", exigence 8 - purge
    # of consumed SAML assertion-replay ledger rows past their own
    # NotOnOrAfter.
    "check-every-day-to-purge-expired-saml-assertion-replays": {
        "task": "plane.bgtasks.cleanup_task.purge_expired_saml_assertion_replays",
        "schedule": crontab(hour=4, minute=45),  # UTC 04:45, after the other daily cleanup tasks
    },
}


# Setup logging
@after_setup_logger.connect
def setup_loggers(logger, *args, **kwargs):
    formatter = JsonFormatter('"%(levelname)s %(asctime)s %(module)s %(name)s %(message)s')
    handler = logging.StreamHandler()
    handler.setFormatter(fmt=formatter)
    logger.addHandler(handler)


@after_setup_task_logger.connect
def setup_task_loggers(logger, *args, **kwargs):
    formatter = JsonFormatter('"%(levelname)s %(asctime)s %(module)s %(name)s %(message)s')
    handler = logging.StreamHandler()
    handler.setFormatter(fmt=formatter)
    logger.addHandler(handler)


# Load task modules from all registered Django app configs.
app.autodiscover_tasks()

app.conf.beat_scheduler = "django_celery_beat.schedulers.DatabaseScheduler"
