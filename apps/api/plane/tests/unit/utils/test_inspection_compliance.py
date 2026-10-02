# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The inspection compliance enforcement gate
(`plane.utils.inspection_compliance`).

`TestLockoutRegressions` is the non-negotiable part of this file. Commit
bc7bab8bd ("Fix permanent workspace lockout in idle-session timeout") is this
repo's own precedent for a gate that permanently locked members out, and this
gate is riskier still because it can deny READS. Every escape hatch it claims
to have gets a test here.
"""

from datetime import timedelta
from unittest import mock

import pytest
from django.utils import timezone

from plane.db.models import (
    InspectionDocumentKind,
    InspectionObligation,
)
from plane.tests.factories import (
    InspectionDocumentTemplateFactory,
    InspectionDocumentTemplateVersionFactory,
    InspectionSignatureFactory,
    ProjectFactory,
    ProjectMemberFactory,
    UserFactory,
)
from plane.utils import inspection_compliance
from plane.utils.inspection_compliance import (
    ERROR_CODE,
    EXEMPT_URL_NAMES,
    enforce_inspection_compliance,
    next_signable_kind,
    outstanding_kinds,
    resolve_applicable_version,
    signed_kinds,
    unmet_prerequisites,
)


class FakeRequest:
    """The gate only ever touches `request.user` and `request.path_info`."""

    def __init__(self, user, path="/api/workspaces/w/projects/p/issues/"):
        self.user = user
        self.path_info = path


@pytest.fixture
def enforcement_on():
    """The instance kill switch defaults OFF, so every behavioural test has to
    turn it on explicitly - which is itself the proof that the default is off."""
    with mock.patch.object(inspection_compliance, "is_instance_enforcement_enabled", return_value=True):
        yield


@pytest.fixture
def unnamed_route():
    """Most tests care about the gate's logic, not route matching. Pin the
    resolved url_name to something that is not exempt."""
    with mock.patch.object(inspection_compliance, "_request_url_name", return_value="project-issues"):
        yield


def _published_version(project, kind, *, scope="workspace", version=1):
    """A published template version for `kind`, at workspace or project scope."""
    template = InspectionDocumentTemplateFactory(
        workspace=project.workspace,
        project=project if scope == "project" else None,
        kind=kind,
    )
    return InspectionDocumentTemplateVersionFactory(
        template=template, version=version, published_at=timezone.now()
    )


def _inspection_project(**kwargs):
    defaults = {"is_inspection_enabled": True, "inspection_grace_period_days": 7}
    defaults.update(kwargs)
    return ProjectFactory(**defaults)


def _age_obligations(project, days):
    """Push every obligation clock back, simulating an elapsed grace period."""
    InspectionObligation.objects.filter(project=project).update(
        obligation_started_at=timezone.now() - timedelta(days=days)
    )


@pytest.mark.unit
class TestExemptionListIsReal:
    """Guards against the failure mode that actually happened while building
    this: the first draft of `EXEMPT_URL_NAMES` contained four invented route
    names (`project-members`, `project-leave`, `project-invitations`,
    `project-user-properties`). A typo in an exemption is invisible at runtime -
    it silently deletes a lockout escape hatch - so the list is asserted against
    the real URLconf."""

    def test_every_exempt_name_is_a_registered_route(self):
        from django.urls import get_resolver

        registered = set(get_resolver().reverse_dict.keys())
        registered = {name for name in registered if isinstance(name, str)}

        unknown = sorted(EXEMPT_URL_NAMES - registered)

        assert not unknown, (
            f"these exempt url_names do not exist in the URLconf: {unknown}. "
            "An exemption that matches nothing silently removes an escape hatch."
        )

    def test_the_signing_and_config_routes_are_exempt(self):
        """The three that matter most: without them a blocked member cannot
        discharge the obligation and a blocked Admin cannot turn it off."""
        for name in (
            "project-inspection-me",
            "project-inspection-sign",
            "project-inspection-config",
        ):
            assert name in EXEMPT_URL_NAMES


@pytest.mark.unit
class TestKillSwitchAndProjectFlags:
    @pytest.mark.django_db
    def test_gate_is_inert_while_the_instance_switch_is_off(self, unnamed_route):
        """The shipped default. Nothing below should even query the project."""
        project = _inspection_project()
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        _published_version(project, InspectionDocumentKind.IMPARTIALITY)
        _age_obligations(project, 30)

        assert enforce_inspection_compliance(FakeRequest(member), project.id) is None

    @pytest.mark.django_db
    def test_non_inspection_project_is_never_gated(self, enforcement_on, unnamed_route):
        project = ProjectFactory(is_inspection_enabled=False)
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        _published_version(project, InspectionDocumentKind.IMPARTIALITY)

        assert enforce_inspection_compliance(FakeRequest(member), project.id) is None

    @pytest.mark.django_db
    def test_per_project_pause_stops_blocking(self, enforcement_on, unnamed_route):
        project = _inspection_project(inspection_enforcement_paused=True)
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        _published_version(project, InspectionDocumentKind.IMPARTIALITY)
        _age_obligations(project, 30)

        assert enforce_inspection_compliance(FakeRequest(member), project.id) is None

    @pytest.mark.django_db
    def test_missing_project_is_not_blocked(self, enforcement_on, unnamed_route):
        import uuid

        assert enforce_inspection_compliance(FakeRequest(UserFactory()), uuid.uuid4()) is None


@pytest.mark.unit
class TestWhoOwesWhat:
    @pytest.mark.django_db
    def test_non_member_is_not_this_gates_concern(self, enforcement_on, unnamed_route):
        """Answering "blocked" for a non-member would mask a plain 403 with a
        confusing one - the view's own permission check owns that case."""
        project = _inspection_project()
        _published_version(project, InspectionDocumentKind.IMPARTIALITY)
        outsider = UserFactory()

        assert enforce_inspection_compliance(FakeRequest(outsider), project.id) is None

    @pytest.mark.django_db
    def test_inactive_member_is_not_gated(self, enforcement_on, unnamed_route):
        project = _inspection_project()
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15, is_active=False)
        _published_version(project, InspectionDocumentKind.IMPARTIALITY)

        assert enforce_inspection_compliance(FakeRequest(member), project.id) is None

    @pytest.mark.django_db
    def test_nothing_published_means_nothing_owed(self, enforcement_on, unnamed_route):
        """A project can be flagged as an inspection before its documents are
        written without blocking anybody."""
        project = _inspection_project()
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)

        assert outstanding_kinds(project, member.id) == []
        assert enforce_inspection_compliance(FakeRequest(member), project.id) is None

    @pytest.mark.django_db
    def test_a_draft_version_obliges_nobody(self, enforcement_on, unnamed_route):
        project = _inspection_project()
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        template = InspectionDocumentTemplateFactory(
            workspace=project.workspace, project=None, kind=InspectionDocumentKind.IMPARTIALITY
        )
        InspectionDocumentTemplateVersionFactory(template=template, published_at=None)

        assert outstanding_kinds(project, member.id) == []

    @pytest.mark.django_db
    def test_all_three_kinds_are_owed_when_all_are_published(self, enforcement_on):
        project = _inspection_project()
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        for kind in InspectionDocumentKind.values:
            _published_version(project, kind)

        assert set(outstanding_kinds(project, member.id)) == set(InspectionDocumentKind.values)


