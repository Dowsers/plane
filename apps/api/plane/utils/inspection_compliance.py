# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Enforcement gate for inspection compliance (ISO/IEC 17020 §4.1/§4.2) - the
check that stops a member of an inspection project from using it until they
have signed what they owe.

## Where this runs

At the `initial()` choke points, the same "one place every request already
passes through" pattern `plane.utils.session_activity` uses:

- `plane.app.views.base.TimezoneMixin.initial()` - the internal app API.
- `plane.api.views.base.TimezoneMixin.initial()` - the EXTERNAL, API-token
  authenticated API. That surface is a separate mixin with its own `initial()`
  and was initially left ungated, which meant an API token was a complete
  bypass of this entire feature: a compliance control with a documented hole
  in it is not a control, and an accreditation assessor would ask about it
  first.

Not the DRF permission classes in `plane.app.permissions.project` (five of
them) plus the `allow_permission` decorator: that is six places to keep in
sync forever, and the external API does not use them at all.

## Progressive enforcement

Reminders first, blocking later. A member gets `inspection_grace_period_days`
(default 7, per project) from when their obligation is first OBSERVED - see
`InspectionObligation`'s docstring for why that anchor, and not any of the
three more obvious ones, is the only one that does not instantly lock
somebody out.

Both reads and writes are blocked once the grace period elapses. That is a
deliberate product decision (§4.2's "restriction des accès" is about the audit
base itself, which lives in Plane), and it is also what makes the exemption
list below load-bearing rather than cosmetic: with writes alone, the signing
screen could never block itself.

## Satisfying an obligation is not just "signed"

An impartiality declaration that discloses a conflict, or that contradicts its
own attestations, is recorded and routed to a manager - see
`plane.utils.inspection_questionnaire` for why it is recorded rather than
refused. Such a signature leaves `review_status=PENDING`, and PENDING does NOT
satisfy the obligation: §4.1 asks for a risk analysis, and the analysis is the
human verdict, not the signature. REJECTED never satisfies it either.

## Fail-safe: this gate fails OPEN

Every error path returns "allowed". That is the opposite of
`plane.utils.session_activity`, and the difference is the point: an idle-session
timeout is a security control where failing closed protects data, whereas this
is a compliance-EVIDENCE control. Failing closed here reproduces commit
bc7bab8bd (a permanent workspace lockout with no in-product way out), while
failing open costs a delayed signature that the reminder emails, the compliance
dashboard and the permanent signature record all still surface.

Three independent ways out of a lockout, by construction:

1. The exempt route list below always includes the project's own inspection
   config endpoint, so a project Admin can always turn the mode back off.
2. `Project.inspection_enforcement_paused` - per-project pause.
3. `ENABLE_INSPECTION_ENFORCEMENT` - instance-wide kill switch, DEFAULT OFF.

That default matters: enabling inspection mode on a project records
obligations, shows the banner and sends reminders, but blocks nothing until an
instance admin deliberately turns enforcement on. A gate that can deny reads
should not switch itself on during an upgrade.
"""

import logging
from datetime import timedelta
from typing import Optional

from django.urls import Resolver404, resolve
from django.utils import timezone

from plane.license.utils.instance_value import get_configuration_value

logger = logging.getLogger("plane.utils.inspection_compliance")

ERROR_CODE = "INSPECTION_SIGNATURE_REQUIRED"

# Review verdicts that let an obligation count as met. PENDING (nobody has
# looked at a disclosed conflict yet) and REJECTED (evaluator excluded) both
# deliberately do not.
SATISFYING_REVIEW_STATUSES = ("NOT_REQUIRED", "ACCEPTED", "ACCEPTED_WITH_MEASURES")

# Routes that must stay reachable for a BLOCKED member, matched on
# `ResolverMatch.url_name`. This list is what prevents the gate from walling
# off its own escape hatches, so each entry is here for a stated reason -
# never prune one without replacing the reason.
#
# Every name here is asserted to be a REAL registered route by
# `test_inspection_compliance.TestExemptionListIsReal`. That test exists
# because the first draft of this list contained four invented names
# (`project-members`, `project-leave`, `project-invitations`,
# `project-user-properties`) - a typo in an exemption is invisible at runtime
# and silently removes an escape hatch, which is the whole failure mode this
# list is meant to prevent.
EXEMPT_URL_NAMES = frozenset(
    {
        # The signing flow itself. Blocking these would make the obligation
        # literally impossible to discharge.
        "project-inspection-me",
        "project-inspection-sign",
        # The Admin's way out: turning inspection mode off, or pausing
        # enforcement, on the very project that is blocking them.
        "project-inspection-config",
        # The per-project document override, read by the signing screen to
        # render the right text.
        "project-inspection-template",
        # The manager's way to unblock everyone else by reviewing their
        # declarations - a reviewer who is themselves blocked on an unrelated
        # obligation must not become a deadlock.
        "project-inspection-review",
        "project-inspection-compliance",
        # Membership. One name covers list/retrieve/create/update/destroy AND
        # `members/leave/` (all three patterns share it), so leaving a project
        # is always possible and the signing UI can render who else is on it.
        "project-member",
        # `project-members/me/` - the caller's own role in this project, which
        # the web app's project shell fetches on every navigation. Blocking it
        # would break the UI that has to render the signing screen.
        "project-member-view",
        # Per-member view preferences, written by the app shell on navigation.
        "project-member-preference",
        # Assets, so a client-supplied NDA or charter PDF can actually be
        # displayed on the signing screen.
        "project-asset-download",
        "workspace-file-assets",
    }
)


def is_instance_enforcement_enabled() -> bool:
    """Instance-wide kill switch. Defaults OFF - see this module's docstring."""
    (value,) = get_configuration_value([{"key": "ENABLE_INSPECTION_ENFORCEMENT", "default": "0"}])
    return str(value) == "1"


