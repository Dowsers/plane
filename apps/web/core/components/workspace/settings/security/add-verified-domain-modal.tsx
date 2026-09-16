/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { CopyIcon } from "@plane/propel/icons";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TDomainVerificationMethod, TWorkspaceVerifiedDomain } from "@plane/types";
import { CustomSelect, EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { copyTextToClipboard, dnsTxtRecordValue, htmlFileVerificationPath } from "@plane/utils";
import { useTranslation } from "@plane/i18n";
// constants
import { DOMAIN_VERIFICATION_METHOD_I18N_LABELS, DOMAIN_VERIFICATION_METHOD_OPTIONS } from "@plane/constants";
// services
import workspaceSecurityService from "@/services/workspace-security.service";

type Props = {
  workspaceSlug: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (domain: TWorkspaceVerifiedDomain) => void;
};

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 6 ("Politiques de securite configurables") -
 * "Add domain" flow: (1) domain + method form, (2) once created, shows
 * exactly what to publish (DNS TXT value or HTML file path/content) so the
 * Owner can go verify it out-of-band before coming back to hit "Verify
 * now" on the list. The two formats mirror
 * `apps/api/plane/utils/domain_verification.py` exactly via the shared
 * `dnsTxtRecordValue`/`htmlFileVerificationPath` helpers (@plane/utils).
 */
export function AddVerifiedDomainModal(props: Props) {
  const { workspaceSlug, isOpen, onClose, onCreated } = props;
  const { t } = useTranslation();
  // state
  const [domain, setDomain] = useState("");
  const [method, setMethod] = useState<TDomainVerificationMethod>("DNS_TXT");
  const [created, setCreated] = useState<TWorkspaceVerifiedDomain | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setDomain("");
      setMethod("DNS_TXT");
      setCreated(null);
    }, 350);
  };

  const handleSubmit = async () => {
    if (!domain.trim()) return;
    setIsSubmitting(true);
    try {
      const result = await workspaceSecurityService.createVerifiedDomain(workspaceSlug, {
        domain: domain.trim(),
        verification_method: method,
      });
      setCreated(result);
      onCreated(result);
    } catch (error: unknown) {
      const err = error as { error?: string; domain?: string[] };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("add_verified_domain_modal.toast.add_failed_title"),
        message: err?.error ?? err?.domain?.[0] ?? t("something_went_wrong_please_try_again"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copy = (value: string) => {
    copyTextToClipboard(value).then(() =>
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("add_verified_domain_modal.toast.copied_title"),
        message: t("add_verified_domain_modal.toast.copied_message"),
      })
    );
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="flex flex-col gap-4 p-6">
        {!created ? (
          <>
            <div>
              <h3 className="text-h5-medium">{t("add_verified_domain_modal.title")}</h3>
              <p className="mt-1 text-body-xs-regular text-secondary">{t("add_verified_domain_modal.description")}</p>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-body-xs-medium text-secondary">{t("verified_domains_panel.table.domain")}</span>
              <Input
                id="add-verified-domain-domain"
                name="add-verified-domain-domain"
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="example.com"
                className="w-full"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-body-xs-medium text-secondary">{t("add_verified_domain_modal.method_label")}</span>
              <CustomSelect
                value={method}
                onChange={(value: TDomainVerificationMethod) => setMethod(value)}
                label={t(DOMAIN_VERIFICATION_METHOD_I18N_LABELS[method])}
                buttonClassName="border border-subtle bg-layer-2 w-full"
              >
                {DOMAIN_VERIFICATION_METHOD_OPTIONS.map((option) => (
                  <CustomSelect.Option key={option} value={option}>
                    {t(DOMAIN_VERIFICATION_METHOD_I18N_LABELS[option])}
                  </CustomSelect.Option>
                ))}
              </CustomSelect>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="lg" onClick={handleClose} disabled={isSubmitting}>
                {t("cancel")}
              </Button>
              <Button
                variant="primary"
                size="lg"
                onClick={handleSubmit}
                disabled={!domain.trim()}
                loading={isSubmitting}
              >
                {t("verified_domains_panel.add_domain")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div>
              <h3 className="text-h5-medium">
                {t("add_verified_domain_modal.verify_heading", { domain: created.domain })}
              </h3>
              <p className="mt-1 text-body-xs-regular text-secondary">
                {created.verification_method === "DNS_TXT"
                  ? t("add_verified_domain_modal.dns_instructions")
                  : t("add_verified_domain_modal.html_instructions")}
              </p>
            </div>

            {created.verification_method === "DNS_TXT" ? (
              <div className="flex flex-col gap-2">
                <span className="text-caption-sm-regular text-tertiary">
                  {t("add_verified_domain_modal.record_type")}
                </span>
                <code className="rounded-md border border-subtle bg-layer-2 px-3 py-2 text-body-xs-regular">TXT</code>
                <span className="text-caption-sm-regular text-tertiary">
                  {t("add_verified_domain_modal.record_name")}
                </span>
                <code className="rounded-md border border-subtle bg-layer-2 px-3 py-2 text-body-xs-regular">
                  {created.domain}
                </code>
                <span className="text-caption-sm-regular text-tertiary">
                  {t("add_verified_domain_modal.record_value")}
                </span>
                <button
                  type="button"
                  onClick={() => copy(dnsTxtRecordValue(created.verification_token))}
                  className="flex items-center justify-between gap-2 truncate rounded-md border border-subtle bg-layer-2 px-3 py-2 text-left text-body-xs-regular"
                >
                  <span className="truncate">{dnsTxtRecordValue(created.verification_token)}</span>
                  <CopyIcon className="size-3.5 shrink-0 text-placeholder" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-caption-sm-regular text-tertiary">
                  {t("add_verified_domain_modal.file_path_label")}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    copy(`https://${created.domain}${htmlFileVerificationPath(created.verification_token)}`)
                  }
                  className="flex items-center justify-between gap-2 truncate rounded-md border border-subtle bg-layer-2 px-3 py-2 text-left text-body-xs-regular"
                >
                  <span className="truncate">
                    https://{created.domain}
                    {htmlFileVerificationPath(created.verification_token)}
                  </span>
                  <CopyIcon className="size-3.5 shrink-0 text-placeholder" />
                </button>
                <span className="text-caption-sm-regular text-tertiary">
                  {t("add_verified_domain_modal.file_content_label")}
                </span>
                <button
                  type="button"
                  onClick={() => copy(created.verification_token)}
                  className="flex items-center justify-between gap-2 truncate rounded-md border border-subtle bg-layer-2 px-3 py-2 text-left text-body-xs-regular"
                >
                  <span className="truncate">{created.verification_token}</span>
                  <CopyIcon className="size-3.5 shrink-0 text-placeholder" />
                </button>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="secondary" size="lg" onClick={handleClose}>
                {t("add_verified_domain_modal.done")}
              </Button>
            </div>
          </>
        )}
      </div>
    </ModalCore>
  );
}
