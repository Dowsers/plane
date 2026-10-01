# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The inspection reminder task (`plane.bgtasks.inspection_reminder_task`).

The throttling tests are the point of this file. A compliance reminder that
arrives daily, once per obligation row, teaches people to filter it - which
defeats the purpose - so the cadence rules get pinned down here:

- one email per MEMBER per run, aggregating every project and document;
- 48h between reminders, capped at 4 during the grace period;
- exactly ONE "you are blocked" email, on the transition;
- nothing claims "blocked" while instance enforcement is off.

`_send` is patched throughout rather than relying on Django's locmem backend,
because what matters is *who* is emailed *how many times* and with what
aggregated payload, not the rendered bytes - except in
`TestTemplatesRender`, which does render them for real.
"""

from datetime import timedelta
from unittest import mock

import pytest
from django.utils import timezone

from plane.bgtasks import inspection_reminder_task
from plane.bgtasks.inspection_reminder_task import (
    MAX_REMINDERS,
    send_inspection_signature_reminders,
)
from plane.db.models import (
    InspectionDocumentKind,
    InspectionDocumentTemplate,
    InspectionDocumentTemplateVersion,
    InspectionObligation,
)
from plane.tests.factories import (
    InspectionSignatureFactory,
    ProjectFactory,
    ProjectMemberFactory,
    UserFactory,
    WorkspaceFactory,
)


def _published(workspace, kind, *, project=None, version=1, body="texte"):
    template = InspectionDocumentTemplate.objects.create(
        workspace=workspace, project=project, kind=kind, name=f"{kind}"
    )
    return InspectionDocumentTemplateVersion.objects.create(
        template=template, version=version, body=body, published_at=timezone.now()
    )


def _setup(*, kinds=(InspectionDocumentKind.CONFIDENTIALITY,), grace_days=7, started_days_ago=0, paused=False):
    """One inspection project, one active member, one obligation per kind."""
    workspace = WorkspaceFactory()
    project = ProjectFactory(
        workspace=workspace,
        is_inspection_enabled=True,
        inspection_grace_period_days=grace_days,
        inspection_enforcement_paused=paused,
    )
    member = UserFactory()
    ProjectMemberFactory(project=project, member=member, role=15)

    obligations = []
    for kind in kinds:
        _published(workspace, kind)
        obligations.append(
            InspectionObligation.objects.create(
                project=project,
                workspace=workspace,
                member=member,
                kind=kind,
                obligation_started_at=timezone.now() - timedelta(days=started_days_ago),
            )
        )
    return workspace, project, member, obligations


@pytest.fixture
def send():
    with mock.patch.object(inspection_reminder_task, "_send") as patched:
        yield patched


@pytest.fixture
def enforcement_on():
    with mock.patch.object(
        inspection_reminder_task, "is_instance_enforcement_enabled", return_value=True
    ):
        yield


@pytest.fixture
def enforcement_off():
    with mock.patch.object(
        inspection_reminder_task, "is_instance_enforcement_enabled", return_value=False
    ):
        yield


def _templates_used(send):
    return [call.args[0] for call in send.call_args_list]


@pytest.mark.unit
class TestFirstReminder:
    @pytest.mark.django_db
    def test_a_fresh_obligation_is_reminded_immediately(self, send, enforcement_off):
        _workspace, _project, member, obligations = _setup()

        send_inspection_signature_reminders()

        assert send.call_count == 1
        assert "inspection_signature_reminder.html" in _templates_used(send)[0]
        assert send.call_args.args[2] == member.email
        obligations[0].refresh_from_db()
        assert obligations[0].reminder_count == 1
        assert obligations[0].last_reminder_sent_at is not None

    @pytest.mark.django_db
    def test_one_email_aggregates_every_document(self, send, enforcement_off):
        """Three obligations must not be three emails."""
        _setup(kinds=tuple(InspectionDocumentKind.values))

        send_inspection_signature_reminders()

        assert send.call_count == 1
        context = send.call_args.args[3]
        assert len(context["documents"]) == 3

    @pytest.mark.django_db
    def test_one_email_aggregates_across_projects(self, send, enforcement_off):
        """A member behind on two engagements gets one email, not two."""
        workspace = WorkspaceFactory()
        member = UserFactory()
        for name in ("Engagement A", "Engagement B"):
            project = ProjectFactory(
                workspace=workspace, name=name, is_inspection_enabled=True, inspection_grace_period_days=7
            )
            ProjectMemberFactory(project=project, member=member, role=15)
            _published(workspace, InspectionDocumentKind.CONFIDENTIALITY, project=project)
            InspectionObligation.objects.create(
                project=project,
                workspace=workspace,
                member=member,
                kind=InspectionDocumentKind.CONFIDENTIALITY,
                obligation_started_at=timezone.now(),
            )

        send_inspection_signature_reminders()

        assert send.call_count == 1
        assert len(send.call_args.args[3]["documents"]) == 2


@pytest.mark.unit
class TestThrottling:
    @pytest.mark.django_db
    def test_a_second_run_the_same_day_sends_nothing(self, send, enforcement_off):
        _setup()

        send_inspection_signature_reminders()
        send_inspection_signature_reminders()

        assert send.call_count == 1, "48h must elapse between reminders"

    @pytest.mark.django_db
    def test_a_reminder_goes_out_again_after_48_hours(self, send, enforcement_off):
        _workspace, _project, _member, obligations = _setup()
        send_inspection_signature_reminders()

        InspectionObligation.objects.filter(pk=obligations[0].pk).update(
            last_reminder_sent_at=timezone.now() - timedelta(hours=49)
        )
        send_inspection_signature_reminders()

        assert send.call_count == 2
        obligations[0].refresh_from_db()
        assert obligations[0].reminder_count == 2

    @pytest.mark.django_db
    def test_reminders_stop_at_the_cap(self, send, enforcement_off):
        _workspace, _project, _member, obligations = _setup()
        InspectionObligation.objects.filter(pk=obligations[0].pk).update(
            reminder_count=MAX_REMINDERS, last_reminder_sent_at=timezone.now() - timedelta(days=30)
        )

        send_inspection_signature_reminders()

        assert send.call_count == 0


@pytest.mark.unit
class TestBlockedTransition:
    @pytest.mark.django_db
    def test_overdue_sends_exactly_one_blocked_email(self, send, enforcement_on):
        _workspace, _project, _member, obligations = _setup(grace_days=7, started_days_ago=30)

        send_inspection_signature_reminders()
        obligations[0].refresh_from_db()
        first_blocked_at = obligations[0].blocked_since

        send_inspection_signature_reminders()

        assert send.call_count == 1, "the blocked email fires once, on the transition"
        assert "inspection_access_blocked.html" in _templates_used(send)[0]
        obligations[0].refresh_from_db()
        assert obligations[0].blocked_since == first_blocked_at

    @pytest.mark.django_db
    def test_a_weekly_nudge_follows_once_blocked(self, send, enforcement_on):
        _workspace, _project, _member, obligations = _setup(grace_days=7, started_days_ago=30)
        send_inspection_signature_reminders()

        InspectionObligation.objects.filter(pk=obligations[0].pk).update(
            last_reminder_sent_at=timezone.now() - timedelta(days=8)
        )
        send_inspection_signature_reminders()

        assert send.call_count == 2
        assert all("inspection_access_blocked.html" in t for t in _templates_used(send))

    @pytest.mark.django_db
    def test_nothing_claims_blocked_while_enforcement_is_off(self, send, enforcement_off):
        """With the kill switch off nobody is actually denied access, so an
        email saying so would be a lie."""
        _workspace, _project, _member, obligations = _setup(grace_days=7, started_days_ago=30)

        send_inspection_signature_reminders()

        assert send.call_count == 1
        assert "inspection_signature_reminder.html" in _templates_used(send)[0]
        obligations[0].refresh_from_db()
        assert obligations[0].blocked_since is None

    @pytest.mark.django_db
    def test_an_overdue_reminder_is_marked_overdue(self, send, enforcement_off):
        _setup(grace_days=7, started_days_ago=30)

        send_inspection_signature_reminders()

        assert send.call_args.args[3]["documents"][0]["is_overdue"] is True


@pytest.mark.unit
class TestSatisfiedObligations:
    @pytest.mark.django_db
    def test_a_signed_obligation_is_not_reminded(self, send, enforcement_off):
        workspace, project, member, _obligations = _setup()
        version = InspectionDocumentTemplateVersion.objects.get(
            template__kind=InspectionDocumentKind.CONFIDENTIALITY
        )
        InspectionSignatureFactory(
            project=project,
            member=member,
            template_version=version,
            kind=InspectionDocumentKind.CONFIDENTIALITY,
            review_status="NOT_REQUIRED",
        )

        send_inspection_signature_reminders()

        assert send.call_count == 0

    @pytest.mark.django_db
    def test_a_pending_review_is_still_reminded(self, send, enforcement_off):
        """PENDING does not satisfy the obligation - §4.1 wants the human
        verdict, so the member is still behind."""
        workspace, project, member, _obligations = _setup()
        version = InspectionDocumentTemplateVersion.objects.get(
            template__kind=InspectionDocumentKind.CONFIDENTIALITY
        )
        InspectionSignatureFactory(
            project=project,
            member=member,
            template_version=version,
            kind=InspectionDocumentKind.CONFIDENTIALITY,
            review_status="PENDING",
            declared_conflicts=True,
        )

        send_inspection_signature_reminders()

        assert send.call_count == 1

    @pytest.mark.django_db
    def test_a_stale_block_is_cleared_once_satisfied(self, send, enforcement_on):
        """The nightly safety net: the endpoints clear this at the moment of
        satisfaction, but a crash in between must not leave somebody reported as
        blocked forever."""
        workspace, project, member, obligations = _setup(grace_days=7, started_days_ago=30)
        InspectionObligation.objects.filter(pk=obligations[0].pk).update(
            blocked_since=timezone.now() - timedelta(days=5)
        )
        version = InspectionDocumentTemplateVersion.objects.get(
            template__kind=InspectionDocumentKind.CONFIDENTIALITY
        )
        InspectionSignatureFactory(
            project=project,
            member=member,
            template_version=version,
            kind=InspectionDocumentKind.CONFIDENTIALITY,
            review_status="ACCEPTED",
        )

        send_inspection_signature_reminders()

        obligations[0].refresh_from_db()
        assert obligations[0].blocked_since is None
        assert send.call_count == 0


@pytest.mark.unit
class TestScopeAndResilience:
    @pytest.mark.django_db
    def test_a_paused_project_sends_nothing(self, send, enforcement_on):
        _setup(grace_days=7, started_days_ago=30, paused=True)

        send_inspection_signature_reminders()

        assert send.call_count == 0

    @pytest.mark.django_db
    def test_a_project_with_inspection_disabled_sends_nothing(self, send, enforcement_off):
        workspace, project, member, _obligations = _setup()
        ProjectFactory._meta.model.objects.filter(pk=project.pk).update(is_inspection_enabled=False)

        send_inspection_signature_reminders()

        assert send.call_count == 0

    @pytest.mark.django_db
    def test_nothing_published_means_no_reminder(self, send, enforcement_off):
        """An obligation row can outlive the template that created it."""
        workspace = WorkspaceFactory()
        project = ProjectFactory(workspace=workspace, is_inspection_enabled=True)
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        InspectionObligation.objects.create(
            project=project,
            workspace=workspace,
            member=member,
            kind=InspectionDocumentKind.CONFIDENTIALITY,
            obligation_started_at=timezone.now(),
        )

        send_inspection_signature_reminders()

        assert send.call_count == 0

    @pytest.mark.django_db
    def test_one_failing_recipient_does_not_abort_the_run(self, enforcement_off):
        """A bad address or an SMTP hiccup for one member must not stop
        everybody else's reminders - nor leave counters half-written."""
        workspace = WorkspaceFactory()
        members = []
        for name in ("A", "B"):
            project = ProjectFactory(
                workspace=workspace, name=f"Engagement {name}", is_inspection_enabled=True
            )
            member = UserFactory()
            members.append(member)
            ProjectMemberFactory(project=project, member=member, role=15)
            _published(workspace, InspectionDocumentKind.CONFIDENTIALITY, project=project)
            InspectionObligation.objects.create(
                project=project,
                workspace=workspace,
                member=member,
                kind=InspectionDocumentKind.CONFIDENTIALITY,
                obligation_started_at=timezone.now(),
            )

        with mock.patch.object(
            inspection_reminder_task, "_send", side_effect=[Exception("smtp down"), None]
        ) as send:
            send_inspection_signature_reminders()

        assert send.call_count == 2, "the second member is still emailed"

    @pytest.mark.django_db
    def test_an_unexpected_error_does_not_raise(self, enforcement_off):
        """The task is scheduled; a crash would show up only in worker logs, so
        it swallows and logs rather than propagating."""
        _setup()

        with mock.patch.object(
            inspection_reminder_task, "outstanding_kinds", side_effect=RuntimeError("boom")
        ):
            send_inspection_signature_reminders()  # must not raise