def _request_url_name(request) -> Optional[str]:
    """`resolve()` on the already-resolved path, matching the precedent at
    `plane.app.views.base.BaseAPIView.project_id`."""
    try:
        return resolve(request.path_info).url_name
    except Resolver404:
        return None


def resolve_applicable_version(project, kind):
    """The template version a member of `project` must sign for `kind`.

    Project-specific override wins over the workspace default (the nullable
    `project` column on `InspectionDocumentTemplate` is the scope mechanism -
    see its docstring); within whichever template wins, the newest PUBLISHED
    version applies. A draft never obliges anybody.

    Two queries rather than one clever ordered query: "override before default"
    cannot be expressed by sorting on `template__project_id` (that orders by
    UUID), and the override case short-circuits anyway.

    Returns `None` when nothing is published for this kind - which is why a
    project can be flagged as an inspection before its documents exist without
    blocking a soul.
    """
    from plane.db.models import InspectionDocumentTemplateVersion

    published = InspectionDocumentTemplateVersion.objects.filter(
        template__kind=kind, published_at__isnull=False
    )

    override = published.filter(template__project_id=project.id).order_by("-version").first()
    if override is not None:
        return override

    return (
        published.filter(
            template__workspace_id=project.workspace_id, template__project_id__isnull=True
        )
        .order_by("-version")
        .first()
    )


def outstanding_kinds(project, member_id) -> list:
    """Which document kinds `member_id` still owes on `project`.

    A kind is NOT owed when its applicable version is unpublished/absent (there
    is nothing to sign yet) or when the member holds a signature against that
    exact version whose review verdict is satisfying.
    """
    from plane.db.models import InspectionDocumentKind, InspectionSignature

    outstanding = []
    for kind in InspectionDocumentKind.values:
        version = resolve_applicable_version(project, kind)
        if version is None:
            continue
        satisfied = InspectionSignature.objects.filter(
            project_id=project.id,
            member_id=member_id,
            template_version_id=version.id,
            review_status__in=SATISFYING_REVIEW_STATUSES,
        ).exists()
        if not satisfied:
            outstanding.append(kind)
    return outstanding


def ensure_obligations(project, member_id, kinds) -> list:
    """Lazily create the per-member grace clocks and return them.

    `get_or_create` on the request path rather than eager creation at
    membership-mutation sites - see `InspectionObligation`'s docstring for why
    (member reactivation runs through `bulk_update()`, which bypasses both
    `save()` and signals, and this fork has added zero signals).
    """
    from plane.db.models import InspectionObligation

    now = timezone.now()
    obligations = []
    for kind in kinds:
        obligation, _ = InspectionObligation.objects.get_or_create(
            project_id=project.id,
            member_id=member_id,
            kind=kind,
            defaults={"workspace_id": project.workspace_id, "obligation_started_at": now},
        )
        obligations.append(obligation)
    return obligations


