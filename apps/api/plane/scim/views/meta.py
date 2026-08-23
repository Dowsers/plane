# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 2 "SCIM 2.0 natif", exigence 1.

`GET /ServiceProviderConfig`, `GET /ResourceTypes`, `GET /Schemas` - mostly
static/computed responses describing this implementation's own real
capabilities (RFC 7643 SS5,SS6,SS7 / RFC 7644 SS4). These three are what an
Okta/Azure AD "SCIM" app wizard fetches FIRST, before ever calling `/Users`,
to decide which capabilities to offer in its own UI (e.g. whether to show a
"filter" option) - so what's advertised here must genuinely match what the
`Users` views below actually do (PATCH supported, filter supported with
`userName`/`emails.value` only, no bulk, no sort, no PUT-based password
change).
"""

from rest_framework.response import Response

from plane.scim.resources import EXTENSION_SCHEMA, USER_SCHEMA
from plane.scim.views.base import SCIMBaseAPIView

SERVICE_PROVIDER_CONFIG_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"
RESOURCE_TYPE_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:ResourceType"
SCHEMA_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Schema"
LIST_RESPONSE_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse"


class ServiceProviderConfigEndpoint(SCIMBaseAPIView):
    def get(self, request):
        return Response(
            {
                "schemas": [SERVICE_PROVIDER_CONFIG_SCHEMA],
                "documentationUri": "https://docs.plane.so",
                "patch": {"supported": True},
                "bulk": {"supported": False, "maxOperations": 0, "maxPayloadSize": 0},
                # Exigence 5 - userName/emails.value only, see
                # plane.scim.filters.
                "filter": {"supported": True, "maxResults": 500},
                "changePassword": {"supported": False},
                "sort": {"supported": False},
                "etag": {"supported": False},
                "authenticationSchemes": [
                    {
                        "type": "oauthbearertoken",
                        "name": "OAuth Bearer Token",
                        "description": "Authentication via a workspace-scoped SCIM Bearer token.",
                        "specUri": "https://www.rfc-editor.org/info/rfc6750",
                        "primary": True,
                    }
                ],
                "meta": {"resourceType": "ServiceProviderConfig", "location": "/api/scim/v2/ServiceProviderConfig"},
            }
        )


USER_RESOURCE_TYPE = {
    "schemas": [RESOURCE_TYPE_SCHEMA],
    "id": "User",
    "name": "User",
    "endpoint": "/Users",
    "description": "A member of a Plane workspace, provisioned/deprovisioned via SCIM.",
    "schema": USER_SCHEMA,
    "schemaExtensions": [{"schema": EXTENSION_SCHEMA, "required": False}],
    "meta": {"resourceType": "ResourceType", "location": "/api/scim/v2/ResourceTypes/User"},
}


class ResourceTypesEndpoint(SCIMBaseAPIView):
    """Decision #1 - only `User` is listed. `Group` is deliberately absent
    (Groups is out of scope for v1, see this feature's own commit
    history/docstrings for the reasoning)."""

    def get(self, request):
        return Response(
            {
                "schemas": [LIST_RESPONSE_SCHEMA],
                "totalResults": 1,
                "itemsPerPage": 1,
                "startIndex": 1,
                "Resources": [USER_RESOURCE_TYPE],
            }
        )


USER_SCHEMA_DEFINITION = {
    "schemas": [SCHEMA_SCHEMA],
    "id": USER_SCHEMA,
    "name": "User",
    "description": "Plane workspace member (SCIM core User schema, subset actually mapped - exigence 8).",
    "attributes": [
        {
            "name": "userName",
            "type": "string",
            "multiValued": False,
            "required": True,
            "caseExact": False,
            "mutability": "readWrite",
            "returned": "default",
            "uniqueness": "server",
        },
        {
            "name": "name",
            "type": "complex",
            "multiValued": False,
            "required": False,
            "mutability": "readWrite",
            "returned": "default",
            "subAttributes": [
                {"name": "givenName", "type": "string", "multiValued": False, "mutability": "readWrite"},
                {"name": "familyName", "type": "string", "multiValued": False, "mutability": "readWrite"},
            ],
        },
        {
            "name": "emails",
            "type": "complex",
            "multiValued": True,
            "required": True,
            "mutability": "readWrite",
            "returned": "default",
            "subAttributes": [
                {"name": "value", "type": "string", "multiValued": False, "mutability": "readWrite"},
                {"name": "primary", "type": "boolean", "multiValued": False, "mutability": "readWrite"},
            ],
        },
        {
            "name": "active",
            "type": "boolean",
            "multiValued": False,
            "required": False,
            "mutability": "readWrite",
            "returned": "default",
        },
        {
            "name": "externalId",
            "type": "string",
            "multiValued": False,
            "required": False,
            "caseExact": True,
            "mutability": "readWrite",
            "returned": "default",
            "uniqueness": "none",
        },
    ],
    "meta": {"resourceType": "Schema", "location": f"/api/scim/v2/Schemas/{USER_SCHEMA}"},
}

EXTENSION_SCHEMA_DEFINITION = {
    "schemas": [SCHEMA_SCHEMA],
    "id": EXTENSION_SCHEMA,
    "name": "PlaneUserExtension",
    "description": "Plane-specific role mapping (exigence 9, decision #1 - no Groups resource in v1).",
    "attributes": [
        {
            "name": "role",
            "type": "string",
            "multiValued": False,
            "required": False,
            "caseExact": False,
            "canonicalValues": ["admin", "member", "guest"],
            "mutability": "readWrite",
            "returned": "default",
        }
    ],
    "meta": {"resourceType": "Schema", "location": f"/api/scim/v2/Schemas/{EXTENSION_SCHEMA}"},
}

ALL_SCHEMAS = [USER_SCHEMA_DEFINITION, EXTENSION_SCHEMA_DEFINITION]


class SchemasEndpoint(SCIMBaseAPIView):
    def get(self, request):
        return Response(
            {
                "schemas": [LIST_RESPONSE_SCHEMA],
                "totalResults": len(ALL_SCHEMAS),
                "itemsPerPage": len(ALL_SCHEMAS),
                "startIndex": 1,
                "Resources": ALL_SCHEMAS,
            }
        )
