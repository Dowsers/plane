/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { useTranslation } from "@plane/i18n";
// hooks
import { useUser } from "@/hooks/store/user";
// services
import workspaceSecurityService from "@/services/workspace-security.service";

type Props = {
  workspaceSlug: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

type TMethod = "password" | "magic_code";
type TMagicStep = "request" | "confirm";

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 6 ("Politiques de securite configurables"),
 * exigence 8 - generic, reusable "confirm you are still you" modal. This
 * IS the first credential-re-entry UI primitive in this fork - the
 * feature 5 `TransferOwnershipModal` explicitly documents that it reused
 * the "type the workspace name" pattern instead of password re-entry
 * because no such primitive existed yet (see that component's own
 * docstring). Never render this directly from a click handler - drive it
 * from `@/hooks/use-sensitive-action-guard`, which opens it automatically
 * on a `REAUTH_REQUIRED` rejection and transparently retries the original
 * action once `onSuccess` fires.
 *
 * Backend contract (`POST /api/workspaces/<slug>/reauth/`, `plane.app.
 * views.workspace.security.WorkspaceReauthChallengeEndpoint`): reuses the
 * SAME `EmailProvider`/`MagicCodeProvider` verification logic real login
 * uses, just without issuing a new session - `{"method": "password",
 * "password": "..."}` or the two-step magic-code flow (`{"method":
 * "magic_code", "action": "request"}` then `{"method": "magic_code",
 * "action": "confirm", "code": "..."}`).
 */
export const ReauthModal = observer(function ReauthModal(props: Props) {
  const { workspaceSlug, isOpen, onClose, onSuccess } = props;
  const { t } = useTranslation();
  // store hooks
  const { data: currentUser } = useUser();
  // derived values
  const hasPassword = !currentUser?.is_password_autoset;
  // state
  const [method, setMethod] = useState<TMethod>(hasPassword ? "password" : "magic_code");
  const [magicStep, setMagicStep] = useState<TMagicStep>("request");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset all local state whenever the modal transitions from closed to
  // open, so a previous failed attempt never leaks into the next one.
  useEffect(() => {
    if (isOpen) {
      setMethod(hasPassword ? "password" : "magic_code");
      setMagicStep("request");
      setPassword("");
      setCode("");
      setError(null);
      setIsSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  const handlePasswordSubmit = async () => {
    if (!password) {
      setError(t("reauth_modal.errors.enter_password"));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await workspaceSecurityService.requestReauth(workspaceSlug, { method: "password", password });
      if (response.reauthenticated) {
        onSuccess();
      }
    } catch (err: unknown) {
      const e = err as { error_message?: string; detail?: string };
      setError(e?.error_message ?? e?.detail ?? t("reauth_modal.errors.incorrect_password"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestCode = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await workspaceSecurityService.requestReauth(workspaceSlug, { method: "magic_code", action: "request" });
      setMagicStep("confirm");
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("reauth_modal.toast.code_sent_title"),
        message: t("reauth_modal.toast.code_sent_message"),
      });
    } catch (err: unknown) {
      const e = err as { error_message?: string; detail?: string };
      setError(e?.error_message ?? e?.detail ?? t("reauth_modal.errors.code_send_failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmCode = async () => {
    if (!code) {
      setError(t("reauth_modal.errors.enter_code"));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await workspaceSecurityService.requestReauth(workspaceSlug, {
        method: "magic_code",
        action: "confirm",
        code,
      });
      if (response.reauthenticated) {
        onSuccess();
      }
    } catch (err: unknown) {
      const e = err as { error_message?: string; detail?: string };
      setError(e?.error_message ?? e?.detail ?? t("reauth_modal.errors.invalid_code"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-full bg-warning-subtle text-warning-primary"
            )}
          >
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-h5-medium">{t("reauth_modal.title")}</h3>
            <p className="text-body-xs-regular text-secondary">{t("reauth_modal.description")}</p>
          </div>
        </div>

        {method === "password" && (
          <div className="flex flex-col gap-2">
            <span className="text-body-xs-medium text-secondary">{t("reauth_modal.password_label")}</span>
            <div className="relative flex items-center rounded-md">
              <Input
                id="reauth-password"
                name="reauth-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("reauth_modal.password_placeholder")}
                className="w-full"
                hasError={Boolean(error)}
                autoComplete="current-password"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handlePasswordSubmit();
                }}
              />
              {showPassword ? (
                <EyeOff
                  className="absolute right-3 h-4 w-4 cursor-pointer stroke-placeholder"
                  onClick={() => setShowPassword(false)}
                />
              ) : (
                <Eye
                  className="absolute right-3 h-4 w-4 cursor-pointer stroke-placeholder"
                  onClick={() => setShowPassword(true)}
                />
              )}
            </div>
            {hasPassword && (
              <button
                type="button"
                className="w-fit text-caption-sm-regular text-accent-primary hover:underline"
                onClick={() => {
                  setMethod("magic_code");
                  setMagicStep("request");
                  setError(null);
                }}
              >
                {t("reauth_modal.use_email_code")}
              </button>
            )}
          </div>
        )}

        {method === "magic_code" && (
          <div className="flex flex-col gap-2">
            {magicStep === "request" ? (
              <p className="text-body-xs-regular text-secondary">{t("reauth_modal.magic_code_request_description")}</p>
            ) : (
              <>
                <span className="text-body-xs-medium text-secondary">{t("reauth_modal.verification_code_label")}</span>
                <Input
                  id="reauth-code"
                  name="reauth-code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={t("reauth_modal.verification_code_placeholder")}
                  className="w-full"
                  hasError={Boolean(error)}
                  autoComplete="one-time-code"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleConfirmCode();
                  }}
                />
              </>
            )}
            {hasPassword && (
              <button
                type="button"
                className="w-fit text-caption-sm-regular text-accent-primary hover:underline"
                onClick={() => {
                  setMethod("password");
                  setError(null);
                }}
              >
                {t("reauth_modal.use_password")}
              </button>
            )}
          </div>
        )}

        {error && <p className="text-caption-sm-regular text-danger-primary">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={handleClose} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          {method === "password" && (
            <Button variant="primary" size="lg" onClick={handlePasswordSubmit} loading={isSubmitting}>
              {t("confirm")}
            </Button>
          )}
          {method === "magic_code" && magicStep === "request" && (
            <Button variant="primary" size="lg" onClick={handleRequestCode} loading={isSubmitting}>
              {t("reauth_modal.send_code")}
            </Button>
          )}
          {method === "magic_code" && magicStep === "confirm" && (
            <Button variant="primary" size="lg" onClick={handleConfirmCode} loading={isSubmitting}>
              {t("confirm")}
            </Button>
          )}
        </div>
      </div>
    </ModalCore>
  );
});
