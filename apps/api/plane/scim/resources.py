# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 2 "SCIM 2.0 natif".

Builds/parses the SCIM `User` resource representation. The SCIM "id" for a
User resource is `WorkspaceMember.id`, NOT the global `User.id` (exigence
2/7 - a SCIM connection is workspace-scoped, and deactivation/removal is a
WORKSPACE-scoped operation; the same global `User` could in principle be
provisioned into more than one workspace by two unrelated SCIM
connections, each needing its own independently-addressable resource id).

Role mapping (exigence 9, decision #1 - Groups resource skipped for v1,
role comes ONLY from the `urn:ietf:params:scim:schemas:extension:plane:2.0:
User.role` extension attribute): deliberately has NO "owner" entry - Owner
status is not a `WorkspaceMember.role` value at all in this fork (it's
`Workspace.owner_id == member_id`, orthogonal to `role`), and no endpoint
in this module ever touches `Workspace.owner`, so "Owner can never be
granted via SCIM" holds structurally. The explicit rejection of the literal
string "owner" below is defense-in-depth (exigence 9's own wording: "Le
role Owner ne peut jamais etre attribue via SCIM" - validated explicitly,
not just implied by the mapping's shape).
"""

from typing import Optional

from plane.scim.exceptions import SCIMError

USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User"
EXTENSION_SCHEMA = "urn:ietf:params:scim:schemas:extension:plane:2.0:User"

ROLE_ADMIN = 20
ROLE_MEMBER = 15
ROLE_GUEST = 5

# No "owner" key - see module docstring.
ROLE_STRING_TO_VALUE = {"admin": ROLE_ADMIN, "member": ROLE_MEMBER, "guest": ROLE_GUEST}
ROLE_VALUE_TO_STRING = {v: k for k, v in ROLE_STRING_TO_VALUE.items()}

# Exigence 9 - "en l'absence de mapping explicite, le role par defaut
# configurable (Member par defaut) s'applique". This feature does NOT add a
# separate per-workspace "default SCIM role" setting/model - out of the
# explicit field list this feature's own implementation brief gave
# `SCIMToken` (workspace/token_hash/label/is_active/last_used_at/
# created_by only) - so the "configurable" half of exigence 9 is a
# documented, deliberate v1 scope reduction: the default is a fixed
# Member (15), matching `WorkspaceMemberInvite`'s own effective default
# for a plain invite with no role specified.
DEFAULT_ROLE = ROLE_MEMBER


def role_value_to_string(role: int) -> str:
    return ROLE_VALUE_TO_STRING.get(role, "member")


def resolve_role_from_extension(payload: dict) -> int:
    """Reads `urn:ietf:params:scim:schemas:extension:plane:2.0:User.role`
    from a SCIM User creation/replace payload. Returns `DEFAULT_ROLE` if
    the extension/attribute is absent entirely. Raises `SCIMError` (400,
    `scimType="invalidValue"`) for any PRESENT-but-unrecognized value,
    including the literal "owner" - never silently downgrades an
    unrecognized request to the default, per this feature's own
    instruction to validate the Owner exclusion explicitly rather than
    relying only on the mapping's shape.
    """
    extension = payload.get(EXTENSION_SCHEMA)
    if not extension or "role" not in extension:
        return DEFAULT_ROLE

    raw_role = str(extension.get("role") or "").strip().lower()
    if raw_role in ROLE_STRING_TO_VALUE:
        return ROLE_STRING_TO_VALUE[raw_role]

    detail = f"Unsupported role '{extension.get('role')}' in {EXTENSION_SCHEMA}.role."
    if raw_role == "owner":
        detail = "The Owner role can never be assigned via SCIM."
    raise SCIMError(detail=detail, status_code=400, scim_type="invalidValue")


def build_scim_user_resource(member) -> dict:
    """`member` is a `WorkspaceMember` instance with `.member` (the `User`)
    already resolved/select_related."""
    user = member.member
    created = member.created_at.isoformat() if member.created_at else None
    modified = member.updated_at.isoformat() if member.updated_at else None
    return {
        "schemas": [USER_SCHEMA, EXTENSION_SCHEMA],
        "id": str(member.id),
        "externalId": member.scim_external_id,
        "userName": user.email,
        "name": {"givenName": user.first_name or "", "familyName": user.last_name or ""},
        "displayName": user.display_name or user.email,
        "emails": [{"value": user.email, "primary": True}],
        "active": member.is_active,
        "meta": {
            "resourceType": "User",
            "created": created,
            "lastModified": modified,
            "location": f"/api/scim/v2/Users/{member.id}",
        },
        EXTENSION_SCHEMA: {"role": role_value_to_string(member.role)},
    }


def extract_username_or_email(payload: dict) -> Optional[str]:
    """Exigence 8 - `userName`/`emails[primary].value` -> email (the
    global identifier). `userName` wins if both are present and differ
    (Okta/Azure both default to sending the user's email as `userName`
    anyway); falls back to the primary (or first) email entry."""
    user_name = (payload.get("userName") or "").strip()
    if user_name:
        return user_name

    emails = payload.get("emails") or []
    primary = next((e.get("value") for e in emails if e.get("primary")), None)
    if primary:
        return primary.strip()
    if emails and emails[0].get("value"):
        return emails[0]["value"].strip()
    return None
