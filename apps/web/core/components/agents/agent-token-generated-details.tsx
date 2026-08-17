/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CopyIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TAgentAPIToken } from "@plane/types";
import { copyTextToClipboard } from "@plane/utils";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";

type Props = {
  handleClose: () => void;
  tokenDetails: TAgentAPIToken;
};

/**
 * "Shown once, never again" raw-token display - deliberately mirrors the
 * pre-existing personal API token flow's own `GeneratedTokenDetails`
 * (apps/web/core/components/api-token/modal/generated-token-details.tsx)
 * UX verbatim, per this feature's own spec ("meme UX que la creation de
 * jeton API personnel existante", docs/feature-specs/09-ai-features.md
 * "7. Type d'acteur agent de premiere classe" in plane-selfhost).
 */
export function AgentTokenGeneratedDetails(props: Props) {
  const { handleClose, tokenDetails } = props;
  const { isMobile } = usePlatformOS();
  const { t } = useTranslation();

  const copyToken = (token: string) => {
    copyTextToClipboard(token).then(() =>
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: `${t("success")}!`,
        message: t("workspace_settings.token_copied"),
      })
    );
  };

  return (
    <div className="w-full p-5">
      <div className="w-full space-y-3 text-wrap">
        <h3 className="text-16 leading-6 font-medium text-primary">Token generated</h3>
        <p className="text-13 text-placeholder">
          Copy this token now - it won&apos;t be shown again. Configure it in your agent runner to authenticate against
          this workspace.
        </p>
      </div>
      <button
        type="button"
        onClick={() => copyToken(tokenDetails.token ?? "")}
        className="mt-4 flex w-full items-center justify-between truncate rounded-md border-[0.5px] border-subtle px-3 py-2 text-13 font-medium outline-none"
      >
        <span className="truncate pr-2">{tokenDetails.token}</span>
        <Tooltip tooltipContent="Copy token" isMobile={isMobile}>
          <CopyIcon className="h-4 w-4 flex-shrink-0 text-placeholder" />
        </Tooltip>
      </button>
      <div className="mt-6 flex items-center justify-between">
        <p className="text-11 text-placeholder">{tokenDetails.label}</p>
        <Button variant="secondary" onClick={handleClose}>
          {t("close")}
        </Button>
      </div>
    </div>
  );
}
