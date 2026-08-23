# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 2 "SCIM 2.0 natif".

`SCIMToken` model only - the protocol views/serializers/pagination/filter
logic live in the genuinely separate `plane.scim` package (NOT `plane.app`/
`plane.api`), per this feature's own pre-implementation research: SCIM's
pagination (`startIndex`/`count`), filtering (`filter=userName eq "..."`),
PATCH semantics (op-based) and error envelope are all incompatible with
this fork's existing DRF conventions (`BasePaginator`, `DjangoFilterBackend`,
partial-serializer PATCH, `{"error": ...}`). The MODEL itself, however,
still belongs in `plane.db.models` alongside every other model in this
fork (including this same category's `RateLimitTier`, `WorkspaceAuditLog`,
`WorkspaceSecurityPolicy`) - unlike `InstanceSAMLConfiguration` (feature 1),
whose placement in `plane.license.models` was an explicit, spec-mandated
exception ("a cote d'InstanceConfiguration"), nothing in this feature's own
spec asks for a special model location, so the default convention wins.

Security note (decision #2): `token_hash` is a genuine SHA-256 HMAC digest
(`plane.utils.scim_token.hash_scim_token`), never the raw token - this is a
deliberate IMPROVEMENT over `APIToken.token` (confirmed by this initiative's
own prior research to be stored in plaintext), not a copy of that gap. The
raw token is only ever returned once, at creation time, by the admin-facing
creation endpoint's own write serializer (`plane.app.serializers.scim.
SCIMTokenWriteSerializer`) - see that module's docstring for the
write/read serializer split this mirrors from `APIToken`.
"""

from django.db import models

from plane.db.models.base import BaseModel


class SCIMToken(BaseModel):
    """One Bearer token, always scoped to exactly one workspace (exigence 2 -
    a SCIM token can never reach another workspace's `/api/scim/v2/*`
    endpoints, since the workspace is resolved FROM the token itself, never
    from a URL slug - see `plane.scim.authentication.SCIMTokenAuthentication`).
    """

    workspace = models.ForeignKey("db.Workspace", related_name="scim_tokens", on_delete=models.CASCADE)
    # SHA-256 HMAC digest of the raw token - see module docstring. Never
    # the raw value. `unique=True` so a lookup by digest is a plain indexed
    # equality query, same shape as `APIToken.token`'s own lookup, just
    # hashed.
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)
    label = models.CharField(max_length=255, default="SCIM Token")
    is_active = models.BooleanField(default=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    # `created_by` is NOT redeclared here - `BaseModel` (via its
    # `UserAuditModel` mixin) already provides it, auto-stamped from the
    # acting Admin/Owner at creation time (`BaseModel.save()` -> crum's
    # `get_current_user()`), exactly matching the field the spec's own
    # data-model section asks for.

    class Meta:
        verbose_name = "SCIM Token"
        verbose_name_plural = "SCIM Tokens"
        db_table = "scim_tokens"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.label} <{self.workspace_id}>"
