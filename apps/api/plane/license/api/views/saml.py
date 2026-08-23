# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 1 "SSO SAML 2.0 natif" - instance-admin (god-mode)
CRUD + domain verification + test-connection endpoints. Instance-admin-only
(decision #6) via `BaseAPIView`'s own default `permission_classes =
[InstanceAdminPermission]` (`plane.license.api.views.base`) - the same
class every other god-mode-only endpoint in this app already uses, not a
new permission class.

*** VERIFICATION LIMITATION *** - see `plane.license.models.saml`'s own
module docstring: verified only against self-authored synthetic fixtures,
never a real IdP.
"""

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.db.models import DomainVerificationMethod
from plane.license.api.serializers.saml import InstanceSAMLConfigurationSerializer, SAMLVerifiedDomainSerializer
from plane.license.models import InstanceSAMLConfiguration, SAMLVerifiedDomain
from plane.utils.domain_verification import generate_verification_token, verify_domain_ownership
from plane.utils.exception_logger import log_exception
from plane.utils.saml_xml import SAML_TEST_RELAY_STATE, build_authn_request_redirect_url, sp_acs_url, sp_metadata_url

from .base import BaseAPIView


class InstanceSAMLConfigurationEndpoint(BaseAPIView):
    """
    GET/POST /api/instances/admin/saml-configurations/
    GET/PATCH/DELETE /api/instances/admin/saml-configurations/<pk>/
    """

    def get(self, request, pk=None):
        if pk is not None:
            config = InstanceSAMLConfiguration.objects.filter(pk=pk).first()
            if config is None:
                return Response({"error": "SAML configuration not found."}, status=status.HTTP_404_NOT_FOUND)
            return Response(InstanceSAMLConfigurationSerializer(config).data, status=status.HTTP_200_OK)

        configs = InstanceSAMLConfiguration.objects.prefetch_related("domains").all()
        return Response(InstanceSAMLConfigurationSerializer(configs, many=True).data, status=status.HTTP_200_OK)

    def post(self, request):
        # Exigence 3 - a BRAND NEW configuration can never be created
        # already-enabled: it has no domains at all yet, let alone a
        # verified one.
        if request.data.get("is_enabled"):
            return Response(
                {
                    "error": "A new SAML configuration cannot be created already enabled - "
                    "add and verify at least one domain first, then enable it via PATCH."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = InstanceSAMLConfigurationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        config = serializer.save()
        # Exigence 5 - sp_entity_id is GENERATED, computed once here from
        # this instance's own public base URL + this row's own id, and
        # never changed afterwards (a stable value matters - it's the
        # AudienceRestriction every future assertion is checked against).
        config.sp_entity_id = sp_metadata_url(request, config.id)
        config.save(update_fields=["sp_entity_id"])

        return Response(InstanceSAMLConfigurationSerializer(config).data, status=status.HTTP_201_CREATED)

    def patch(self, request, pk):
        config = InstanceSAMLConfiguration.objects.filter(pk=pk).first()
        if config is None:
            return Response({"error": "SAML configuration not found."}, status=status.HTTP_404_NOT_FOUND)

        # Exigence 3 - turning is_enabled ON requires at least one
        # verified domain. Turning it OFF (or leaving it as-is) is always
        # allowed - exigence 16's immediate-fallback guarantee depends on
        # disabling never being blocked.
        turning_enabled_on = "is_enabled" in request.data and bool(request.data["is_enabled"]) and not config.is_enabled
        if turning_enabled_on and not config.domains.filter(is_verified=True).exists():
            return Response(
                {"error": "Cannot enable this configuration until it has at least one verified domain."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = InstanceSAMLConfigurationSerializer(config, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()

        return Response(InstanceSAMLConfigurationSerializer(config).data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        config = InstanceSAMLConfiguration.objects.filter(pk=pk).first()
        if config is None:
            return Response({"error": "SAML configuration not found."}, status=status.HTTP_404_NOT_FOUND)
        # `soft=False` - a genuine hard delete, deliberately NOT this
        # model's inherited default soft delete. Two reasons: (1) exigence
        # 16's "immediate, no grace period" fallback guarantee - a SOFT
        # delete only sets `deleted_at`; `is_enabled` stays whatever it
        # was, and `plane.utils.saml_enforcement`'s queries reach
        # `InstanceSAMLConfiguration` via `saml_configuration__...` FK
        # traversal from `SAMLVerifiedDomain`, which does NOT go through
        # the soft-delete-aware `objects` manager's own `get_queryset()`
        # filtering (that only applies when querying
        # `InstanceSAMLConfiguration.objects` directly) - so a
        # soft-deleted-but-still-`is_enabled=True` config would keep
        # routing/enforcing SSO for its domains, silently breaking
        # exigence 16. (2) it makes the real FK `on_delete=CASCADE` on
        # `SAMLVerifiedDomain`/`SAMLAssertionReplay` actually fire - a
        # soft delete never triggers real cascade deletion, only a
        # separate best-effort async `soft_delete_related_objects` task.
        config.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class InstanceSAMLDomainEndpoint(BaseAPIView):
    """POST /api/instances/admin/saml-configurations/<pk>/domains/ - add a
    domain, generating its `verification_token` via feature 6's shared
    `plane.utils.domain_verification` utility (decision #1)."""

    def post(self, request, pk):
        config = InstanceSAMLConfiguration.objects.filter(pk=pk).first()
        if config is None:
            return Response({"error": "SAML configuration not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = SAMLVerifiedDomainSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        domain = serializer.validated_data["domain"]
        # Exigence 4 - a domain may only ever belong to ONE
        # SAMLVerifiedDomain row instance-wide (see that model's own
        # docstring for why this is stricter than, and trivially
        # satisfies, "at most one ACTIVE config at a time"). Pre-checked
        # here for a clear, explicit error - the model's own DB-level
        # `unique=True` remains the real backstop against a concurrent
        # race between two simultaneous requests.
        if SAMLVerifiedDomain.objects.filter(domain=domain).exists():
            return Response(
                {"error": f"Domain '{domain}' is already registered to a SAML configuration."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            verified_domain = serializer.save(
                saml_configuration=config, verification_token=generate_verification_token(), is_verified=False
            )
        except Exception:
            # Lost the uniqueness race described above.
            return Response(
                {"error": f"Domain '{domain}' is already registered to a SAML configuration."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(SAMLVerifiedDomainSerializer(verified_domain).data, status=status.HTTP_201_CREATED)


class InstanceSAMLDomainVerifyEndpoint(BaseAPIView):
    """POST /api/instances/admin/saml-configurations/<pk>/domains/<domain_id>/verify/
    - DNS TXT verification only (exigence 3's own wording; unlike feature
    6's `WorkspaceVerifiedDomain` there is no HTML_FILE alternative method
    field on this model)."""

    def post(self, request, pk, domain_id):
        verified_domain = SAMLVerifiedDomain.objects.filter(pk=domain_id, saml_configuration_id=pk).first()
        if verified_domain is None:
            return Response({"error": "Domain not found for this configuration."}, status=status.HTTP_404_NOT_FOUND)

        was_verified = verified_domain.is_verified
        success, detail = verify_domain_ownership(
            domain=verified_domain.domain,
            method=DomainVerificationMethod.DNS_TXT,
            token=verified_domain.verification_token,
        )

        if success and not was_verified:
            verified_domain.is_verified = True
            verified_domain.verified_at = timezone.now()
            verified_domain.save()

        return Response(
            {"is_verified": verified_domain.is_verified, "verified_at": verified_domain.verified_at, "detail": detail},
            status=status.HTTP_200_OK if success else status.HTTP_400_BAD_REQUEST,
        )


class InstanceSAMLTestConnectionEndpoint(BaseAPIView):
    """POST /api/instances/admin/saml-configurations/<pk>/test-connection/
    (exigence 13) - initiates a REAL SAML round-trip without creating a
    user. Returns the same signed redirect URL `/auth/saml/<pk>/login/`
    would produce (marked via `RelayState=SAML_TEST_RELAY_STATE`); the
    detailed success/error report is delivered later, out-of-band, when
    the IdP posts back to `/auth/saml/<pk>/acs/` - see
    `plane.authentication.views.saml.SAMLACSEndpoint._handle_test_connection`
    for where that detail actually gets reported (redirected back to the
    god-mode admin surface as query params, never to an end user)."""

    def post(self, request, pk):
        config = InstanceSAMLConfiguration.objects.filter(pk=pk).first()
        if config is None:
            return Response({"error": "SAML configuration not found."}, status=status.HTTP_404_NOT_FOUND)

        acs_url = sp_acs_url(request, config.id)
        try:
            redirect_url, request_id = build_authn_request_redirect_url(
                config, acs_url, relay_state=SAML_TEST_RELAY_STATE
            )
        except Exception as exc:
            log_exception(exc)
            return Response(
                {"error": "Could not build a signed AuthnRequest for this configuration. Check server logs."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({"redirect_url": redirect_url, "request_id": request_id}, status=status.HTTP_200_OK)
