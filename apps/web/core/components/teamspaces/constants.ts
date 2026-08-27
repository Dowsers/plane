/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Numeric role scale mirrors `TEAMSPACE_ROLE_CHOICES` in
// apps/api/plane/db/models/workspace.py - kept in sync manually since these
// are the only frontend surfaces reading/writing a Teamspace member role.
export const TEAMSPACE_LEAD = 20;
export const TEAMSPACE_MEMBER = 15;
