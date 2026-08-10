// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import Table from "cli-table3";

export type OutputMode = "table" | "json";

export function printJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

export interface Column<T> {
  key: keyof T;
  header: string;
  format?: (value: T[keyof T], row: T) => string;
}

export function printTable<T>(rows: T[], columns: Column<T>[]): void {
  if (rows.length === 0) {
    process.stdout.write("(no results)\n");
    return;
  }
  const table = new Table({ head: columns.map((c) => c.header), style: { head: [], border: [] } });
  for (const row of rows) {
    table.push(
      columns.map((c) => {
        const raw = row[c.key];
        const value = c.format ? c.format(raw, row) : raw;
        return value === undefined || value === null || value === "" ? "-" : String(value);
      })
    );
  }
  process.stdout.write(`${table.toString()}\n`);
}

export function truncate(value: string | undefined | null, max: number): string {
  if (!value) return "-";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
