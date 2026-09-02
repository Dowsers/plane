/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR, { mutate } from "swr";
import { Copy, Pencil, RefreshCw, Trash2 } from "lucide-react";
// plane imports
import { SITES_URL } from "@plane/constants";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIntakeForm } from "@plane/types";
import { Button, Loader, ToggleSwitch } from "@plane/ui";
import { copyTextToClipboard } from "@plane/utils";
// components
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
// services
import { IntakeFormService } from "@/services/inbox";
// local imports
import { IntakeFormFormModal } from "./form-modal";

const intakeFormService = new IntakeFormService();

const FORMS_KEY = (workspaceSlug: string, projectId: string) => `INTAKE_FORMS_${workspaceSlug}_${projectId}`;

type Props = {
  workspaceSlug: string;
  projectId: string;
};

export const IntakeFormsRoot = observer(function IntakeFormsRoot(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { t } = useTranslation();
  const { allowPermissions } = useUserPermissions();
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId);
  const canView = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );

  const [editingForm, setEditingForm] = useState<TIntakeForm | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: forms } = useSWR(
    canView ? FORMS_KEY(workspaceSlug, projectId) : null,
    canView ? () => intakeFormService.list(workspaceSlug, projectId) : null
  );

  if (!canView) return null;

  const refresh = () => mutate(FORMS_KEY(workspaceSlug, projectId));

  const publicLink = (token: string) => `${SITES_URL}/intake-forms/${token}`;

  const handleCopyLink = (token: string) => {
    copyTextToClipboard(publicLink(token));
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: t("toast.success"),
      message: t("intake_settings.forms.list.link_copied"),
    });
  };

  const handleToggleEnabled = async (form: TIntakeForm) => {
    try {
      await intakeFormService.update(workspaceSlug, projectId, form.id, { is_enabled: !form.is_enabled });
      refresh();
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: error?.error ?? t("intake_settings.forms.list.update_error"),
      });
    }
  };

  const handleRegenerateToken = async (form: TIntakeForm) => {
    try {
      await intakeFormService.regenerateToken(workspaceSlug, projectId, form.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: t("intake_settings.forms.list.token_regenerated"),
      });
      refresh();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("intake_settings.forms.list.regenerate_error"),
      });
    }
  };

  const handleDelete = async (form: TIntakeForm) => {
    try {
      await intakeFormService.remove(workspaceSlug, projectId, form.id);
      refresh();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("intake_settings.forms.list.delete_error"),
      });
    }
  };

  return (
    <section className="mt-7 w-full border-t border-subtle pt-7">
      <div className="flex items-center justify-between">
        <SettingsHeading
          title={t("intake_settings.forms.list.title")}
          description={t("intake_settings.forms.list.description")}
        />
        {isAdmin && (
          <Button
            variant="primary"
            size="sm"
            className="shrink-0"
            onClick={() => {
              setEditingForm(null);
              setIsModalOpen(true);
            }}
          >
            {t("intake_settings.forms.list.new_form")}
          </Button>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {!forms && (
          <Loader className="flex flex-col gap-2">
            <Loader.Item height="50px" />
          </Loader>
        )}
        {forms?.length === 0 && <p className="text-13 text-tertiary">{t("intake_settings.forms.list.no_forms")}</p>}
        {forms?.map((form) => (
          <div
            key={form.id}
            className="flex items-center justify-between gap-2 rounded-md border border-subtle px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <ToggleSwitch value={form.is_enabled} onChange={() => handleToggleEnabled(form)} disabled={!isAdmin} />
              <div className="flex flex-col">
                <span className="text-13 font-medium text-primary">{form.name}</span>
                <span className="text-11 text-tertiary">{publicLink(form.token)}</span>
              </div>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleCopyLink(form.token)}
                  className="rounded-sm p-1 hover:bg-layer-1"
                  title={t("intake_settings.forms.list.copy_link")}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRegenerateToken(form)}
                  className="rounded-sm p-1 hover:bg-layer-1"
                  title={t("intake_settings.forms.list.regenerate_link")}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingForm(form);
                    setIsModalOpen(true);
                  }}
                  className="rounded-sm p-1 hover:bg-layer-1"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => handleDelete(form)} className="rounded-sm p-1 hover:bg-layer-1">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <IntakeFormFormModal
        isOpen={isModalOpen}
        handleClose={() => setIsModalOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        form={editingForm}
        onSaved={refresh}
      />
    </section>
  );
});
