/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TFilterExpression, TFilterGroupNode, TFilterProperty } from "@plane/types";

/**
 * Gets the children of a group node.
 * All groups (AND/OR, negated or not) share the exact same shape (`TFilterGroupNode`), so this is
 * a direct accessor - kept as a named helper (rather than inlining `group.children` at every call
 * site) so a future group-shape change only needs to update one place.
 * @param group - The group node to get children from
 * @returns Array of child expressions
 */
export const getGroupChildren = <P extends TFilterProperty>(group: TFilterGroupNode<P>): TFilterExpression<P>[] =>
  group.children;
