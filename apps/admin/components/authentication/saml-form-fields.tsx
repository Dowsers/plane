/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Input } from "@plane/ui";

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 1 ("SSO SAML 2.0 natif") - small layout
 * primitives shared by the SAML create and edit god-mode pages, so the
 * IdP-metadata/attribute-mapping form looks identical whether it's being
 * filled in for the first time or edited afterwards.
 */
export function Section(props: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-subtle pb-8 last:border-0 last:pb-0">
      <div>
        <div className="text-16 font-medium text-primary">{props.title}</div>
        <div className="text-11 leading-5 font-regular text-tertiary">{props.description}</div>
      </div>
      <div className="flex flex-col gap-4">{props.children}</div>
    </div>
  );
}

export function LabeledInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  disabled?: boolean;
}) {
  const { label, value, onChange, placeholder, required, type = "text", disabled } = props;
  const fieldId = `saml-field-${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-13 font-medium text-tertiary">
        {label} {required && <span className="text-danger-primary">*</span>}
      </label>
      <Input
        id={fieldId}
        name={fieldId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full"
        autoComplete="off"
        disabled={disabled}
      />
    </div>
  );
}