@pytest.mark.unit
class TestApplicableVersionResolution:
    @pytest.mark.django_db
    def test_project_override_wins_over_workspace_default(self):
        project = _inspection_project()
        _published_version(project, InspectionDocumentKind.CONFIDENTIALITY, scope="workspace")
        override = _published_version(
            project, InspectionDocumentKind.CONFIDENTIALITY, scope="project"
        )

        resolved = resolve_applicable_version(project, InspectionDocumentKind.CONFIDENTIALITY)

        assert resolved.id == override.id

    @pytest.mark.django_db
    def test_newest_published_version_applies(self):
        project = _inspection_project()
        first = _published_version(project, InspectionDocumentKind.IMPARTIALITY, version=1)
        newest = InspectionDocumentTemplateVersionFactory(
            template=first.template, version=2, published_at=timezone.now()
        )

        resolved = resolve_applicable_version(project, InspectionDocumentKind.IMPARTIALITY)

        assert resolved.id == newest.id

    @pytest.mark.django_db
    def test_unpublished_newer_version_does_not_supersede(self):
        project = _inspection_project()
        published = _published_version(project, InspectionDocumentKind.IMPARTIALITY, version=1)
        InspectionDocumentTemplateVersionFactory(
            template=published.template, version=2, published_at=None
        )

        resolved = resolve_applicable_version(project, InspectionDocumentKind.IMPARTIALITY)

        assert resolved.id == published.id

    @pytest.mark.django_db
    def test_another_workspaces_template_is_never_applicable(self):
        project = _inspection_project()
        other_project = _inspection_project()
        _published_version(other_project, InspectionDocumentKind.IMPARTIALITY)

        assert resolve_applicable_version(project, InspectionDocumentKind.IMPARTIALITY) is None


