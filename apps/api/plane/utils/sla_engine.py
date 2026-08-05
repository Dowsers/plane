# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Matching + due-date calculation for SLA policies - see
docs/feature-specs/06-automation-workflow-sla.md ("Politiques de SLA",
section 2) in plane-selfhost. Called asynchronously only - see
plane/bgtasks/sla_task.py for the Celery dispatch and the hook point in
plane/bgtasks/issue_activities_task.py.

RESOLVED AMBIGUITY - achieved vs. breached after the due date (exigence 6):
the spec's own wording is self-contradictory read literally: "Si elle passe
dans un groupe completed avant l'echeance, le SLA passe a achieved ...
Apres l'echeance, il passe a breached" could describe either (a) a single
issue that completes late transitioning straight to `breached` despite
being done, or (b) an issue that was already `breached` while still open
staying `breached` once it later completes. This implementation takes
reading (a): completing **after** `due_at` is `breached`, not a late
`achieved`. Rationale: `achieved`/`breached` must be mutually exclusive for
the compliance report (exigence 11 - "issues respectees vs. en echec de
SLA") to mean anything; a status named `achieved` that can also mean
"finished, but late" would make that report silently overcount compliance.
`breached` already unambiguously means "missed the deadline", which stays
true regardless of whether the issue eventually got finished - so
`breached` wins whenever `due_at` has passed, and `achieved` is reserved
for genuinely on-time completions.

RESOLVED SIMPLIFICATION - `response`-type entries use the same
achieved/breached test as `resolution`-type ones (based on the issue's
*current state group* reaching `completed`), not the response-specific
event described in exigence 3 ("premier changement d'etat hors backlog, ou
premiere assignation"). The `IssueSLA` schema (both in the spec and as
built here) has no dedicated "first response happened at" timestamp field
to anchor that distinct event to, and `due_at` itself is anchored to
`issue.created_at` for both types (see `create_or_update_sla_entries`
below) rather than to a first-response event - so a `response` entry is
"met" by the same completed-state-group signal as a `resolution` entry.
This is a known v1 simplification, not a fully faithful implementation of
exigence 3's "first response" semantics; flagged here and in the feature's
delivery report rather than silently narrowed.
"""

from datetime import timedelta

from django.utils import timezone

from plane.db.models.state import StateGroup

# Only these two transitions get a Notification per exigence 8 ("on_track
# -> at_risk", "at_risk -> breached" - "pas de spam a chaque recalcul si le
# statut n'a pas change"). Reaching achieved/cancelled/paused never fires
# one in this v1.
NOTIFIABLE_STATUSES = {"at_risk", "breached"}

# Terminal statuses are never recalculated again once reached (mirrors the
# non-terminal filter given for the periodic task).
TERMINAL_STATUSES = {"breached", "achieved", "cancelled"}

# breached > at_risk > on_track precedence for Issue.sla_risk_level
# (paused/achieved/cancelled entries never contribute a risk level).
_RISK_RANK = {"on_track": 0, "at_risk": 1, "breached": 2}


def _issue_excluded_from_sla(issue):
    """Archived and draft issues never get SLA entries created or
    recalculated (exigence 12) - mirrors the same exclusions
    `Issue.issue_objects` (the "real, visible issues" manager) already
    encodes, rather than hand-rolling a different filter."""
    return (
        issue.is_draft
        or issue.archived_at is not None
        or (issue.project_id is not None and issue.project.archived_at is not None)
    )


def _policy_matches_issue(policy, issue, issue_label_ids, issue_assignee_ids, issue_state_group):
    if not policy.applies_to_all_projects:
        project_ids = {p.id for p in policy.projects.all()}
        # Empty `projects` + `applies_to_all_projects=False` matches
        # nothing - see SLAPolicy's docstring for why this deliberately
        # does NOT fall back to "empty means all".
        if issue.project_id not in project_ids:
            return False

    if policy.priority_filter and issue.priority not in policy.priority_filter:
        return False

    policy_label_ids = {label.id for label in policy.labels.all()}
    if policy_label_ids and not (issue_label_ids & policy_label_ids):
        return False

    policy_assignee_ids = {user.id for user in policy.assignees.all()}
    if policy_assignee_ids and not (issue_assignee_ids & policy_assignee_ids):
        return False

    if policy.state_group_filter and issue_state_group not in policy.state_group_filter:
        return False

    return True


def find_matching_policy(issue):
    """Returns the single best-matching active `SLAPolicy` for `issue`, or
    `None`. All criteria are AND-combined; an empty list-shaped criterion
    matches everything (exigence 2). Precedence: lowest `sort_order` wins,
    ties broken by most-recently-created (exigence 4) - achieved here by
    ordering the candidate query itself that way and returning the first
    match, rather than collecting all matches and re-sorting."""
    from plane.db.models import SLAPolicy

    if issue.project_id is None:
        return None

    issue_label_ids = set(issue.labels.values_list("id", flat=True))
    issue_assignee_ids = set(issue.assignees.values_list("id", flat=True))
    issue_state_group = issue.state.group if issue.state_id else None

    candidates = (
        SLAPolicy.objects.filter(workspace_id=issue.workspace_id, is_active=True)
        .order_by("sort_order", "-created_at")
        .prefetch_related("projects", "labels", "assignees")
    )

    for policy in candidates:
        if _policy_matches_issue(policy, issue, issue_label_ids, issue_assignee_ids, issue_state_group):
            return policy
    return None


def create_or_update_sla_entries(issue):
    """Called asynchronously (see plane/bgtasks/sla_task.py::sync_issue_sla)
    at issue creation and whenever a matching-relevant field changes
    (exigence 5). Creates one `IssueSLA` row per delay type the matching
    policy has configured; both `response` and `resolution` due dates are
    anchored to `issue.created_at` (exigence 3's literal "delai entre
    creation de l'issue et ..." wording, applied uniformly to keep the due
    date a fixed, never-recomputed value once set).

    KNOWN LIMITATION: if an issue's matching policy changes later (e.g. a
    priority edit makes a *different* still-active policy win, rather than
    the previous one being deactivated/deleted), the old policy's
    `IssueSLA` rows are left exactly as they were - a new set of rows is
    created for the newly-matching policy, and both continue to be
    recalculated independently. `Issue.sla_risk_level` still reflects the
    single most urgent status across all of them, so a badge always shows
    correctly, but the compliance report could then count two policies'
    worth of entries for one issue. Retiring/superseding the old entries
    would require deciding what the (spec-listed but otherwise
    never-triggered - see sla.py's `IssueSLA.STATUS_CHOICES` docstring)
    `paused` status is supposed to mean, which is exactly the kind of
    invented-not-specified behavior this implementation avoids; documented
    here as a deliberate v1 gap rather than silently guessed at.
    """
    from plane.db.models import IssueSLA

    if _issue_excluded_from_sla(issue):
        return

    policy = find_matching_policy(issue)
    if policy is None:
        return

    for sla_type, minutes in (
        ("response", policy.response_time_minutes),
        ("resolution", policy.resolution_time_minutes),
    ):
        if not minutes:
            continue
        IssueSLA.objects.get_or_create(
            issue=issue,
            sla_policy=policy,
            sla_type=sla_type,
            defaults={
                "project_id": issue.project_id,
                "workspace_id": issue.workspace_id,
                "due_at": issue.created_at + timedelta(minutes=minutes),
            },
        )


def _elapsed_percent(created_at, due_at, now):
    total_seconds = (due_at - created_at).total_seconds()
    if total_seconds <= 0:
        return 100.0
    return ((now - created_at).total_seconds() / total_seconds) * 100


def _create_breach_notification(sla, issue):
    from plane.db.models import Notification

    verb = "at risk of breaching" if sla.status == "at_risk" else "breached"
    sla_type_label = "Response" if sla.sla_type == "response" else "Resolution"
    title = f'{sla_type_label} SLA {verb} for "{issue.name}"'
    message = f"The {sla.sla_type} SLA for this issue is {verb}."

    # Notify current assignees plus the issue's creator (if not already an
    # assignee) - the spec's user story 3 speaks of a "responsable
    # d'equipe" without defining who that is in a Community-tier workspace
    # with no native Teamspaces (see spec's own open question 1), so this
    # targets the people most directly positioned to act on the issue
    # itself rather than inventing a team-lead concept that doesn't exist
    # anywhere else in this codebase.
    receiver_ids = set(issue.assignees.values_list("id", flat=True))
    if issue.created_by_id:
        receiver_ids.add(issue.created_by_id)
    if not receiver_ids:
        return

    Notification.objects.bulk_create(
        [
            Notification(
                workspace_id=issue.workspace_id,
                project_id=issue.project_id,
                entity_identifier=sla.id,
                # See docs/feature-specs/06-automation-workflow-sla.md in
                # plane-selfhost - FYI for the frontend brief: this
                # `entity_name` is new and needs its own render branch in
                # the notification sidebar's per-type switch (e.g.
                # apps/web/core/components/workspace-notifications/sidebar/
                # notification-card/item.tsx as of this writing), same as
                # "INTAKE_ISSUE"/"VIEW_SUBSCRIPTION" needed when they were
                # added - it is not handled by this backend change.
                entity_name="ISSUE_SLA",
                title=title,
                message=[{"data": message}],
                message_stripped=message,
                sender=f"in_app:sla:{sla.status}",
                receiver_id=receiver_id,
            )
            for receiver_id in receiver_ids
        ]
    )


def _maybe_notify(sla, issue):
    """Exactly one notification per threshold crossing (exigence 8):
    `last_notified_status` records the last status a Notification was
    actually created for, so a status that hasn't moved on from it since
    is never re-notified on the next recalc pass. Only the two notifiable
    transitions (on_track -> at_risk, at_risk -> breached) ever create a
    Notification at all - reaching achieved/cancelled/paused leaves
    `last_notified_status` untouched, since `due_at`/elapsed-percent math
    is monotonic (a fixed `due_at`, time only moving forward) so `at_risk`/
    `breached` are never revisited once left behind either way."""
    if sla.status not in NOTIFIABLE_STATUSES:
        return
    if sla.status == sla.last_notified_status:
        return
    _create_breach_notification(sla, issue)
    sla.last_notified_status = sla.status


def _recompute_entry(sla, now):
    issue = sla.issue
    state_group = issue.state.group if issue.state_id else None

    if state_group == StateGroup.CANCELLED.value:
        sla.status = "cancelled"
    elif state_group == StateGroup.COMPLETED.value:
        if sla.met_at is None:
            sla.met_at = issue.completed_at or now
        # See module docstring for the resolved achieved-vs-breached
        # ambiguity: completing after `due_at` is `breached`, not a late
        # `achieved`.
        if sla.met_at <= sla.due_at:
            sla.status = "achieved"
        else:
            sla.status = "breached"
            if sla.breached_at is None:
                sla.breached_at = sla.due_at
    elif now >= sla.due_at:
        sla.status = "breached"
        if sla.breached_at is None:
            sla.breached_at = now
    else:
        policy = sla.sla_policy
        warning_threshold = policy.warning_threshold_percent if policy is not None else 75
        elapsed_percent = _elapsed_percent(issue.created_at, sla.due_at, now)
        # `critical_threshold_percent` is stored/validated/exposed via the
        # API but, per this branch only ever being reachable before
        # `due_at`, does not drive a distinct `IssueSLA.status` value in
        # v1 - there is no separate "critical" entry in `STATUS_CHOICES`,
        # and exigence 8 only names the on_track->at_risk and
        # at_risk->breached crossings as notification-worthy. It's
        # scaffolded for a future purely-visual "redder badge"
        # differentiation that a frontend can read directly off the
        # policy without any further backend change.
        sla.status = "at_risk" if elapsed_percent >= warning_threshold else "on_track"

    _maybe_notify(sla, issue)
    sla.save(update_fields=["status", "met_at", "breached_at", "last_notified_status"])


def _refresh_issue_risk_levels(issue_ids):
    from plane.db.models import Issue, IssueSLA

    active_statuses = (
        IssueSLA.objects.filter(issue_id__in=issue_ids)
        .exclude(status__in=["achieved", "cancelled", "paused"])
        .values("issue_id", "status")
    )
    risk_by_issue = {}
    for row in active_statuses:
        rank = _RISK_RANK.get(row["status"])
        if rank is None:
            continue
        issue_id = row["issue_id"]
        current = risk_by_issue.get(issue_id)
        if current is None or rank > _RISK_RANK[current]:
            risk_by_issue[issue_id] = row["status"]

    to_update = []
    for issue in Issue.objects.filter(id__in=issue_ids).only("id", "sla_risk_level"):
        new_level = risk_by_issue.get(issue.id)
        if issue.sla_risk_level != new_level:
            issue.sla_risk_level = new_level
            to_update.append(issue)
    if to_update:
        Issue.objects.bulk_update(to_update, ["sla_risk_level"])


def recalculate_sla_statuses():
    """Periodic (5-minute) recalculation - see
    plane/bgtasks/sla_task.py::recalculate_sla_statuses_task and exigence 7.
    Mirrors plane/bgtasks/intake_escalation_task.py's overall shape (filter
    a cutoff-bounded queryset, mutate a status-like field per row)."""
    from plane.db.models import IssueSLA

    now = timezone.now()

    active_entries = (
        IssueSLA.objects.exclude(status__in=TERMINAL_STATUSES)
        .filter(
            issue__isnull=False,
            issue__archived_at__isnull=True,
            issue__is_draft=False,
            issue__project__archived_at__isnull=True,
        )
        .select_related("issue", "issue__state", "sla_policy")
    )

    touched_issue_ids = set()
    for sla in active_entries.iterator():
        _recompute_entry(sla, now)
        touched_issue_ids.add(sla.issue_id)

    if touched_issue_ids:
        _refresh_issue_risk_levels(touched_issue_ids)
