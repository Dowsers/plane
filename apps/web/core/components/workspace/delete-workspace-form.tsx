/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Controller, useForm } from "react-hook-form";
import { AlertTriangle } from "lucide-react";
// Plane Imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IWorkspace } from "@plane/types";
import { Input } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { ReauthModal } from "@/components/workspace/settings/security/reauth-modal";
// helpers
import { isReauthRequiredError } from "@/helpers/reauth.helper";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserSettings } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { useSensitiveActionGuard } from "@/hooks/use-sensitive-action-guard";

type Props = {
  data: IWorkspace | null;
  onClose: () => void;
};

const defaultValues = {
  workspaceName: "",
  confirmDelete: "",
};

export const DeleteWorkspaceForm = observer(function DeleteWorkspaceForm(props: Props) {
  const { data, onClose } = props;
  // router
  const router = useAppRouter();
  // store hooks
  const { deleteWorkspace } = useWorkspace();
  const { t } = useTranslation();
  const { getWorkspaceRedirectionUrl } = useWorkspace();
  const { fetchCurrentUserSettings } = useUserSettings();
  // Category 11 (docs/feature-specs/11-admin-security-sso.md in
  // plane-selfhost), feature 6, exigence 8 - workspace deletion is one of
  // the 4 sensitive actions `force_reauth_for_sensitive_actions` gates
  // (`WorkSpaceViewSet.destroy()`).
  const { runGuarded, isReauthModalOpen, onReauthSuccess, onReauthClose } = useSensitiveActionGuard(data?.slug ?? "");
  // form info
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    reset,
    watch,
  } = useForm({ defaultValues });

  const canDelete = watch("workspaceName") === data?.name && watch("confirmDelete") === "delete my workspace";

  const handleClose = () => {
    const timer = setTimeout(() => {
      reset(defaultValues);
      clearTimeout(timer);
    }, 350);

    onClose();
  };

  const onSubmit = async () => {
    if (!data || !canDelete) return;

    try {
      await runGuarded(() => deleteWorkspace(data.slug));
      await fetchCurrentUserSettings();
      handleClose();
      router.push(getWorkspaceRedirectionUrl());
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("workspace_settings.settings.general.delete_modal.success_title"),
        message: t("workspace_settings.settings.general.delete_modal.success_message"),
      });
    } catch (error: unknown) {
      // A cancelled re-auth challenge is a deliberate no-op, not a
      // failure - the modal already closed itself, nothing else to do.
      if (isReauthRequiredError(error)) return;

      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("workspace_settings.settings.general.delete_modal.error_title"),
        message: t("workspace_settings.settings.general.delete_modal.error_message"),
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 p-6">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <span
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-full bg-danger-subtle text-danger-primary sm:size-10"
          )}
        >
          <AlertTriangle className="size-5 text-danger-primary" aria-hidden="true" />
        </span>
        <div>
          <div className="text-center sm:text-left">
            <h3 className="text-h5-medium">{t("workspace_settings.settings.general.delete_modal.title")}</h3>
            <p className="mt-1 text-body-xs-regular text-secondary">
              You are about to delete the workspace{" "}
              <span className="text-body-xs-semibold break-words">{data?.name}</span>. If you confirm, you will lose
              access to all your work data in this workspace without any way to restore it. Tread very carefully.
            </p>
          </div>

          <div className="mt-4 text-secondary">
            <p className="text-body-xs-regular break-words">Type in this workspace&apos;s name to continue.</p>
            <Controller
              control={control}
              name="workspaceName"
              render={({ field: { value, onChange, ref } }) => (
                <Input
                  id="workspaceName"
                  name="workspaceName"
                  type="text"
                  value={value}
                  onChange={onChange}
                  ref={ref}
                  hasError={Boolean(errors.workspaceName)}
                  placeholder={data?.name}
                  className="mt-2 w-full"
                  autoComplete="off"
                />
              )}
            />
          </div>

          <div className="mt-4 text-secondary">
            <p className="text-body-xs-regular">
              For final confirmation, type{" "}
              <span className="text-body-xs-medium text-primary">delete my workspace </span>
              below.
            </p>
            <Controller
              control={control}
              name="confirmDelete"
              render={({ field: { value, onChange, ref } }) => (
                <Input
                  id="confirmDelete"
                  name="confirmDelete"
                  type="text"
                  value={value}
                  onChange={onChange}
                  ref={ref}
                  hasError={Boolean(errors.confirmDelete)}
                  placeholder=""
                  className="mt-2 w-full"
                  autoComplete="off"
                />
              )}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="lg" onClick={handleClose}>
          {t("cancel")}
        </Button>
        <Button variant="error-fill" size="lg" type="submit" disabled={!canDelete} loading={isSubmitting}>
          {isSubmitting ? t("deleting") : t("confirm")}
        </Button>
      </div>

      {data?.slug && (
        <ReauthModal
          workspaceSlug={data.slug}
          isOpen={isReauthModalOpen}
          onClose={onReauthClose}
          onSuccess={onReauthSuccess}
        />
      )}
    </form>
  );
});