@pytest.mark.unit
class TestSignatureSatisfiesObligation:
    @pytest.mark.django_db
    def test_a_clean_signature_satisfies(self, enforcement_on, unnamed_route):
        project = _inspection_project()
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        version = _published_version(project, InspectionDocumentKind.IMPARTIALITY)
        InspectionSignatureFactory(
            project=project,
            member=member,
            template_version=version,
            kind=InspectionDocumentKind.IMPARTIALITY,
            review_status="NOT_REQUIRED",
        )

        assert outstanding_kinds(project, member.id) == []

    @pytest.mark.django_db
    def test_pending_review_does_not_satisfy(self, enforcement_on, unnamed_route):
        """§4.1 asks for a risk ANALYSIS - the analysis is the human verdict,
        not the signature. A disclosed conflict must not grant access by itself."""
        project = _inspection_project()
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        version = _published_version(project, InspectionDocumentKind.IMPARTIALITY)
        InspectionSignatureFactory(
            project=project,
            member=member,
            template_version=version,
            kind=InspectionDocumentKind.IMPARTIALITY,
            review_status="PENDING",
            declared_conflicts=True,
        )

        assert outstanding_kinds(project, member.id) == [InspectionDocumentKind.IMPARTIALITY]

    @pytest.mark.django_db
    @pytest.mark.parametrize("verdict", ["ACCEPTED", "ACCEPTED_WITH_MEASURES"])
    def test_accepted_review_satisfies(self, verdict, enforcement_on, unnamed_route):
        project = _inspection_project()
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        version = _published_version(project, InspectionDocumentKind.IMPARTIALITY)
        InspectionSignatureFactory(
            project=project,
            member=member,
            template_version=version,
            kind=InspectionDocumentKind.IMPARTIALITY,
            review_status=verdict,
            declared_conflicts=True,
        )

        assert outstanding_kinds(project, member.id) == []

    @pytest.mark.django_db
    def test_rejected_review_never_satisfies(self, enforcement_on, unnamed_route):
        project = _inspection_project()
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        version = _published_version(project, InspectionDocumentKind.IMPARTIALITY)
        InspectionSignatureFactory(
            project=project,
            member=member,
            template_version=version,
            kind=InspectionDocumentKind.IMPARTIALITY,
            review_status="REJECTED",
        )

        assert outstanding_kinds(project, member.id) == [InspectionDocumentKind.IMPARTIALITY]

    @pytest.mark.django_db
    def test_signing_an_older_version_does_not_satisfy_the_current_one(
        self, enforcement_on, unnamed_route
    ):
        project = _inspection_project()
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        old = _published_version(project, InspectionDocumentKind.IMPARTIALITY, version=1)
        InspectionSignatureFactory(
            project=project,
            member=member,
            template_version=old,
            kind=InspectionDocumentKind.IMPARTIALITY,
            review_status="NOT_REQUIRED",
        )
        InspectionDocumentTemplateVersionFactory(
            template=old.template, version=2, published_at=timezone.now()
        )

        assert outstanding_kinds(project, member.id) == [InspectionDocumentKind.IMPARTIALITY]

    @pytest.mark.django_db
    def test_another_members_signature_does_not_satisfy_mine(self, enforcement_on, unnamed_route):
        project = _inspection_project()
        member, colleague = UserFactory(), UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        ProjectMemberFactory(project=project, member=colleague, role=15)
        version = _published_version(project, InspectionDocumentKind.IMPARTIALITY)
        InspectionSignatureFactory(
            project=project,
            member=colleague,
            template_version=version,
            kind=InspectionDocumentKind.IMPARTIALITY,
            review_status="NOT_REQUIRED",
        )

        assert outstanding_kinds(project, member.id) == [InspectionDocumentKind.IMPARTIALITY]


