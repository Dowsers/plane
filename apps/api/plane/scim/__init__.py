# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 2 "SCIM 2.0 natif".

A genuinely separate protocol-implementation package, NOT a submodule of
`plane.app`/`plane.api` - see `plane.scim.views.base.SCIMBaseAPIView`'s own
docstring for the full reasoning (pagination/filtering/PATCH semantics/
error envelope are all incompatible with this fork's existing DRF
conventions). Owns no Django models of its own - `SCIMToken` lives in
`plane.db.models` alongside every other model in this fork, matching this
category's own established placement convention (see
`plane.db.models.scim`'s own docstring for why this differs from feature
1's `InstanceSAMLConfiguration`, which had an explicit, spec-mandated
placement exception).
"""
