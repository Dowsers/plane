/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { KeyRound } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CopyIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { copyTextToClipboard } from "@plane/utils";

export type Props = {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: () => Promise<{ reset_link: string }>;
  userDetails: {
    id: string;
    display_name: string;
  };
};

export const ResetMemberPasswordModal = observer(function ResetMemberPasswordModal(props: Props) {
  const { isOpen, onClose, onGenerate, userDetails } = props;
  // states
  const [isGenerating, setIsGenerating] = useState(false);
  const [resetLink, setResetLink] = useState("");
  const { t } = useTranslation();

  useEffect(() => {
    if (!isOpen) {
      setResetLink("");
      setIsGenerating(false);
    }
  }, [isOpen]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const response = await onGenerate();
      setResetLink(response.reset_link);
    } catch (error: unknown) {
      const err = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: err?.error || t("something_went_wrong_please_try_again"),
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    copyTextToClipboard(resetLink).then(() =>
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Copied", message: "Reset link copied to clipboard." })
    );
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
        <div className="sm:flex sm:items-start">
          <div className="mx-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-layer-1 sm:mx-0 sm:h-10 sm:w-10">
            <KeyRound className="h-6 w-6 text-secondary" aria-hidden="true" />
          </div>
          <div className="mt-3 w-full text-center sm:mt-0 sm:ml-4 sm:text-left">
            <h3 className="text-h5-medium leading-6 text-primary">Reset password for {userDetails.display_name}?</h3>
            <div className="mt-2">
              {!resetLink ? (
                <p className="text-body-xs-regular text-secondary">
                  This generates a password reset link. Since this instance has no email server configured, it is not
                  sent automatically — you&apos;ll need to copy it and share it with{" "}
                  <span className="font-medium">{userDetails.display_name}</span> yourself.
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-body-xs-regular text-secondary">
                    Share this link with <span className="font-medium">{userDetails.display_name}</span> through a
                    secure channel. It lets them set a new password and expires in a few days. It will not be shown
                    again after you close this window.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={resetLink} className="w-full text-13" />
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={handleCopy}
                      prependIcon={<CopyIcon className="size-4" />}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 p-4 sm:px-6">
        <Button variant="secondary" size="lg" onClick={onClose}>
          {resetLink ? "Close" : t("cancel")}
        </Button>
        {!resetLink && (
          <Button variant="primary" size="lg" onClick={handleGenerate} loading={isGenerating}>
            {isGenerating ? "Generating link" : "Generate reset link"}
          </Button>
        )}
      </div>
    </ModalCore>
  );
});