def clear_block_if_satisfied(project, member_id) -> None:
    """Clear `blocked_since` for any kind this member no longer owes.

    The gate itself cannot do this: it returns early the moment nothing is
    outstanding, so a member who was blocked and has since become compliant
    would keep a stale `blocked_since` and go on being reported as blocked by
    the compliance dashboard.

    Called explicitly from the two places satisfaction can actually occur - the
    signing endpoint and the review endpoint (accepting a declaration is what
    satisfies a PENDING one) - plus the reminder task as a nightly safety net.
    Three call sites rather than a signal, matching this fork's convention; see
    `InspectionObligation`'s docstring.
    """
    from plane.db.models import InspectionDocumentKind, InspectionObligation

    still_owed = set(outstanding_kinds(project, member_id))
    satisfied = [kind for kind in InspectionDocumentKind.values if kind not in still_owed]
    if not satisfied:
        return

    InspectionObligation.objects.filter(
        project_id=project.id,
        member_id=member_id,
        kind__in=satisfied,
        blocked_since__isnull=False,
    ).update(blocked_since=None)


def enforce_inspection_compliance(request, project_id) -> Optional[dict]:
    """Call once per authenticated, project-scoped request.

    Returns `None` if the request may proceed, or a JSON-serialisable error
    payload if the caller owes signatures and their grace period has elapsed.
    Never raises and never returns a `Response` - the caller turns the payload
    into an HTTP error, keeping this reusable from both `initial()` sites.
    """
    try:
        return _enforce(request, project_id)
    except Exception as exc:  # noqa: BLE001 - deliberate catch-all, see below
        # Fail OPEN. See this module's docstring: closing on error is how
        # bc7bab8bd permanently locked people out, and this is an evidence
        # control, not an access-control-of-last-resort.
        logger.warning(
            "Inspection compliance check failed open for project %s: %s", project_id, exc
        )
        return None


def _enforce(request, project_id) -> Optional[dict]:
    from plane.db.models import Project, ProjectMember

    if not is_instance_enforcement_enabled():
        return None

    url_name = _request_url_name(request)
    if url_name in EXEMPT_URL_NAMES:
        return None

    project = (
        Project.objects.filter(pk=project_id)
        .only(
            "id",
            "workspace_id",
            "is_inspection_enabled",
            "inspection_enforcement_paused",
            "inspection_grace_period_days",
        )
        .first()
    )
    if project is None or not project.is_inspection_enabled or project.inspection_enforcement_paused:
        return None

    # Only ACTIVE members owe anything. A non-member is not this function's
    # concern - the view's own permission check handles access control, and
    # answering "blocked" here would mask a plain 403 with a confusing one.
    if not ProjectMember.objects.filter(
        project_id=project.id, member_id=request.user.id, is_active=True
    ).exists():
        return None

    kinds = outstanding_kinds(project, request.user.id)
    if not kinds:
        return None

    obligations = ensure_obligations(project, request.user.id, kinds)
    grace = timedelta(days=project.inspection_grace_period_days or 0)
    now = timezone.now()

    elapsed = [o for o in obligations if now - o.obligation_started_at > grace]
    if not elapsed:
        # Still inside the grace window - banner and reminders only.
        return None

    _stamp_blocked(elapsed, now)

    return {
        "error_code": ERROR_CODE,
        "error_message": ERROR_CODE,
        "project_id": str(project.id),
        "outstanding": [o.kind for o in elapsed],
        "detail": (
            "Access to this inspection project requires signing the documents "
            "listed in `outstanding` (ISO/IEC 17020 §4.1/§4.2). The grace "
            "period for signing has elapsed."
        ),
    }


def _stamp_blocked(obligations, now) -> None:
    """Record the grace->blocked transition once, so the reminder task can send
    exactly one "you are now blocked" email and the dashboard can tell apart
    "overdue" from "actually blocked".

    A plain `.update()` (bypassing `BaseModel.save()`, so no `updated_by`
    churn) on the null->set transition only, hence the `blocked_since__isnull`
    filter: this runs on every blocked request, and it must not rewrite the
    timestamp each time.
    """
    from plane.db.models import InspectionObligation

    unstamped = [o.pk for o in obligations if o.blocked_since is None]
    if unstamped:
        InspectionObligation.objects.filter(pk__in=unstamped, blocked_since__isnull=True).update(
            blocked_since=now
        )
