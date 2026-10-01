# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the inspection compliance endpoints (ISO/IEC 17020
§4.1/§4.2).

`TestGateThroughRealUrls` is the most valuable class here: the unit tests of
the gate mock `_request_url_name`, so only these exercise the real URL resolver
and therefore actually prove that the exemptions line up with the routes as
registered. A mismatch there is what would silently lock somebody out.

URLs are built by hand rather than via `reverse()`, matching
`test_project_app.TestProjectBase`'s own note: `name` values are duplicated
between the `api` and `app` URLconfs, so `reverse()` is unreliable here.
"""

from datetime import timedelta
from unittest import mock

import pytest
from django.utils import timezone
from rest_framework import status

from plane.db.models import (
    DEFAULT_IMPARTIALITY_QUESTIONNAIRE,
    InspectionDocumentKind,
    InspectionDocumentTemplate,
    InspectionDocumentTemplateVersion,
    InspectionObligation,
    InspectionSignature,
    Project,
    ProjectMember,
    User,
    WorkspaceMember,
)
from plane.utils import inspection_compliance


def _project(workspace, **kwargs):
    defaults = {"name": "Inspection Engagement", "identifier": "INSP", "workspace": workspace}
    defaults.update(kwargs)
    return Project.objects.create(**defaults)


def _member(workspace, project, email, role=15):
    user = User.objects.create(email=email, username=email.split("@")[0])
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
    ProjectMember.objects.create(project=project, workspace=workspace, member=user, role=role)
    return user


def _published(workspace, kind, *, project=None, body="Texte du document", schema=None, version=1):
    template = InspectionDocumentTemplate.objects.create(
        workspace=workspace, project=project, kind=kind, name=f"{kind} template"
    )
    return InspectionDocumentTemplateVersion.objects.create(
        template=template,
        version=version,
        body=body,
        questionnaire_schema=schema if schema is not None else [],
        published_at=timezone.now(),
    )


def _clean_answers():
    answers = {}
    for question in DEFAULT_IMPARTIALITY_QUESTIONNAIRE:
        if "required_value" in question:
            answers[question["key"]] = question["required_value"]
        else:
            answers[question["key"]] = not question["conflict_if"]
    return answers


def _config_url(slug, project_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/inspection-config/"


def _templates_url(slug):
    return f"/api/workspaces/{slug}/inspection-templates/"


def _versions_url(slug, template_id):
    return f"/api/workspaces/{slug}/inspection-templates/{template_id}/versions/"


def _publish_url(slug, template_id, version_id):
    return f"{_versions_url(slug, template_id)}{version_id}/publish/"


def _me_url(slug, project_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/inspection/me/"


def _sign_url(slug, project_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/inspection/sign/"


def _review_url(slug, project_id, signature_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/inspection/declarations/{signature_id}/review/"


def _compliance_url(slug, project_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/inspection/compliance/"


@pytest.fixture
def admin_project(workspace, create_user):
    """`create_user` is already a role-20 workspace member via the `workspace`
    fixture; make them a project Admin too."""
    project = _project(workspace, is_inspection_enabled=True)
    ProjectMember.objects.create(
        project=project, workspace=workspace, member=create_user, role=20
    )
    return project


@pytest.mark.contract
class TestInspectionConfig:
    @pytest.mark.django_db
    def test_admin_reads_the_config(self, session_client, workspace, admin_project):
        response = session_client.get(_config_url(workspace.slug, admin_project.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["is_inspection_enabled"] is True
        assert response.json()["inspection_mode"] == "MANUAL"
        assert response.json()["inspection_grace_period_days"] == 7

    @pytest.mark.django_db
    def test_admin_enables_inspection_and_sets_the_mode(self, session_client, workspace, create_user):
        project = _project(workspace)
        ProjectMember.objects.create(project=project, workspace=workspace, member=create_user, role=20)

        response = session_client.patch(
            _config_url(workspace.slug, project.id),
            {"is_inspection_enabled": True, "inspection_mode": "SEMI_AUTOMATIC"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        project.refresh_from_db()
        assert project.is_inspection_enabled is True
        assert project.inspection_mode == "SEMI_AUTOMATIC"
        # Stamped by the view, never supplied by the client.
        assert project.inspection_enabled_at is not None

    @pytest.mark.django_db
    def test_non_admin_member_cannot_read_the_config(self, api_client, workspace, admin_project):
        plain = _member(workspace, admin_project, "member@plane.so", role=15)
        api_client.force_authenticate(user=plain)

        response = api_client.get(_config_url(workspace.slug, admin_project.id))

        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
class TestTemplatesAndVersions:
    @pytest.mark.django_db
    def test_creating_an_impartiality_template_seeds_the_fifteen_questions(
        self, session_client, workspace
    ):
        """An admin must never retype the issued form."""
        response = session_client.post(
            _templates_url(workspace.slug),
            {"kind": "IMPARTIALITY", "body": "Déclaration d'impartialité"},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        versions = response.json()["versions"]
        assert len(versions) == 1
        assert versions[0]["version"] == 1
        assert versions[0]["is_published"] is False, "version 1 starts as a draft"
        assert len(versions[0]["questionnaire_schema"]) == 15

    @pytest.mark.django_db
    @pytest.mark.parametrize("kind", ["CONFIDENTIALITY", "ETHICS_CHARTER"])
    def test_accept_the_text_documents_get_no_questionnaire(self, kind, session_client, workspace):
        response = session_client.post(
            _templates_url(workspace.slug), {"kind": kind}, format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["versions"][0]["questionnaire_schema"] == []

    @pytest.mark.django_db
    def test_scope_is_spelled_out_not_inferred(self, session_client, workspace):
        response = session_client.post(
            _templates_url(workspace.slug), {"kind": "CONFIDENTIALITY"}, format="json"
        )

        assert response.json()["scope"] == "WORKSPACE"

    @pytest.mark.django_db
    def test_a_second_default_of_the_same_kind_is_rejected(self, session_client, workspace):
        session_client.post(_templates_url(workspace.slug), {"kind": "IMPARTIALITY"}, format="json")

        response = session_client.post(
            _templates_url(workspace.slug), {"kind": "IMPARTIALITY"}, format="json"
        )

        assert response.status_code == status.HTTP_409_CONFLICT

    @pytest.mark.django_db
    def test_unknown_kind_is_rejected(self, session_client, workspace):
        response = session_client.post(
            _templates_url(workspace.slug), {"kind": "NOT_A_KIND"}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_new_versions_are_numbered_by_the_server(self, session_client, workspace):
        created = session_client.post(
            _templates_url(workspace.slug), {"kind": "CONFIDENTIALITY"}, format="json"
        ).json()
        template_id = created["id"]

        response = session_client.post(
            _versions_url(workspace.slug, template_id),
            {"body": "NDA v2", "version": 99},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["version"] == 2, "client-supplied version is ignored"

    @pytest.mark.django_db
    def test_a_published_version_cannot_be_patched(self, session_client, workspace):
        """Level 2 of the immutability guarantee - the API refuses before the
        model's own `save()` guard ever has to."""
        created = session_client.post(
            _templates_url(workspace.slug), {"kind": "CONFIDENTIALITY"}, format="json"
        ).json()
        template_id = created["id"]
        version_id = created["versions"][0]["id"]
        session_client.post(_publish_url(workspace.slug, template_id, version_id))

        response = session_client.patch(
            f"{_versions_url(workspace.slug, template_id)}{version_id}/",
            {"body": "tampered"},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_publishing_twice_is_rejected(self, session_client, workspace):
        created = session_client.post(
            _templates_url(workspace.slug), {"kind": "CONFIDENTIALITY"}, format="json"
        ).json()
        template_id, version_id = created["id"], created["versions"][0]["id"]
        session_client.post(_publish_url(workspace.slug, template_id, version_id))

        response = session_client.post(_publish_url(workspace.slug, template_id, version_id))

        assert response.status_code == status.HTTP_409_CONFLICT

    @pytest.mark.django_db
    def test_a_malformed_questionnaire_schema_is_rejected(self, session_client, workspace):
        """A question carrying both polarities would leave the evaluator unable
        to say what an answer means."""
        created = session_client.post(
            _templates_url(workspace.slug), {"kind": "IMPARTIALITY"}, format="json"
        ).json()

        response = session_client.post(
            _versions_url(workspace.slug, created["id"]),
            {
                "questionnaire_schema": [
                    {
                        "key": "k",
                        "label": "?",
                        "type": "boolean",
                        "conflict_if": True,
                        "required_value": True,
                    }
                ]
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_publishing_resets_every_affected_grace_clock(self, session_client, workspace, admin_project):
        """Otherwise republishing an NDA would put everybody instantly past
        their deadline - one of the three documented lockout traps."""
        created = session_client.post(
            _templates_url(workspace.slug), {"kind": "CONFIDENTIALITY"}, format="json"
        ).json()
        template_id, v1 = created["id"], created["versions"][0]["id"]
        session_client.post(_publish_url(workspace.slug, template_id, v1))

        stale = timezone.now() - timedelta(days=90)
        obligation = InspectionObligation.objects.create(
            project=admin_project,
            workspace=workspace,
            member=admin_project.workspace.owner,
            kind=InspectionDocumentKind.CONFIDENTIALITY,
            obligation_started_at=stale,
            blocked_since=stale,
            reminder_count=4,
        )

        v2 = session_client.post(
            _versions_url(workspace.slug, template_id), {"body": "NDA v2"}, format="json"
        ).json()["id"]
        session_client.post(_publish_url(workspace.slug, template_id, v2))

        obligation.refresh_from_db()
        assert obligation.blocked_since is None
        assert obligation.reminder_count == 0
        assert obligation.obligation_started_at > stale


@pytest.mark.contract
class TestMeAndSign:
    @pytest.mark.django_db
    def test_me_lists_only_published_applicable_documents(
        self, session_client, workspace, admin_project
    ):
        _published(workspace, InspectionDocumentKind.CONFIDENTIALITY)
        # A draft must not appear.
        draft_template = InspectionDocumentTemplate.objects.create(
            workspace=workspace, kind=InspectionDocumentKind.ETHICS_CHARTER, name="charter"
        )
        InspectionDocumentTemplateVersion.objects.create(
            template=draft_template, version=1, published_at=None
        )

        response = session_client.get(_me_url(workspace.slug, admin_project.id))

        assert response.status_code == status.HTTP_200_OK
        kinds = [doc["kind"] for doc in response.json()["documents"]]
        assert kinds == ["CONFIDENTIALITY"]

    @pytest.mark.django_db
    def test_signing_records_the_evidence(self, session_client, workspace, admin_project):
        version = _published(workspace, InspectionDocumentKind.CONFIDENTIALITY, body="NDA text")

        response = session_client.post(
            _sign_url(workspace.slug, admin_project.id),
            {"template_version_id": str(version.id), "signature_name": "Quentin Anes"},
            format="json",
            HTTP_USER_AGENT="pytest-agent",
        )

        assert response.status_code == status.HTTP_201_CREATED
        body = response.json()
        assert body["signature_name_snapshot"] == "Quentin Anes"
        assert body["signer_email_snapshot"] == "test@plane.so"
        assert body["requires_review"] is False
        assert body["review_status"] == "NOT_REQUIRED"

        signature = InspectionSignature.objects.get(id=body["id"])
        import hashlib

        assert signature.document_checksum == hashlib.sha256(b"NDA text").hexdigest()
        assert signature.user_agent == "pytest-agent"

    @pytest.mark.django_db
    def test_signing_the_same_version_twice_is_rejected(self, session_client, workspace, admin_project):
        version = _published(workspace, InspectionDocumentKind.CONFIDENTIALITY)
        payload = {"template_version_id": str(version.id), "signature_name": "X"}
        session_client.post(_sign_url(workspace.slug, admin_project.id), payload, format="json")

        response = session_client.post(
            _sign_url(workspace.slug, admin_project.id), payload, format="json"
        )

        assert response.status_code == status.HTTP_409_CONFLICT

    @pytest.mark.django_db
    def test_a_version_from_another_project_cannot_be_signed(
        self, session_client, workspace, admin_project
    ):
        """Otherwise an obligation could be discharged by signing some other
        project's document."""
        other = _project(workspace, name="Other", identifier="OTH")
        foreign = _published(workspace, InspectionDocumentKind.CONFIDENTIALITY, project=other)

        response = session_client.post(
            _sign_url(workspace.slug, admin_project.id),
            {"template_version_id": str(foreign.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_an_incomplete_questionnaire_is_rejected(self, session_client, workspace, admin_project):
        version = _published(
            workspace,
            InspectionDocumentKind.IMPARTIALITY,
            schema=[dict(q) for q in DEFAULT_IMPARTIALITY_QUESTIONNAIRE],
        )

        response = session_client.post(
            _sign_url(workspace.slug, admin_project.id),
            {"template_version_id": str(version.id), "questionnaire_answers": {}},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert len(response.json()["missing"]) == 15

    @pytest.mark.django_db
    def test_a_clean_declaration_needs_no_review(self, session_client, workspace, admin_project):
        version = _published(
            workspace,
            InspectionDocumentKind.IMPARTIALITY,
            schema=[dict(q) for q in DEFAULT_IMPARTIALITY_QUESTIONNAIRE],
        )

        response = session_client.post(
            _sign_url(workspace.slug, admin_project.id),
            {"template_version_id": str(version.id), "questionnaire_answers": _clean_answers()},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["requires_review"] is False
        assert response.json()["declared_conflicts"] is False

    @pytest.mark.django_db
    def test_a_disclosed_conflict_is_recorded_and_sent_to_review(
        self, session_client, workspace, admin_project
    ):
        version = _published(
            workspace,
            InspectionDocumentKind.IMPARTIALITY,
            schema=[dict(q) for q in DEFAULT_IMPARTIALITY_QUESTIONNAIRE],
        )
        answers = _clean_answers()
        answers["financial_interest"] = True

        response = session_client.post(
            _sign_url(workspace.slug, admin_project.id),
            {"template_version_id": str(version.id), "questionnaire_answers": answers},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED, "a disclosure is recorded, not refused"
        body = response.json()
        assert body["conflicts"] == ["financial_interest"]
        assert body["declared_conflicts"] is True
        assert body["review_status"] == "PENDING"

    @pytest.mark.django_db
    def test_a_contradicted_attestation_is_recorded_and_sent_to_review(
        self, session_client, workspace, admin_project
    ):
        """Ticking "I do NOT attest to being impartial" must not be discarded -
        it is the single most important thing §4.1 exists to surface."""
        version = _published(
            workspace,
            InspectionDocumentKind.IMPARTIALITY,
            schema=[dict(q) for q in DEFAULT_IMPARTIALITY_QUESTIONNAIRE],
        )
        answers = _clean_answers()
        answers["attests_impartiality"] = False

        response = session_client.post(
            _sign_url(workspace.slug, admin_project.id),
            {"template_version_id": str(version.id), "questionnaire_answers": answers},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["failed_attestations"] == ["attests_impartiality"]
        assert response.json()["review_status"] == "PENDING"


@pytest.mark.contract
class TestReview:
    def _pending_signature(self, client, workspace, project, member=None):
        version = _published(
            workspace,
            InspectionDocumentKind.IMPARTIALITY,
            schema=[dict(q) for q in DEFAULT_IMPARTIALITY_QUESTIONNAIRE],
        )
        answers = _clean_answers()
        answers["team_relationships"] = True
        return InspectionSignature.objects.create(
            project=project,
            workspace=workspace,
            member=member or project.workspace.owner,
            template_version=version,
            kind=InspectionDocumentKind.IMPARTIALITY,
            signed_at=timezone.now(),
            questionnaire_answers=answers,
            declared_conflicts=True,
            review_status="PENDING",
        )

    @pytest.mark.django_db
    def test_a_reviewer_cannot_review_their_own_declaration(
        self, session_client, workspace, admin_project, create_user
    ):
        signature = self._pending_signature(session_client, workspace, admin_project, member=create_user)

        response = session_client.patch(
            _review_url(workspace.slug, admin_project.id, signature.id),
            {"review_status": "ACCEPTED", "risk_level": "LOW"},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_a_plain_member_cannot_review(self, api_client, workspace, admin_project):
        signature = self._pending_signature(api_client, workspace, admin_project)
        plain = _member(workspace, admin_project, "plain@plane.so", role=15)
        api_client.force_authenticate(user=plain)

        response = api_client.patch(
            _review_url(workspace.slug, admin_project.id, signature.id),
            {"review_status": "ACCEPTED", "risk_level": "LOW"},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_admin_accepts_with_measures(self, session_client, workspace, admin_project):
        colleague = _member(workspace, admin_project, "colleague@plane.so", role=15)
        signature = self._pending_signature(session_client, workspace, admin_project, member=colleague)

        response = session_client.patch(
            _review_url(workspace.slug, admin_project.id, signature.id),
            {
                "review_status": "ACCEPTED_WITH_MEASURES",
                "risk_level": "MEDIUM",
                "mitigation_measures": "Second reviewer cross-checks the findings.",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        signature.refresh_from_db()
        assert signature.review_status == "ACCEPTED_WITH_MEASURES"
        assert signature.risk_level == "MEDIUM"
        assert signature.reviewed_by_id is not None
        assert signature.reviewed_at is not None

    @pytest.mark.django_db
    def test_accepting_with_measures_requires_the_measures(
        self, session_client, workspace, admin_project
    ):
        """§4.1 asks for an analysis - "accepted with measures" and no measures
        written down would be an empty record."""
        colleague = _member(workspace, admin_project, "colleague2@plane.so", role=15)
        signature = self._pending_signature(session_client, workspace, admin_project, member=colleague)

        response = session_client.patch(
            _review_url(workspace.slug, admin_project.id, signature.id),
            {"review_status": "ACCEPTED_WITH_MEASURES", "risk_level": "MEDIUM"},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_accepting_requires_a_risk_level(self, session_client, workspace, admin_project):
        colleague = _member(workspace, admin_project, "colleague3@plane.so", role=15)
        signature = self._pending_signature(session_client, workspace, admin_project, member=colleague)

        response = session_client.patch(
            _review_url(workspace.slug, admin_project.id, signature.id),
            {"review_status": "ACCEPTED"},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
class TestComplianceDashboard:
    @pytest.mark.django_db
    def test_dashboard_reports_each_active_member(self, session_client, workspace, admin_project):
        _published(workspace, InspectionDocumentKind.CONFIDENTIALITY)
        _member(workspace, admin_project, "auditor@plane.so", role=15)

        response = session_client.get(_compliance_url(workspace.slug, admin_project.id))

        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert body["required_kinds"] == ["CONFIDENTIALITY"]
        emails = {row["member_email"] for row in body["members"]}
        assert emails == {"test@plane.so", "auditor@plane.so"}
        for row in body["members"]:
            assert row["documents"][0]["signed_at"] is None


@pytest.mark.contract
class TestGateThroughRealUrls:
    """End-to-end proof, through the real URL resolver, that the gate blocks an
    ordinary endpoint but never its own escape hatches. The unit tests mock
    `_request_url_name`; only these catch an exemption that does not match the
    route as actually registered."""

    @pytest.fixture
    def blocked_admin_project(self, workspace, create_user):
        project = _project(workspace, is_inspection_enabled=True, inspection_grace_period_days=7)
        ProjectMember.objects.create(
            project=project, workspace=workspace, member=create_user, role=20
        )
        version = _published(workspace, InspectionDocumentKind.CONFIDENTIALITY)
        InspectionObligation.objects.create(
            project=project,
            workspace=workspace,
            member=create_user,
            kind=InspectionDocumentKind.CONFIDENTIALITY,
            obligation_started_at=timezone.now() - timedelta(days=90),
        )
        return project, version

    @pytest.mark.django_db
    def test_an_ordinary_project_read_is_blocked_with_the_error_code(
        self, session_client, workspace, blocked_admin_project
    ):
        project, _version = blocked_admin_project

        with mock.patch.object(
            inspection_compliance, "is_instance_enforcement_enabled", return_value=True
        ):
            response = session_client.get(
                f"/api/workspaces/{workspace.slug}/projects/{project.id}/states/"
            )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        body = response.json()
        assert body["error_code"] == "INSPECTION_SIGNATURE_REQUIRED"
        assert body["outstanding"] == ["CONFIDENTIALITY"]

    @pytest.mark.django_db
    def test_a_blocked_admin_can_still_reach_the_inspection_config(
        self, session_client, workspace, blocked_admin_project
    ):
        """The in-product way out of a lockout."""
        project, _version = blocked_admin_project

        with mock.patch.object(
            inspection_compliance, "is_instance_enforcement_enabled", return_value=True
        ):
            response = session_client.get(_config_url(workspace.slug, project.id))

        assert response.status_code == status.HTTP_200_OK

    @pytest.mark.django_db
    def test_a_blocked_member_can_still_reach_me_and_sign(
        self, session_client, workspace, blocked_admin_project
    ):
        """Without this the obligation would be impossible to discharge - the
        exact shape of the bc7bab8bd permanent lockout."""
        project, version = blocked_admin_project

        with mock.patch.object(
            inspection_compliance, "is_instance_enforcement_enabled", return_value=True
        ):
            me = session_client.get(_me_url(workspace.slug, project.id))
            signed = session_client.post(
                _sign_url(workspace.slug, project.id),
                {"template_version_id": str(version.id), "signature_name": "Q"},
                format="json",
            )

        assert me.status_code == status.HTTP_200_OK
        assert signed.status_code == status.HTTP_201_CREATED

    @pytest.mark.django_db
    def test_signing_unblocks_the_ordinary_endpoint(
        self, session_client, workspace, blocked_admin_project
    ):
        """The whole point: the block lifts the moment the obligation is met."""
        project, version = blocked_admin_project

        with mock.patch.object(
            inspection_compliance, "is_instance_enforcement_enabled", return_value=True
        ):
            session_client.post(
                _sign_url(workspace.slug, project.id),
                {"template_version_id": str(version.id), "signature_name": "Q"},
                format="json",
            )
            response = session_client.get(
                f"/api/workspaces/{workspace.slug}/projects/{project.id}/states/"
            )

        assert response.status_code == status.HTTP_200_OK

    @pytest.mark.django_db
    def test_nothing_is_blocked_while_the_instance_switch_is_off(
        self, session_client, workspace, blocked_admin_project
    ):
        """The shipped default - no surprise activation on upgrade."""
        project, _version = blocked_admin_project

        response = session_client.get(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/states/"
        )

        assert response.status_code == status.HTTP_200_OK
