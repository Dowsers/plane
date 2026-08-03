/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { isEmpty } from "lodash-es";
import type {
  SingleOrArray,
  TFilterExpression,
  TFilterValue,
  TSupportedOperators,
  TWorkItemFilterConditionData,
  TWorkItemFilterConditionKey,
  TWorkItemFilterExpression,
  TWorkItemFilterExpressionData,
  TWorkItemFilterGroup,
  TWorkItemFilterNotCondition,
  TWorkItemFilterNotGroup,
  TWorkItemFilterProperty,
} from "@plane/types";
import { LOGICAL_OPERATOR, MULTI_VALUE_OPERATORS, NEGATION_KEY, WORK_ITEM_FILTER_PROPERTY_KEYS } from "@plane/types";
import {
  createConditionNode,
  createAndGroupNode,
  createOrGroupNode,
  isAndGroupNode,
  isConditionNode,
  isGroupNode,
  isOrGroupNode,
} from "@plane/utils";
// local imports
import { FilterAdapter } from "../rich-filters/adapter";

class WorkItemFiltersAdapter extends FilterAdapter<TWorkItemFilterProperty, TWorkItemFilterExpression> {
  /**
   * Converts external work item filter expression to internal filter tree
   * @param externalFilter - The external filter expression
   * @returns Internal filter expression or null
   */
  toInternal(externalFilter: TWorkItemFilterExpression): TFilterExpression<TWorkItemFilterProperty> | null {
    if (!externalFilter || isEmpty(externalFilter)) return null;

    try {
      return this._convertExpressionToInternal(externalFilter);
    } catch (error) {
      console.error("Failed to convert external filter to internal:", error);
      return null;
    }
  }

  /**
   * Recursively converts external expression data to internal filter tree
   * @param expression - The external expression data
   * @returns Internal filter expression
   */
  private _convertExpressionToInternal(
    expression: TWorkItemFilterExpressionData
  ): TFilterExpression<TWorkItemFilterProperty> {
    if (!expression || isEmpty(expression)) {
      throw new Error("Invalid expression: empty or null data");
    }

    // Check if it's a simple condition (has field property)
    if (this._isWorkItemFilterConditionData(expression)) {
      const conditionResult = this._extractWorkItemFilterConditionData(expression);
      if (!conditionResult) {
        throw new Error("Failed to extract condition data");
      }

      const [property, operator, value] = conditionResult;
      return createConditionNode({
        property,
        operator,
        value,
      });
    }

    // Check if it's a negated expression, e.g. `{ not: { name__icontains: "foo" } }` (a negated
    // leaf condition) or `{ not: { and: [...] } }` / `{ not: { or: [...] } }` (a negated group).
    if (this._isNegatedExpression(expression)) {
      const inner = expression[NEGATION_KEY];

      if (this._isWorkItemFilterGroupData(inner)) {
        const innerNode = this._convertExpressionToInternal(inner);
        if (!isGroupNode(innerNode)) {
          throw new Error("Failed to convert negated group: inner expression did not resolve to a group");
        }
        return { ...innerNode, negate: true };
      }

      const conditionResult = this._extractWorkItemFilterConditionData(inner);
      if (!conditionResult) {
        throw new Error("Failed to extract negated condition data");
      }

      const [property, operator, value] = conditionResult;
      return createConditionNode({
        property,
        operator,
        value,
        isNegation: true,
      });
    }

    // It's a logical group - check which type. Empty children arrays are tolerated here (rather
    // than rejected) so a legacy view migrated with no filters at all (`{ and: [] }`) round-trips
    // to an empty-but-valid group instead of discarding the whole tree - see feature spec
    // "Groupes de filtres imbriques AND/OR", requirement 4 (empty groups are tolerated). Note the
    // API itself still rejects a genuinely empty `and`/`or` on save/query (see
    // `ComplexFilterBackend._validate_structure`), so a NESTED empty group can never actually be
    // persisted in the first place - this only matters for the legacy-migration root case.
    const expressionKeys = Object.keys(expression);

    if (LOGICAL_OPERATOR.AND in expression) {
      const andExpression = expression as { [LOGICAL_OPERATOR.AND]: TWorkItemFilterExpressionData[] };
      const andConditions = andExpression[LOGICAL_OPERATOR.AND];

      if (!Array.isArray(andConditions)) {
        throw new Error("AND group children must be an array");
      }

      const convertedConditions = andConditions.map((item) => this._convertExpressionToInternal(item));
      return createAndGroupNode(convertedConditions);
    }

    if (LOGICAL_OPERATOR.OR in expression) {
      const orExpression = expression as { [LOGICAL_OPERATOR.OR]: TWorkItemFilterExpressionData[] };
      const orConditions = orExpression[LOGICAL_OPERATOR.OR];

      if (!Array.isArray(orConditions)) {
        throw new Error("OR group children must be an array");
      }

      const convertedConditions = orConditions.map((item) => this._convertExpressionToInternal(item));
      return createOrGroupNode(convertedConditions);
    }

    throw new Error(`Invalid expression: unknown structure with keys [${expressionKeys.join(", ")}]`);
  }