@pytest.mark.unit
class TestGracePeriod:
    @pytest.mark.django_db
    def test_inside_grace_the_request_passes(self, enforcement_on, unnamed_route):
        project = _inspection_project(inspection_grace_period_days=7)
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        _published_version(project, InspectionDocumentKind.IMPARTIALITY)

        assert enforce_inspection_compliance(FakeRequest(member), project.id) is None
        # The clock was created lazily by that very call.
        assert InspectionObligation.objects.filter(project=project, member=member).count() == 1

    @pytest.mark.django_db
    def test_past_grace_the_request_is_blocked(self, enforcement_on, unnamed_route):
        project = _inspection_project(inspection_grace_period_days=7)
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        _published_version(project, InspectionDocumentKind.IMPARTIALITY)

        enforce_inspection_compliance(FakeRequest(member), project.id)
        _age_obligations(project, 8)
        payload = enforce_inspection_compliance(FakeRequest(member), project.id)

        assert payload is not None
        assert payload["error_code"] == ERROR_CODE
        assert payload["outstanding"] == [InspectionDocumentKind.IMPARTIALITY]
        assert payload["project_id"] == str(project.id)

    @pytest.mark.django_db
    def test_zero_day_grace_blocks_on_the_next_request(self, enforcement_on, unnamed_route):
        """`inspection_grace_period_days=0` is how an admin demands signatures
        up front for a sensitive engagement."""
        project = _inspection_project(inspection_grace_period_days=0)
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        _published_version(project, InspectionDocumentKind.IMPARTIALITY)

        enforce_inspection_compliance(FakeRequest(member), project.id)
        _age_obligations(project, 1)

        assert enforce_inspection_compliance(FakeRequest(member), project.id) is not None

    @pytest.mark.django_db
    def test_blocked_since_is_stamped_once_and_not_rewritten(self, enforcement_on, unnamed_route):
        project = _inspection_project()
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        _published_version(project, InspectionDocumentKind.IMPARTIALITY)
        enforce_inspection_compliance(FakeRequest(member), project.id)
        _age_obligations(project, 30)

        enforce_inspection_compliance(FakeRequest(member), project.id)
        first = InspectionObligation.objects.get(project=project, member=member).blocked_since
        enforce_inspection_compliance(FakeRequest(member), project.id)
        second = InspectionObligation.objects.get(project=project, member=member).blocked_since

        assert first is not None
        assert first == second, "the blocked transition must be recorded once, not on every request"


