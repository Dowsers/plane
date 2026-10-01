# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import factory
from uuid import uuid4
from django.utils import timezone

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
    Workspace,
    WorkspaceMember,
)


class UserFactory(factory.django.DjangoModelFactory):
    """Factory for creating User instances"""

    class Meta:
        model = User
        django_get_or_create = ("email",)

    id = factory.LazyFunction(uuid4)
    email = factory.Sequence(lambda n: f"user{n}@plane.so")
    # `User.username` is `unique=True` with no model-level default/auto-fill
    # (unlike `display_name`, which `User.save()` derives from `email` when
    # blank) - left unset, every factory-created User would get the same
    # `username=""`, so a second `UserFactory()` call in the same test would
    # violate the unique constraint. Drive-by fix found while writing this
    # feature's own throwaway test suite (category 10, features 1+3), which
    # is the first place in this codebase to call `UserFactory()` more than
    # once per test.
    username = factory.Sequence(lambda n: f"user{n}")
    password = factory.PostGenerationMethodCall("set_password", "password")
    first_name = factory.Sequence(lambda n: f"First{n}")
    last_name = factory.Sequence(lambda n: f"Last{n}")
    is_active = True
    is_superuser = False
    is_staff = False


class WorkspaceFactory(factory.django.DjangoModelFactory):
    """Factory for creating Workspace instances"""

    class Meta:
        model = Workspace
        django_get_or_create = ("slug",)

    id = factory.LazyFunction(uuid4)
    name = factory.Sequence(lambda n: f"Workspace {n}")
    slug = factory.Sequence(lambda n: f"workspace-{n}")
    owner = factory.SubFactory(UserFactory)
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class WorkspaceMemberFactory(factory.django.DjangoModelFactory):
    """Factory for creating WorkspaceMember instances"""

    class Meta:
        model = WorkspaceMember

    id = factory.LazyFunction(uuid4)
    workspace = factory.SubFactory(WorkspaceFactory)
    member = factory.SubFactory(UserFactory)
    role = 20  # Admin role by default
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class ProjectFactory(factory.django.DjangoModelFactory):
    """Factory for creating Project instances"""

    class Meta:
        model = Project
        django_get_or_create = ("name", "workspace")

    id = factory.LazyFunction(uuid4)
    name = factory.Sequence(lambda n: f"Project {n}")
    # `Project.identifier` is a TextField with no model-level default, so an
    # unset one becomes `""` - and a partial unique constraint
    # (`project_unique_identifier_workspace_when_deleted_at_null`) then makes a
    # SECOND `ProjectFactory()` call in the same workspace fail with an
    # IntegrityError. Same drive-by fix, for the same reason, as the
    # `UserFactory.username` sequence above: the inspection-compliance test
    # suite is the first place in this codebase to create two projects inside
    # one workspace in a single test.
    identifier = factory.Sequence(lambda n: f"PRJ{n}")
    workspace = factory.SubFactory(WorkspaceFactory)
    created_by = factory.SelfAttribute("workspace.owner")
    updated_by = factory.SelfAttribute("workspace.owner")
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class ProjectMemberFactory(factory.django.DjangoModelFactory):
    """Factory for creating ProjectMember instances"""

    class Meta:
        model = ProjectMember

    id = factory.LazyFunction(uuid4)
    project = factory.SubFactory(ProjectFactory)
    member = factory.SubFactory(UserFactory)
    role = 20  # Admin role by default
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


# --- Inspection compliance (see plane.db.models.inspection)


class InspectionDocumentTemplateFactory(factory.django.DjangoModelFactory):
    """Factory for InspectionDocumentTemplate instances.

    Defaults to a WORKSPACE-scoped template (`project=None`), the common case.
    Pass `project=<project>` for the per-project override variant - note that
    `WorkspaceBaseModel.save()` then derives `workspace` from the project, so
    passing both an unrelated workspace and a project is pointless.
    """

    class Meta:
        model = InspectionDocumentTemplate

    id = factory.LazyFunction(uuid4)
    workspace = factory.SubFactory(WorkspaceFactory)
    project = None
    kind = InspectionDocumentKind.IMPARTIALITY
    name = factory.Sequence(lambda n: f"Impartiality declaration {n}")
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class InspectionDocumentTemplateVersionFactory(factory.django.DjangoModelFactory):
    """Factory for InspectionDocumentTemplateVersion instances.

    Creates a DRAFT (`published_at=None`), because a published version is
    immutable and most tests need to arrange content before freezing it. Pass
    `published_at=timezone.now()` for an already-published version.
    """

    class Meta:
        model = InspectionDocumentTemplateVersion

    id = factory.LazyFunction(uuid4)
    template = factory.SubFactory(InspectionDocumentTemplateFactory)
    version = factory.Sequence(lambda n: n + 1)
    body = "Déclaration d'impartialité de l'évaluateur."
    # The real 15-question form, so tests exercise the shipped schema rather
    # than a toy stand-in. Copied per instance: a published version is
    # immutable, but a draft is not, and a shared mutable list would leak edits
    # between tests.
    questionnaire_schema = factory.LazyFunction(
        lambda: [dict(question) for question in DEFAULT_IMPARTIALITY_QUESTIONNAIRE]
    )
    published_at = None
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class InspectionSignatureFactory(factory.django.DjangoModelFactory):
    """Factory for InspectionSignature instances."""

    class Meta:
        model = InspectionSignature

    id = factory.LazyFunction(uuid4)
    project = factory.SubFactory(ProjectFactory)
    member = factory.SubFactory(UserFactory)
    template_version = factory.SubFactory(InspectionDocumentTemplateVersionFactory)
    kind = InspectionDocumentKind.IMPARTIALITY
    signed_at = factory.LazyFunction(timezone.now)
    signature_name_snapshot = "Test Signer"
    signer_email_snapshot = factory.Sequence(lambda n: f"signer{n}@plane.so")
    ip_address = "198.51.100.10"
    user_agent = "pytest"
    document_checksum = factory.Sequence(lambda n: f"{n:064d}")
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class InspectionObligationFactory(factory.django.DjangoModelFactory):
    """Factory for InspectionObligation instances (the per-member grace clock)."""

    class Meta:
        model = InspectionObligation

    id = factory.LazyFunction(uuid4)
    project = factory.SubFactory(ProjectFactory)
    member = factory.SubFactory(UserFactory)
    kind = InspectionDocumentKind.IMPARTIALITY
    obligation_started_at = factory.LazyFunction(timezone.now)
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)