@pytest.mark.unit
class TestTemplatesRender:
    """The two templates are rendered for real here - a `{% for %}` typo would
    otherwise only surface as a swallowed exception in production."""

    @pytest.mark.django_db
    def test_reminder_template_renders_with_real_data(self, enforcement_off, settings):
        settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
        _setup(kinds=tuple(InspectionDocumentKind.values))

        from django.core import mail

        send_inspection_signature_reminders()

        assert len(mail.outbox) == 1
        assert "impartialité" in mail.outbox[0].body.lower()

    @pytest.mark.django_db
    def test_blocked_template_renders_with_real_data(self, enforcement_on, settings):
        settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
        _setup(grace_days=7, started_days_ago=30)

        from django.core import mail

        send_inspection_signature_reminders()

        assert len(mail.outbox) == 1
        assert "suspendu" in mail.outbox[0].body.lower()


@pytest.mark.unit
class TestQuestionnaireKindLabels:
    def test_every_kind_has_a_human_label(self):
        """An email showing a raw enum value would be sloppy in front of an
        accreditation assessor."""
        from plane.bgtasks.inspection_reminder_task import _KIND_LABELS

        assert set(_KIND_LABELS) == set(InspectionDocumentKind.values)
        assert all(label and not label.isupper() for label in _KIND_LABELS.values())

    def test_the_impartiality_label_mentions_its_clause(self):
        from plane.bgtasks.inspection_reminder_task import _KIND_LABELS

        assert "4.1" in _KIND_LABELS[InspectionDocumentKind.IMPARTIALITY.value]
        assert "4.2" in _KIND_LABELS[InspectionDocumentKind.CONFIDENTIALITY.value]