@pytest.mark.unit
class TestLockoutRegressions:
    """Every escape hatch the gate claims. See this module's docstring."""

    @pytest.mark.django_db
    def test_every_exempt_route_stays_reachable_while_blocked(self, enforcement_on):
        project = _inspection_project()
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=20)
        _published_version(project, InspectionDocumentKind.IMPARTIALITY)
        enforce_inspection_compliance(FakeRequest(member), project.id)
        _age_obligations(project, 90)

        for url_name in sorted(EXEMPT_URL_NAMES):
            with mock.patch.object(
                inspection_compliance, "_request_url_name", return_value=url_name
            ):
                assert (
                    enforce_inspection_compliance(FakeRequest(member), project.id) is None
                ), f"{url_name} must stay reachable for a blocked member"

    @pytest.mark.django_db
    def test_blocked_admin_can_still_reach_the_inspection_config(self, enforcement_on):
        """The in-product way out: turn the mode off, or pause enforcement, on
        the project that is blocking you."""
        project = _inspection_project()
        admin = UserFactory()
        ProjectMemberFactory(project=project, member=admin, role=20)
        _published_version(project, InspectionDocumentKind.IMPARTIALITY)
        enforce_inspection_compliance(FakeRequest(admin), project.id)
        _age_obligations(project, 90)

        with mock.patch.object(
            inspection_compliance, "_request_url_name", return_value="project-inspection-config"
        ):
            assert enforce_inspection_compliance(FakeRequest(admin), project.id) is None

    @pytest.mark.django_db
    def test_the_signing_endpoints_are_never_blocked(self, enforcement_on):
        """Otherwise the obligation would be impossible to discharge - the exact
        shape of bc7bab8bd's permanent lockout."""
        project = _inspection_project()
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        _published_version(project, InspectionDocumentKind.IMPARTIALITY)
        enforce_inspection_compliance(FakeRequest(member), project.id)
        _age_obligations(project, 90)

        for url_name in ("project-inspection-me", "project-inspection-sign"):
            with mock.patch.object(
                inspection_compliance, "_request_url_name", return_value=url_name
            ):
                assert enforce_inspection_compliance(FakeRequest(member), project.id) is None

    @pytest.mark.django_db
    def test_gate_fails_open_on_any_internal_error(self, enforcement_on, unnamed_route):
        """Failing closed on an unexpected error is how bc7bab8bd locked people
        out with no way back in. This is an evidence control, not a last line of
        defence."""
        project = _inspection_project()
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)

        with mock.patch.object(
            inspection_compliance, "outstanding_kinds", side_effect=RuntimeError("boom")
        ):
            assert enforce_inspection_compliance(FakeRequest(member), project.id) is None

    @pytest.mark.django_db
    def test_a_rejoining_member_gets_a_fresh_clock(self, enforcement_on, unnamed_route):
        """`ProjectMember.created_at` is the ORIGINAL join date (rows are reused
        on reactivation), so anchoring on it would make a returning member born
        already blocked. The obligation's own clock must not inherit that."""
        project = _inspection_project()
        member = UserFactory()
        membership = ProjectMemberFactory(project=project, member=member, role=15)
        _published_version(project, InspectionDocumentKind.IMPARTIALITY)

        # Long-standing membership, but the obligation is observed only now.
        ProjectMemberFactory._meta.model.objects.filter(pk=membership.pk).update(
            created_at=timezone.now() - timedelta(days=365)
        )

        assert enforce_inspection_compliance(FakeRequest(member), project.id) is None
        obligation = InspectionObligation.objects.get(project=project, member=member)
        assert obligation.blocked_since is None
        assert timezone.now() - obligation.obligation_started_at < timedelta(minutes=1)

    @pytest.mark.django_db
    def test_enabling_inspection_on_an_old_project_does_not_block_instantly(
        self, enforcement_on, unnamed_route
    ):
        """Anchoring the clock on the project's own enable time would block every
        existing member the instant an admin flipped the switch."""
        project = _inspection_project(inspection_enabled_at=timezone.now() - timedelta(days=365))
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        _published_version(project, InspectionDocumentKind.IMPARTIALITY)

        assert enforce_inspection_compliance(FakeRequest(member), project.id) is None

    @pytest.mark.django_db
    def test_obligations_are_created_lazily_without_any_membership_hook(
        self, enforcement_on, unnamed_route
    ):
        """No signal, no call-site edit, no backfill - the row appears on first
        observation. This is what makes `bulk_update()` reactivation paths safe."""
        project = _inspection_project()
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        for kind in InspectionDocumentKind.values:
            _published_version(project, kind)

        assert InspectionObligation.objects.filter(project=project).count() == 0
        enforce_inspection_compliance(FakeRequest(member), project.id)
        assert InspectionObligation.objects.filter(project=project, member=member).count() == len(
            InspectionDocumentKind
        )


