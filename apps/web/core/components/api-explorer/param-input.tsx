/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TOpenAPIParameter } from "@plane/types";
import { Input } from "@plane/ui";

type Props = {
  parameter: TOpenAPIParameter;
  value: string;
  onChange: (value: string) => void;
};

/**
 * One type-appropriate input per OpenAPI parameter (spec item 2: "type
 * approprié (string/int/bool/enum-as-dropdown au minimum)"). Every value
 * is kept as a plain string in the parent's state regardless of the
 * underlying schema type - it ultimately becomes either a URL path
 * segment or a query-string value, both of which are strings on the
 * wire - this component only changes which *control* produces that
 * string. Array-typed parameters fall back to a comma-separated text
 * input (documented simplification, not a crash) rather than a dedicated
 * multi-value widget.
 */
export function ParamInput({ parameter, value, onChange }: Props) {
  const schema = parameter.schema;
  const enumValues = schema?.enum;
  const fieldId = `param-input-${parameter.name}`;

  if (enumValues && enumValues.length > 0) {
    return (
      <select
        id={fieldId}
        name={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus:border-accent-primary w-full rounded-md border border-subtle bg-layer-1 px-2 py-1.5 text-13 text-primary outline-none"
      >
        <option value="">{parameter.required ? "Select a value..." : "(not set)"}</option>
        {enumValues.map((option) => (
          <option key={String(option)} value={String(option)}>
            {String(option)}
          </option>
        ))}
      </select>
    );
  }

  if (schema?.type === "boolean") {
    return (
      <select
        id={fieldId}
        name={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus:border-accent-primary w-full rounded-md border border-subtle bg-layer-1 px-2 py-1.5 text-13 text-primary outline-none"
      >
        <option value="">{parameter.required ? "Select a value..." : "(not set)"}</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (schema?.type === "integer" || schema?.type === "number") {
    return (
      <Input
        id={fieldId}
        name={fieldId}
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputSize="sm"
        placeholder={schema?.default !== undefined ? String(schema.default) : undefined}
      />
    );
  }

  return (
    <Input
      id={fieldId}
      name={fieldId}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      inputSize="sm"
      placeholder={schema?.type === "array" ? "comma,separated,values" : schema?.format === "uuid" ? "UUID" : undefined}
    />
  );
}
