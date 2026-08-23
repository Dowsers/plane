# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 2 "SCIM 2.0 natif", exigence 11 - every SCIM
endpoint returns the RFC 7644 SS3.12 error envelope
(`{"schemas": ["urn:ietf:params:scim:api:messages:2.0:Error"], "status",
"detail", "scimType"}`) on failure, NEVER this fork's own `{"error": ...}`
shape used everywhere else in `plane.app`/`plane.api`.

`scim_exception_handler` is wired in as this package's OWN
`get_exception_handler()` override (see `plane.scim.views.base.
SCIMBaseAPIView`), NOT the project-wide `REST_FRAMEWORK["EXCEPTION_HANDLER"]`
setting (`plane.authentication.adapter.exception.auth_exception_handler`) -
that global default is left completely untouched for every other view in
this codebase; only views under `plane.scim` opt into this one.
"""

from typing import Optional

from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler as drf_default_exception_handler

SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error"


class SCIMError(APIException):
    """Raise this (rather than a bare DRF exception or a plain `Response`)
    from any SCIM view for a protocol-level error - `scim_exception_handler`
    below turns it into a spec-shaped envelope automatically. `scim_type`
    is one of RFC 7644 SS3.12's registered `scimType` values
    (invalidFilter, tooMany, uniqueness, mutability, invalidValue,
    invalidSyntax, ...) - optional (omitted from the envelope when unset),
    since not every error (e.g. a plain 404) maps to one.
    """

    def __init__(self, detail: str, status_code: int = status.HTTP_400_BAD_REQUEST, scim_type: Optional[str] = None):
        self.status_code = status_code
        self.scim_type = scim_type
        super().__init__(detail=detail)


def scim_error_envelope(detail: str, status_code: int, scim_type: Optional[str] = None) -> dict:
    envelope = {"schemas": [SCIM_ERROR_SCHEMA], "status": str(status_code), "detail": detail}
    if scim_type:
        envelope["scimType"] = scim_type
    return envelope


def scim_exception_handler(exc, context):
    """Mirrors every exception (SCIMError, DRF's own AuthenticationFailed/
    PermissionDenied/NotFound/Throttled/ValidationError, ...) into the SCIM
    error envelope shape. Delegates the actual status-code resolution to
    DRF's own default handler first (so e.g. `Throttled.wait` still drives
    a correct 429), then reshapes `response.data` only.
    """
    response = drf_default_exception_handler(exc, context)
    if response is None:
        # Not a DRF-recognized exception (e.g. an uncaught Python
        # exception) - let it propagate as a real 500 rather than
        # pretending it's a clean SCIM error; Django's own error reporting
        # still applies.
        return None

    scim_type = getattr(exc, "scim_type", None)
    detail = str(exc.detail) if isinstance(exc, APIException) else str(response.data)
    response.data = scim_error_envelope(detail=detail, status_code=response.status_code, scim_type=scim_type)
    return response
