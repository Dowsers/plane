/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TFilterGroupNode, TFilterProperty } from "@plane/types";
// local imports
import { getGroupChildren } from "../types/shared";

/**
 * Determines if a group should be unwrapped based on the number of children and negation.
 * A group with exactly one child is otherwise redundant (an AND/OR of one thing is just that
 * thing), EXCEPT when the group is negated: "NOT (child)" is not equivalent to "child" - unwrapping
 * would silently drop the negation, so a negated single-child group is only unwrapped when the
 * caller explicitly opts out of preservation via `preserveNotGroups = false`.
 * @param group - The group node to check
 * @param preserveNotGroups - Whether to preserve negated ("NOT") groups even with a single child
 * @returns True if the group should be unwrapped, false otherwise
 */
export const shouldUnwrapGroup = <P extends TFilterProperty>(
  group: TFilterGroupNode<P>,
  preserveNotGroups = true
): boolean => {
  const children = getGroupChildren(group);

  // Never unwrap groups with anything other than exactly one child
  if (children.length !== 1) {
    return false;
  }

  // A negated group's semantics ("NOT (child)") aren't preserved by returning the bare child -
  // keep the wrapping group unless the caller explicitly opts out via preserveNotGroups=false
  if (group.negate && preserveNotGroups) {
    return false;
  }

  return true;
};
