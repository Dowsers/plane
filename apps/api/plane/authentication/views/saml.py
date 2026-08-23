# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 1 "SSO SAML 2.0 natif" - public/unauthenticated
SAML endpoints, mounted under `plane.authentication.urls` (`/auth/...`),
matching this fork's existing unauthenticated-auth-endpoint namespace
convention (`/auth/google/`, `/auth/magic-sign-in/`, ...) rather than
inventing a new prefix.

*** VERIFICATION LIMITATION *** - see `plane.license.models.saml`'s own
module docstring: this whole feature, including the views below, is
verified only against self-authored synthetic fixtures, never a real IdP.

Exigence 15 - the end-user-facing ACS failure path is ALWAYS the same
generic redirect (`SAML_LOGIN_FAILED`), regardless of the real reason
(invalid signature, expired assertion, wrong audience, replay, missing
attribute, ...) - the real reason is logged server-side via `logging`
only. The one exception is the test-connection flow (`RelayState ==
SAML_TEST_RELAY_STATE`), which is explicitly instance-admin-facing (see
`_handle_test_connection_acs` below) and DOES report the real
code/detail - but only ever via a redirect back to the god-mode admin
surface, never to an end user.
"""

import base64
import logging

from django.http import HttpResponse, HttpResponseRedirect
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from plane.authentication.adapter.error import AUTHENTICATION_ERROR_CODES, AuthenticationException
from plane.authentication.adapter.saml import SAMLAdapter
from plane.authentication.rate_limit import AuthenticationThrottle
from plane.authentication.utils.host import base_host
from plane.authentication.utils.login import user_login
from plane.authentication.utils.redirection_path import get_redirection_path
from plane.authentication.utils.user_auth_workflow import post_user_auth_workflow
from plane.license.models import InstanceSAMLConfiguration
from plane.utils.exception_logger import log_exception
from plane.utils.path_validator import get_safe_redirect_url
from plane.utils.saml_enforcement import resolve_saml_config_for_email
from plane.utils.saml_keys import get_or_create_sp_signing_key
from plane.utils.saml_xml import (
    SAML_TEST_RELAY_STATE,
    SAMLValidationError,
    build_authn_request_redirect_url,
    build_sp_metadata_xml,
    check_and_record_assertion,
    sp_acs_url,
    verify_and_extract_assertion,
)

logger = logging.getLogger("plane.authentication")


def _generic_error_redirect(request) -> str:
    exc = AuthenticationException(
        error_code=AUTHENTICATION_ERROR_CODES["SAML_LOGIN_FAILED"], error_message="SAML_LOGIN_FAILED"
    )
    return get_safe_redirect_url(
        base_url=base_host(request=request, is_app=True), next_path="", params=exc.get_error_dict()
    )


class SAMLMetadataEndpoint(APIView):
    """GET /auth/saml/<pk>/metadata - SP metadata XML (exigence 5),
    public/unauthenticated - consumed by the IdP admin, not a browser
    end-user."""

    permission_classes = [AllowAny]

    def get(self, request, pk):
        config = InstanceSAMLConfiguration.objects.filter(pk=pk).first()
        if config is None:
            return Response({"error": "SAML configuration not found."}, status=status.HTTP_404_NOT_FOUND)

        acs_url = sp_acs_url(request, config.id)
        _, sp_certificate_pem = get_or_create_sp_signing_key()
        xml_bytes = build_sp_metadata_xml(config, acs_url, sp_certificate_pem=sp_certificate_pem)
        return HttpResponse(xml_bytes, content_type="application/samlmetadata+xml")


class SAMLDiscoverEndpoint(APIView):
    """POST /auth/saml/discover - exigence: the login screen calls this
    after email entry to decide whether to show password/OTP/OAuth or a
    "Continue with {IdP}" button. Public/unauthenticated by necessity (runs
    BEFORE any login)."""

    permission_classes = [AllowAny]
    throttle_classes = [AuthenticationThrottle]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        if not email:
            exc = AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["EMAIL_REQUIRED"], error_message="EMAIL_REQUIRED"
            )
            return Response(exc.get_error_dict(), status=status.HTTP_400_BAD_REQUEST)

        config = resolve_saml_config_for_email(email)
        if config is None:
            return Response({"sso_applies": False}, status=status.HTTP_200_OK)

        return Response(
            {
                "sso_applies": True,
                "config_id": str(config.id),
                "name": config.name,
                "enforce_sso": config.enforce_sso,
                "login_url": f"/auth/saml/{config.id}/login/",
            },
            status=status.HTTP_200_OK,
        )


class SAMLLoginInitiateEndpoint(View):
    """GET /auth/saml/<pk>/login - SP-initiated flow (exigence 6): builds
    and redirects (302) to a signed `AuthnRequest`. GET (browser
    navigation), no CSRF concern."""

    def get(self, request, pk):
        next_path = request.GET.get("next_path") or ""
        config = InstanceSAMLConfiguration.objects.filter(pk=pk, is_enabled=True).first()
        if config is None:
            logger.warning(f"SAML SP-initiated login requested for unknown/disabled config {pk}")
            return HttpResponseRedirect(_generic_error_redirect(request))

        acs_url = sp_acs_url(request, config.id)
        try:
            redirect_url, _request_id = build_authn_request_redirect_url(config, acs_url, relay_state=next_path)
        except Exception as exc:
            log_exception(exc)
            return HttpResponseRedirect(_generic_error_redirect(request))

        return HttpResponseRedirect(redirect_url)


@method_decorator(csrf_exempt, name="dispatch")
class SAMLACSEndpoint(View):
    """POST /auth/saml/<pk>/acs - Assertion Consumer Service (exigence
    7/8). Handles BOTH SP-initiated (RelayState carries the `next_path` we
    set at login-initiate time) and IdP-initiated (no prior AuthnRequest -
    RelayState may be empty or IdP-supplied) flows, per exigence 7's own
    wording - this is why `InResponseTo` is deliberately NOT validated
    against a stored request ID here: an IdP-initiated assertion has no
    corresponding SP-generated request to match against, and rejecting on
    a missing/mismatched `InResponseTo` would break that required flow.

    THE ONE `csrf_exempt` IN THIS CODEBASE (see the module `grep` before
    assuming this is a copy-paste starting point for anything else): every
    other POST auth endpoint in this fork is same-origin, frontend-
    initiated, and carries a real CSRF token obtained from
    `/auth/get-csrf-token/` first. This endpoint is fundamentally
    different - it receives a genuinely cross-origin POST from the IdP's
    own auto-submitting HTML form, which has no way to ever obtain a Plane
    CSRF token. This is the standard, well-known SAML ACS requirement
    (Django's own CSRF documentation calls this exact scenario out).
    """

    def post(self, request, pk):
        relay_state = request.POST.get("RelayState", "") or ""
        saml_response_b64 = request.POST.get("SAMLResponse")

        config = InstanceSAMLConfiguration.objects.filter(pk=pk).first()
        if config is None or not saml_response_b64:
            logger.warning(f"SAML ACS hit for unknown config {pk} or missing SAMLResponse")
            return HttpResponseRedirect(_generic_error_redirect(request))

        if relay_state == SAML_TEST_RELAY_STATE:
            return self._handle_test_connection(request, config, saml_response_b64)

        if not config.is_enabled:
            logger.warning(f"SAML ACS hit for disabled config {config.id}")
            return HttpResponseRedirect(_generic_error_redirect(request))

        try:
            raw_xml = base64.b64decode(saml_response_b64)
            assertion_result = verify_and_extract_assertion(raw_xml, config)
            check_and_record_assertion(config, assertion_result)
        except SAMLValidationError as exc:
            logger.warning(f"SAML ACS validation failed for config {config.id}: {exc.code}: {exc.detail}")
            return HttpResponseRedirect(_generic_error_redirect(request))
        except Exception as exc:
            log_exception(exc)
            return HttpResponseRedirect(_generic_error_redirect(request))

        try:
            adapter = SAMLAdapter(
                request=request, config=config, assertion_result=assertion_result, callback=post_user_auth_workflow
            )
            user = adapter.authenticate()
        except AuthenticationException as exc:
            logger.warning(f"SAML JIT provisioning failed for config {config.id}: {exc.error_message}")
            return HttpResponseRedirect(_generic_error_redirect(request))
        except Exception as exc:
            log_exception(exc)
            return HttpResponseRedirect(_generic_error_redirect(request))

        user_login(request=request, user=user, is_app=True)
        next_path = relay_state or get_redirection_path(user=user)
        url = get_safe_redirect_url(base_url=base_host(request=request, is_app=True), next_path=next_path, params={})
        return HttpResponseRedirect(url)

    def _handle_test_connection(self, request, config, saml_response_b64):
        """Exigence 13 - never creates a user or a session. Reports the
        detailed real outcome, but ONLY via a redirect to the god-mode
        admin surface (`is_admin=True`), never to an end user."""
        admin_base = base_host(request=request, is_admin=True)
        try:
            raw_xml = base64.b64decode(saml_response_b64)
            assertion_result = verify_and_extract_assertion(raw_xml, config)
            check_and_record_assertion(config, assertion_result)
        except SAMLValidationError as exc:
            logger.info(f"SAML test-connection failed for config {config.id}: {exc.code}: {exc.detail}")
            url = get_safe_redirect_url(
                base_url=admin_base,
                next_path="",
                params={"saml_test_result": "error", "saml_test_code": exc.code, "saml_test_detail": exc.detail[:200]},
            )
            return HttpResponseRedirect(url)
        except Exception as exc:
            log_exception(exc)
            url = get_safe_redirect_url(
                base_url=admin_base,
                next_path="",
                params={
                    "saml_test_result": "error",
                    "saml_test_code": "UNKNOWN",
                    "saml_test_detail": "Unexpected error.",
                },
            )
            return HttpResponseRedirect(url)

        url = get_safe_redirect_url(
            base_url=admin_base,
            next_path="",
            params={
                "saml_test_result": "success",
                "saml_test_email": assertion_result.attributes.get("email", ""),
                "saml_test_name_id": assertion_result.name_id,
            },
        )
        return HttpResponseRedirect(url)
