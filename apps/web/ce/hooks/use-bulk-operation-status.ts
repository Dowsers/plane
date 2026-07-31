/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Bulk operations (state/priority/assignees/labels/dates/cycle/module,
// archive, delete) are available in the self-hosted Community edition -
// see docs/feature-specs/01-core-issue-tracking.md in plane-selfhost.
export const useBulkOperationStatus = () => true;