@pytest.mark.unit
class TestSigningSequence:
    """Charter, then impartiality, then NDA - enforced, not merely suggested."""

    @pytest.mark.django_db
    def test_outstanding_is_returned_in_signing_order(self, enforcement_on):
        project = _inspection_project()
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        for kind in InspectionDocumentKind.values:
            _published_version(project, kind)

        assert outstanding_kinds(project, member.id) == [
            "ETHICS_CHARTER",
            "IMPARTIALITY",
            "CONFIDENTIALITY",
        ]

    @pytest.mark.django_db
    def test_the_charter_is_signable_first_and_the_others_are_not(self):
        project = _inspection_project()
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        for kind in InspectionDocumentKind.values:
            _published_version(project, kind)

        assert next_signable_kind(project, member.id) == "ETHICS_CHARTER"
        assert unmet_prerequisites(project, member.id, "ETHICS_CHARTER") == []
        assert unmet_prerequisites(project, member.id, "IMPARTIALITY") == ["ETHICS_CHARTER"]
        assert unmet_prerequisites(project, member.id, "CONFIDENTIALITY") == [
            "ETHICS_CHARTER",
            "IMPARTIALITY",
        ]

    @pytest.mark.django_db
    def test_signing_the_charter_unlocks_impartiality_only(self):
        project = _inspection_project()
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        versions = {kind: _published_version(project, kind) for kind in InspectionDocumentKind.values}
        InspectionSignatureFactory(
            project=project,
            member=member,
            template_version=versions["ETHICS_CHARTER"],
            kind="ETHICS_CHARTER",
            review_status="NOT_REQUIRED",
        )

        assert next_signable_kind(project, member.id) == "IMPARTIALITY"
        assert unmet_prerequisites(project, member.id, "CONFIDENTIALITY") == ["IMPARTIALITY"]

    @pytest.mark.django_db
    def test_a_pending_review_still_unlocks_the_next_document(self):
        """The sequence advances on SIGNATURE, not on a manager's verdict -
        otherwise one disclosed conflict freezes onboarding until somebody
        reviews it. The obligation itself stays unmet; only progression moves."""
        project = _inspection_project()
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        versions = {kind: _published_version(project, kind) for kind in InspectionDocumentKind.values}
        InspectionSignatureFactory(
            project=project,
            member=member,
            template_version=versions["ETHICS_CHARTER"],
            kind="ETHICS_CHARTER",
            review_status="NOT_REQUIRED",
        )
        InspectionSignatureFactory(
            project=project,
            member=member,
            template_version=versions["IMPARTIALITY"],
            kind="IMPARTIALITY",
            review_status="PENDING",
            declared_conflicts=True,
        )

        assert unmet_prerequisites(project, member.id, "CONFIDENTIALITY") == []
        assert next_signable_kind(project, member.id) == "CONFIDENTIALITY"
        # Still owed, because PENDING does not discharge it.
        assert "IMPARTIALITY" in outstanding_kinds(project, member.id)

    @pytest.mark.django_db
    def test_an_unpublished_predecessor_is_not_a_prerequisite(self):
        """Otherwise publishing a partial document set would wedge every
        evaluator behind a document that does not exist yet."""
        project = _inspection_project()
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        _published_version(project, InspectionDocumentKind.CONFIDENTIALITY)

        assert unmet_prerequisites(project, member.id, "CONFIDENTIALITY") == []
        assert next_signable_kind(project, member.id) == "CONFIDENTIALITY"

    @pytest.mark.django_db
    def test_signed_kinds_ignores_the_review_verdict(self):
        project = _inspection_project()
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        version = _published_version(project, InspectionDocumentKind.IMPARTIALITY)
        InspectionSignatureFactory(
            project=project,
            member=member,
            template_version=version,
            kind="IMPARTIALITY",
            review_status="REJECTED",
        )

        assert signed_kinds(project, member.id) == {"IMPARTIALITY"}

    @pytest.mark.django_db
    def test_nothing_is_signable_once_everything_is_satisfied(self):
        project = _inspection_project()
        member = UserFactory()
        ProjectMemberFactory(project=project, member=member, role=15)
        for kind in InspectionDocumentKind.values:
            version = _published_version(project, kind)
            InspectionSignatureFactory(
                project=project,
                member=member,
                template_version=version,
                kind=kind,
                review_status="NOT_REQUIRED",
            )

        assert next_signable_kind(project, member.id) is None
