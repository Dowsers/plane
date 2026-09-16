/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Button } from "@plane/propel/button";
import { CopyIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TSCIMTokenCreateResponse } from "@plane/types";
import { copyTextToClipboard } from "@plane/utils";
import { useTranslation } from "@plane/i18n";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";

type Props = {
  handleClose: () => void;
  tokenDetails: TSCIMTokenCreateResponse;
  baseUrl: string;
};

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 2 ("SCIM 2.0 natif") - "shown once, copy now"
 * raw-token display, deliberately mirroring the pre-existing personal API
 * token flow's own `GeneratedTokenDetails`
 * (apps/web/core/components/api-token/modal/generated-token-details.tsx)
 * UX verbatim - the SAME pattern category 9's `AgentTokenGeneratedDetails`
 * (apps/web/core/components/agents/agent-token-generated-details.tsx)
 * already reused for its own token type. Also shows the Base URL (a
 * static value, not per-token) alongside the raw token - per this
 * feature's own spec wording ("copie de la Base URL prete a coller dans
 * l'IdP"), an Okta/Azure AD SCIM wizard needs both at once.
 */
export function GeneratedSCIMTokenDetails(props: Props) {
  const { handleClose, tokenDetails, baseUrl } = props;
  const { isMobile } = usePlatformOS();
  const { t } = useTranslation();

  const copyValue = (value: string, copiedMessage: string) => {
    copyTextToClipboard(value).then(() =>
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("generated_scim_token_details.copied_title"),
        message: copiedMessage,
      })
    );
  };

  return (
    <div className="w-full p-5">
      <div className="w-full space-y-3 text-wrap">
        <h3 className="text-16 leading-6 font-medium text-primary">{t("generated_scim_token_details.title")}</h3>
        <p className="text-13 text-placeholder">{t("generated_scim_token_details.description")}</p>
      </div>

      <div className="mt-4 flex flex-col gap-1">
        <span className="text-caption-sm-medium text-tertiary uppercase">
          {t("generated_scim_token_details.base_url")}
        </span>
        <button
          type="button"
          onClick={() => copyValue(baseUrl, t("generated_scim_token_details.base_url_copied_message"))}
          className="flex w-full items-center justify-between truncate rounded-md border-[0.5px] border-subtle px-3 py-2 text-13 font-medium outline-none"
        >
          <span className="truncate pr-2">{baseUrl}</span>
          <Tooltip tooltipContent={t("generated_scim_token_details.copy_base_url")} isMobile={isMobile}>
            <CopyIcon className="h-4 w-4 flex-shrink-0 text-placeholder" />
          </Tooltip>
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-1">
        <span className="text-caption-sm-medium text-tertiary uppercase">
          {t("generated_scim_token_details.bearer_token")}
        </span>
        <button
          type="button"
          onClick={() => copyValue(tokenDetails.token, t("generated_scim_token_details.token_copied_message"))}
          className="flex w-full items-center justify-between truncate rounded-md border-[0.5px] border-subtle px-3 py-2 text-13 font-medium outline-none"
        >
          <span className="truncate pr-2">{tokenDetails.token}</span>
          <Tooltip tooltipContent={t("generated_scim_token_details.copy_token")} isMobile={isMobile}>
            <CopyIcon className="h-4 w-4 flex-shrink-0 text-placeholder" />
          </Tooltip>
        </button>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-11 text-placeholder">{tokenDetails.label}</p>
        <Button variant="secondary" onClick={handleClose}>
          {t("close")}
        </Button>
      </div>
    </div>
  );
}
