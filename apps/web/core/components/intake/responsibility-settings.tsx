/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import useSWR, { mutate } from "swr";
import { ArrowDown, ArrowUp, X } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIntakeResponsibilitySetting } from "@plane/types";
import { Avatar, Button, CustomSelect, Input, Loader, ToggleSwitch } from "@plane/ui";
import { getFileURL } from "@plane/utils";
// components
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { SettingsControlItem } from "@/components/settings/control-item";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { IntakeResponsibilityService } from "@/services/inbox";

const intakeResponsibilityService = new IntakeResponsibilityService();

const SETTING_KEY = (workspaceSlug: string, projectId: string) =>
  `INTAKE_RESPONSIBILITY_SETTING_${workspaceSlug}_${projectId}`;
const ROTATION_KEY = (workspaceSlug: string, projectId: string) =>
  `INTAKE_ROTATION_MEMBERS_${workspaceSlug}_${projectId}`;

type Props = {
  workspaceSlug: string;
  projectId: string;
};

export const IntakeResponsibilitySettings = observer(function IntakeResponsibilitySettings(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { t } = useTranslation();
  const { allowPermissions } = useUserPermissions();
  const {
    project: { getProjectMemberIds },
  } = useMember();
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId);
  const canView = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );

  const [form, setForm] = useState<TIntakeResponsibilitySetting | null>(null);
  const [addMemberId, setAddMemberId] = useState<string | null>(null);

  const { data } = useSWR(
    canView ? SETTING_KEY(workspaceSlug, projectId) : null,
    canView ? () => intakeResponsibilityService.getSetting(workspaceSlug, projectId) : null
  );
  const { data: rotationMembers } = useSWR(
    canView ? ROTATION_KEY(workspaceSlug, projectId) : null,
    canView ? () => intakeResponsibilityService.listRotationMembers(workspaceSlug, projectId) : null
  );

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (!canView) return null;

  if (!form) {
    return (
      <Loader className="mt-7 flex flex-col gap-3">
        <Loader.Item height="40px" />
        <Loader.Item height="40px" />
      </Loader>
    );
  }

  const persist = async (patch: Partial<TIntakeResponsibilitySetting>) => {
    const nextForm = { ...form, ...patch };
    setForm(nextForm);
    try {
      const response = await intakeResponsibilityService.updateSetting(workspaceSlug, projectId, patch);
      setForm(response);
      mutate(SETTING_KEY(workspaceSlug, projectId), response, false);
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: error?.error ?? t("intake_settings.responsibility.save_error"),
      });
      setForm(form);
    }
  };

  const handleAddMember = async () => {
    if (!addMemberId) return;
    try {
      await intakeResponsibilityService.addRotationMember(workspaceSlug, projectId, addMemberId);
      setAddMemberId(null);
      mutate(ROTATION_KEY(workspaceSlug, projectId));
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: error?.error ?? t("intake_settings.responsibility.add_member_error"),
      });
    }
  };

  const handleRemoveMember = async (rotationMemberId: string) => {
    try {
      await intakeResponsibilityService.removeRotationMember(workspaceSlug, projectId, rotationMemberId);
      mutate(ROTATION_KEY(workspaceSlug, projectId));
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("intake_settings.responsibility.remove_member_error"),
      });
    }
  };

  const handleReorder = async (index: number, direction: -1 | 1) => {
    if (!rotationMembers) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= rotationMembers.length) return;

    const reordered = [...rotationMembers];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    mutate(ROTATION_KEY(workspaceSlug, projectId), reordered, false);
    try {
      await intakeResponsibilityService.reorderRotationMembers(
        workspaceSlug,
        projectId,
        reordered.map((m) => m.id)
      );
      mutate(ROTATION_KEY(workspaceSlug, projectId));
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("intake_settings.responsibility.reorder_error"),
      });
      mutate(ROTATION_KEY(workspaceSlug, projectId));
    }
  };

  const existingMemberIds = new Set((rotationMembers ?? []).map((m) => m.member));
  const addableMemberIds = (getProjectMemberIds(projectId, false) ?? []).filter((id) => !existingMemberIds.has(id));

  return (
    <section className="mt-7 w-full border-t border-subtle pt-7">
      <SettingsHeading
        title={t("intake_settings.responsibility.heading.title")}
        description={t("intake_settings.responsibility.heading.description")}
      />
      <div className="mt-4 divide-y divide-subtle">
        <SettingsControlItem
          title={t("intake_settings.responsibility.enable.title")}
          description={t("intake_settings.responsibility.enable.description")}
          control={
            <ToggleSwitch
              value={form.is_enabled}
              onChange={() => persist({ is_enabled: !form.is_enabled })}
              disabled={!isAdmin}
            />
          }
        />
        <SettingsControlItem
          title={t("intake_settings.responsibility.assignment_mode.title")}
          description={t("intake_settings.responsibility.assignment_mode.description")}
          control={
            <CustomSelect
              value={form.assignment_mode}
              label={
                form.assignment_mode === "fixed_owner"
                  ? t("intake_settings.responsibility.assignment_mode.fixed_owner")
                  : t("intake_settings.responsibility.assignment_mode.round_robin")
              }
              onChange={(val: "fixed_owner" | "round_robin") => persist({ assignment_mode: val })}
              disabled={!isAdmin}
              input
            >
              <CustomSelect.Option value="fixed_owner">
                {t("intake_settings.responsibility.assignment_mode.fixed_owner")}
              </CustomSelect.Option>
              <CustomSelect.Option value="round_robin">
                {t("intake_settings.responsibility.assignment_mode.round_robin")}
              </CustomSelect.Option>
            </CustomSelect>
          }
        />
        {form.assignment_mode === "fixed_owner" ? (
          <SettingsControlItem
            title={t("intake_settings.responsibility.assignment_mode.fixed_owner")}
            description={t("intake_settings.responsibility.fixed_owner.description")}
            control={
              <MemberDropdown
                projectId={projectId}
                multiple={false}
                value={form.fixed_owner}
                onChange={(val) => persist({ fixed_owner: val })}
                buttonVariant="border-with-text"
                disabled={!isAdmin}
                placeholder={t("intake_settings.responsibility.choose_member")}
              />
            }
          />
        ) : (
          <div className="flex flex-col gap-3 py-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <h4 className="text-body-sm-medium text-primary">
                  {t("intake_settings.responsibility.rotation.members_heading")}
                </h4>
                <p className="text-caption-md-regular text-secondary">
                  {t("intake_settings.responsibility.rotation.members_description")}
                </p>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <MemberDropdown
                    projectId={projectId}
                    memberIds={addableMemberIds}
                    multiple={false}
                    value={addMemberId}
                    onChange={setAddMemberId}
                    buttonVariant="border-with-text"
                    placeholder={t("intake_settings.responsibility.choose_member")}
                  />
                  <Button variant="neutral-primary" size="sm" onClick={handleAddMember} disabled={!addMemberId}>
                    {t("add")}
                  </Button>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              {(rotationMembers ?? []).map((rotationMember, index) => (
                <div
                  key={rotationMember.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-subtle px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Avatar
                      name={rotationMember.member_detail.display_name}
                      src={getFileURL(rotationMember.member_detail.avatar_url ?? "")}
                    />
                    <span className="text-13">{rotationMember.member_detail.display_name}</span>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => handleReorder(index, -1)}
                        className="rounded-sm p-1 hover:bg-layer-1 disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={index === (rotationMembers ?? []).length - 1}
                        onClick={() => handleReorder(index, 1)}
                        className="rounded-sm p-1 hover:bg-layer-1 disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(rotationMember.id)}
                        className="rounded-sm p-1 hover:bg-layer-1"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {(rotationMembers ?? []).length === 0 && (
                <p className="text-13 text-tertiary">{t("intake_settings.responsibility.rotation.no_members")}</p>
              )}
            </div>
          </div>
        )}
        <SettingsControlItem
          title={t("intake_settings.responsibility.escalation.title")}
          description={t("intake_settings.responsibility.escalation.description")}
          control={
            <Input
              type="number"
              min={5}
              max={1440}
              inputSize="sm"
              className="w-24"
              value={form.escalation_timeout_minutes}
              disabled={!isAdmin}
              onChange={(e) => setForm({ ...form, escalation_timeout_minutes: Number(e.target.value) })}
              onBlur={() => persist({ escalation_timeout_minutes: form.escalation_timeout_minutes })}
            />
          }
        />
      </div>
    </section>
  );
});