  /**
   * Converts internal filter expression to external format
   * @param internalFilter - The internal filter expression
   * @returns External filter expression
   */
  toExternal(internalFilter: TFilterExpression<TWorkItemFilterProperty>): TWorkItemFilterExpression {
    if (!internalFilter) {
      return {};
    }

    try {
      return this._convertExpressionToExternal(internalFilter);
    } catch (error) {
      console.error("Failed to convert internal filter to external:", error);
      return {};
    }
  }

  /**
   * Recursively converts internal expression to external format
   * @param expression - The internal filter expression
   * @returns External expression data
   */
  private _convertExpressionToExternal(
    expression: TFilterExpression<TWorkItemFilterProperty>
  ): TWorkItemFilterExpressionData {
    if (isConditionNode(expression)) {
      const conditionData = this._createWorkItemFilterConditionData(
        expression.property,
        expression.operator,
        expression.value
      );
      // Negation is structural on the wire - wrap the leaf's condition data in a `not` group instead of
      // encoding it into the operator/lookup itself.
      if (expression.isNegation) {
        return { [NEGATION_KEY]: conditionData } as TWorkItemFilterNotCondition;
      }
      return conditionData;
    }

    // It's a group node
    const childrenData = expression.children.map((child) => this._convertExpressionToExternal(child));

    let groupData: TWorkItemFilterGroup;
    if (isAndGroupNode(expression)) {
      groupData = { [LOGICAL_OPERATOR.AND]: childrenData } as TWorkItemFilterGroup;
    } else if (isOrGroupNode(expression)) {
      groupData = { [LOGICAL_OPERATOR.OR]: childrenData } as TWorkItemFilterGroup;
    } else {
      throw new Error(`Unknown group node type for expression`);
    }

    // Negation is structural on the wire - wrap the whole group's data in a `not` group instead of
    // tracking it as some variant of the group operator itself.
    if (expression.negate) {
      return { [NEGATION_KEY]: groupData } as TWorkItemFilterNotGroup;
    }
    return groupData;
  }

  /**
   * Type guard to check if data is of type TWorkItemFilterConditionData
   * @param data - The data to check
   * @returns True if data is TWorkItemFilterConditionData, false otherwise
   */
  private _isWorkItemFilterConditionData = (data: unknown): data is TWorkItemFilterConditionData => {
    if (!data || typeof data !== "object" || isEmpty(data)) return false;

    const keys = Object.keys(data);
    if (keys.length === 0) return false;

    // Check if any key contains logical operators (would indicate it's a group)
    const hasLogicalOperators = keys.some((key) => key === LOGICAL_OPERATOR.AND || key === LOGICAL_OPERATOR.OR);
    if (hasLogicalOperators) return false;

    // All keys must match the work item filter condition key pattern
    return keys.every((key) => this._isValidWorkItemFilterConditionKey(key));
  };

  /**
   * Type guard to check if data is a negated expression, e.g. `{ not: { field__op: value } }` (a
   * negated leaf condition) or `{ not: { and: [...] } }` / `{ not: { or: [...] } }` (a negated
   * group). Does not look inside the `not` - see `_isWorkItemFilterGroupData` for that distinction.
   * @param data - The data to check
   * @returns True if data is TWorkItemFilterNotCondition or TWorkItemFilterNotGroup, false otherwise
   */
  private _isNegatedExpression = (data: unknown): data is TWorkItemFilterNotCondition | TWorkItemFilterNotGroup => {
    if (!data || typeof data !== "object" || isEmpty(data)) return false;

    const keys = Object.keys(data);
    return keys.length === 1 && keys[0] === NEGATION_KEY;
  };

