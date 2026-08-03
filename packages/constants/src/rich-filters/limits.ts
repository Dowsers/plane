/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Maximum allowed nesting depth for a filter expression tree.
 * Mirrors `ComplexFilterBackend.default_max_depth` in
 * `apps/api/plane/utils/filters/filter_backend.py` - kept in sync manually since the two live in
 * separate packages/languages. The UI enforces this client-side (disabling "+ Group" past the
 * limit) purely for a better editing experience; the API is the actual source of truth and always
 * re-validates on save/query regardless of what the client sends.
 */
export const FILTER_TREE_MAX_DEPTH = 5;

/**
 * Maximum allowed total number of leaf (non-logical) conditions across an entire filter expression
 * tree, regardless of nesting depth. Mirrors `ComplexFilterBackend.default_max_conditions` in
 * `apps/api/plane/utils/filters/filter_backend.py` - see `FILTER_TREE_MAX_DEPTH` above for the same
 * "client-side UX guard, server is the source of truth" caveat.
 */
export const FILTER_TREE_MAX_CONDITIONS = 50;
