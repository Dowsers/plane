// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

/**
 * Commander option accumulator: lets a filter flag be repeated
 * (`--label bug --label urgent`) and/or comma-separated
 * (`--label bug,urgent`) - both read naturally on a command line and the
 * spec doesn't pick one, so support both rather than force a choice.
 */
export function collectList(value: string, previous: string[] = []): string[] {
  return previous.concat(
    value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
