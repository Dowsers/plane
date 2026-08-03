/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import type { IFilterInstance } from "@plane/shared-state";
import type {
  SingleOrArray,
  TExternalFilter,
  TFilterConditionNode,
  TFilterExpression,
  TFilterGroupNode,
  TFilterProperty,
  TFilterValue,
} from "@plane/types";
import { LOGICAL_OPERATOR } from "@plane/types";
import { cn, isConditionNode, isGroupNode, toConditionForDisplay } from "@plane/utils";

/**
 * Renders a value for the plain-text summary. This is intentionally simple (join raw values with
 * commas) rather than resolving ids to display names (e.g. a member/label id would show as its
 * raw id, not the member/label's name) - the per-condition chip rendering elsewhere in the tree
 * already shows fully resolved values, so this summary line is a supplementary "shape of the logic
 * at a glance" legend, not the source of truth for what a condition actually matches. See the
 * feature report for this documented simplification.
 */
const formatValueForSummary = (value: SingleOrArray<TFilterValue>): string => {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.filter((v) => v !== null && v !== undefined && v !== "").join(", ");
  return String(value);
};

const buildConditionSummary = <P extends TFilterProperty, E extends TExternalFilter>(
  condition: TFilterConditionNode<P, TFilterValue>,
  filter: IFilterInstance<P, E>
): string => {
  const displayCondition = toConditionForDisplay(condition);
  const config = filter.configManager.getConfigByProperty(condition.property);
  const propertyLabel = config?.label ?? String(condition.property);
  const operatorLabel = config?.getLabelForOperator(displayCondition.operator) ?? displayCondition.operator;
  const valueLabel = formatValueForSummary(condition.value);

  return valueLabel ? `${propertyLabel}: ${operatorLabel} ${valueLabel}` : `${propertyLabel}: ${operatorLabel}`;
};

const buildNodeSummary = <P extends TFilterProperty, E extends TExternalFilter>(
  node: TFilterExpression<P>,
  filter: IFilterInstance<P, E>,
  isTopLevel: boolean
): string => {
  if (isConditionNode(node)) {
    return buildConditionSummary(node, filter);
  }
  if (isGroupNode(node)) {
    return buildGroupSummary(node, filter, isTopLevel);
  }
  return "";
};

const buildGroupSummary = <P extends TFilterProperty, E extends TExternalFilter>(
  group: TFilterGroupNode<P>,
  filter: IFilterInstance<P, E>,
  isTopLevel: boolean
): string => {
  const childSummaries = group.children
    .map((child) => buildNodeSummary(child, filter, false))
    .filter((summary) => summary.length > 0);

  if (childSummaries.length === 0) return "";

  const joiner = group.logicalOperator === LOGICAL_OPERATOR.OR ? " OR " : " AND ";
  const joined = childSummaries.join(joiner);

  if (group.negate) {
    return `NOT (${joined})`;
  }
  // Parenthesize nested (non-top-level) groups with more than one child so precedence is legible -
  // a top-level group (the whole filter) and single-child groups don't need the extra parens.
  return childSummaries.length > 1 && !isTopLevel ? `(${joined})` : joined;
};

/**
 * Builds a legible, natural-language-ish summary of a filter expression tree, e.g.
 * "(Priority: is Urgent OR Overdue) AND Assigned: is Me". Not intended to be perfectly
 * grammatical - just legible enough to make a nested tree's logic clear at a glance.
 */
export const buildFilterExpressionSummary = <P extends TFilterProperty, E extends TExternalFilter>(
  expression: TFilterExpression<P> | null,
  filter: IFilterInstance<P, E>
): string => {
  if (!expression) return "No filters applied";
  const summary = buildNodeSummary(expression, filter, true);
  return summary || "No filters applied";
};

type TFilterExpressionSummaryProps<P extends TFilterProperty, E extends TExternalFilter> = {
  filter: IFilterInstance<P, E>;
  className?: string;
};

/** Renders `buildFilterExpressionSummary` for the filter instance's current live expression. */
export const FilterExpressionSummary = observer(function FilterExpressionSummary<
  P extends TFilterProperty,
  E extends TExternalFilter,
>(props: TFilterExpressionSummaryProps<P, E>) {
  const { filter, className } = props;
  const summaryText = buildFilterExpressionSummary(filter.expression, filter);

  return <p className={cn("text-13 text-secondary", className)}>{summaryText}</p>;
});