  /**
   * Type guard to check if data is a logical group (AND/OR), as opposed to a leaf condition.
   * @param data - The data to check
   * @returns True if data is TWorkItemFilterGroup, false otherwise
   */
  private _isWorkItemFilterGroupData = (data: unknown): data is TWorkItemFilterGroup => {
    if (!data || typeof data !== "object" || isEmpty(data)) return false;

    const keys = Object.keys(data);
    return keys.length === 1 && (keys[0] === LOGICAL_OPERATOR.AND || keys[0] === LOGICAL_OPERATOR.OR);
  };

  /**
   * Validates if a key is a valid work item filter condition key
   * @param key - The key to validate
   * @returns True if the key is valid
   */
  private _isValidWorkItemFilterConditionKey = (key: string): key is TWorkItemFilterConditionKey => {
    if (typeof key !== "string" || key.length === 0) return false;

    // Find the last occurrence of '__' to separate property from operator
    const lastDoubleUnderscoreIndex = key.lastIndexOf("__");
    if (
      lastDoubleUnderscoreIndex === -1 ||
      lastDoubleUnderscoreIndex === 0 ||
      lastDoubleUnderscoreIndex === key.length - 2
    ) {
      return false;
    }

    const property = key.substring(0, lastDoubleUnderscoreIndex);
    const operator = key.substring(lastDoubleUnderscoreIndex + 2);

    // Validate property is in allowed list
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!WORK_ITEM_FILTER_PROPERTY_KEYS.includes(property as any) && !property.startsWith("customproperty_")) {
      return false;
    }

    // Validate operator is not empty
    return operator.length > 0;
  };

  /**
   * Extracts property, operator and value from work item filter condition data
   * @param data - The condition data
   * @returns Tuple of property, operator and value, or null if invalid
   */
  private _extractWorkItemFilterConditionData = (
    data: TWorkItemFilterConditionData
  ): [TWorkItemFilterProperty, TSupportedOperators, SingleOrArray<TFilterValue>] | null => {
    const keys = Object.keys(data);
    if (keys.length !== 1) {
      console.error("Work item filter condition data must have exactly one key");
      return null;
    }

    const key = keys[0];
    if (!this._isValidWorkItemFilterConditionKey(key)) {
      console.error(`Invalid work item filter condition key: ${key}`);
      return null;
    }

    // Find the last occurrence of '__' to separate property from operator
    const lastDoubleUnderscoreIndex = key.lastIndexOf("__");
    const property = key.substring(0, lastDoubleUnderscoreIndex);
    const operator = key.substring(lastDoubleUnderscoreIndex + 2) as TSupportedOperators;

    const rawValue = data[key];

    // Parse comma-separated values
    const parsedValue = MULTI_VALUE_OPERATORS.includes(operator) ? this._parseFilterValue(rawValue) : rawValue;

    return [property as TWorkItemFilterProperty, operator, parsedValue];
  };

  /**
   * Parses filter value from string format
   * @param value - The string value to parse
   * @returns Parsed value as string or array of strings
   */
  private _parseFilterValue = (value: TFilterValue): SingleOrArray<TFilterValue> => {
    if (!value) return value;

    if (typeof value !== "string") return value;

    // Handle empty string
    if (value === "") return value;

    // Split by comma if contains comma, otherwise return as single value
    if (value.includes(",")) {
      // Split and trim each value, filter out empty strings
      const splitValues = value
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v.length > 0);

      // Return single value if only one non-empty value after split
      return splitValues.length === 1 ? splitValues[0] : splitValues;
    }

    return value;
  };

  /**
   * Creates TWorkItemFilterConditionData from property, operator and value
   * @param property - The filter property key
   * @param operator - The filter operator
   * @param value - The filter value
   * @returns The condition data object
   */
  private _createWorkItemFilterConditionData = (
    property: TWorkItemFilterProperty,
    operator: TSupportedOperators,
    value: SingleOrArray<TFilterValue>
  ): TWorkItemFilterConditionData => {
    const conditionKey = `${property}__${operator}`;

    // Convert value to string format
    const stringValue = Array.isArray(value) ? value.join(",") : value;

    return {
      [conditionKey]: stringValue,
    } as TWorkItemFilterConditionData;
  };
}

export const workItemFiltersAdapter = new WorkItemFiltersAdapter();
