/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TFilterGroupNode, TFilterProperty } from "@plane/types";
import type { TTreeTransformFn, TTreeTransformResult } from "./core";
import { transformGroupWithChildren } from "./core";

/**
 * Transforms a group node by processing its children.
 * All groups (AND/OR, negated or not) share the same shape, so this delegates directly to
 * `transformGroupWithChildren` - kept as a named entry point (rather than calling it directly
 * from `transformExpressionTree`) so group-specific pre/post-processing has a single place to live.
 * @param group - The group to transform
 * @param transformFn - The transformation function
 * @returns The transformation result
 */
export const transformGroup = <P extends TFilterProperty>(
  group: TFilterGroupNode<P>,
  transformFn: TTreeTransformFn<P>
): TTreeTransformResult<P> => transformGroupWithChildren(group, transformFn);
