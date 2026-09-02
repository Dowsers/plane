/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TSCIMTokenCreateResponse } from "@plane/types";
import { EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { useTranslation } from "@plane/i18n";
// services
import workspaceSCIMService from "@/services/workspace-scim.service";
// local imports
import { GeneratedSCIMTokenDetails } from "./generated-scim-token-details";

type Props = {
  isOpen: boolean;
  workspaceSlug: string;
  baseUrl: string;
  onClose: () => void;
  onCreated: (token: TSCIMTokenCreateResponse) => void;
};

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 2 ("SCIM 2.0 natif") - two-step create flow
 * (label form -> shown-once token details), mirroring
 * `CreateApiTokenModal` (apps/web/core/components/api-token/modal/
 * create-token-modal.tsx)'s own form/generated-details split.
 */
export function CreateSCIMTokenModal(props: Props) {
  const { isOpen, workspaceSlug, baseUrl, onClose, onCreated } = props;
  const { t } = useTranslation();
  // state
  const [label, setLabel] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<TSCIMTokenCreateResponse | null>(null);

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setLabel("");
      setGeneratedToken(null);
    }, 350);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const token = await workspaceSCIMService.createToken(workspaceSlug, { label: label.trim() || undefined });
      setGeneratedToken(token);
      onCreated(token);
    } catch (error: unknown) {
      const err = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("scim.create_token_modal.toast.failed_title"),
        message: err?.error ?? t("something_went_wrong_please_try_again"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={() => {}} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      {generatedToken ? (
        <GeneratedSCIMTokenDetails handleClose={handleClose} tokenDetails={generatedToken} baseUrl={baseUrl} />
      ) : (
        <div className="flex flex-col gap-4 p-5">
          <div>
            <h3 className="text-16 font-medium text-primary">{t("scim.create_token_modal.title")}</h3>
            <p className="mt-1 text-13 text-tertiary">{t("scim.create_token_modal.description")}</p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-body-xs-medium text-secondary">{t("scim.create_token_modal.label")}</span>
            <Input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("scim.create_token_modal.label_placeholder")}
              className="w-full"
              autoComplete="off"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="lg" onClick={handleClose} disabled={isSubmitting}>
              {t("cancel")}
            </Button>
            <Button variant="primary" size="lg" onClick={handleSubmit} loading={isSubmitting}>
              {t("scim.create_token_modal.submit")}
            </Button>
          </div>
        </div>
      )}
    </ModalCore>
  );
}
