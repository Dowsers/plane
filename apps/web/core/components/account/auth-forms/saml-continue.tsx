/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { XCircle } from "lucide-react";
// plane imports
import { API_BASE_URL } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Input } from "@plane/ui";

type Props = {
  email: string;
  /** IdP display name (`InstanceSAMLConfiguration.name`), from
   * `/auth/saml/discover/`'s response. */
  name: string;
  /** Relative `/auth/saml/<id>/login/` path from the same response. */
  loginUrl: string;
  nextPath?: string;
  handleEmailClear: () => void;
};

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 1 ("SSO SAML 2.0 natif"), exigence 6 - shown
 * instead of the password/unique-code/OAuth steps once
 * `POST /auth/saml/discover/` reports `sso_applies: true` for the entered
 * email. "Continue" is a REAL browser navigation
 * (`window.location.href`), not a `fetch()` - `GET /auth/saml/<id>/login/`
 * issues a 302 redirect to the IdP with a signed `AuthnRequest`.
 */
export function SAMLContinueForm(props: Props) {
  const { email, name, loginUrl, nextPath, handleEmailClear } = props;
  const { t } = useTranslation();

  const handleContinue = () => {
    const params = nextPath ? `?next_path=${encodeURIComponent(nextPath)}` : "";
    window.location.href = `${API_BASE_URL}${loginUrl}${params}`;
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="saml-email" className="text-13 font-medium text-tertiary">
          {t("auth.common.email.label")}
        </label>
        <div className="relative flex items-center rounded-md border border-strong bg-surface-1">
          <Input
            id="saml-email"
            type="email"
            value={email}
            className="h-10 w-full border-0 disable-autofill-style placeholder:text-placeholder"
            disabled
          />
          <button
            type="button"
            className="absolute right-3 size-5"
            onClick={handleEmailClear}
            aria-label={t("auth.saml.use_different_email")}
          >
            <XCircle className="size-5 stroke-placeholder" />
          </button>
        </div>
      </div>
      <p className="text-13 text-tertiary">
        {t("auth.saml.sso_required_notice")} <span className="font-medium text-secondary">{name}</span>.
      </p>
      <Button type="button" variant="primary" className="w-full" size="xl" onClick={handleContinue}>
        {t("auth.saml.continue_with", { name })}
      </Button>
    </div>
  );
}
