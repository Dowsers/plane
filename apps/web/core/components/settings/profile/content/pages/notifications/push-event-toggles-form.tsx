/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { Controller, useForm } from "react-hook-form";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IUserEmailNotificationSettings } from "@plane/types";
import { ToggleSwitch } from "@plane/ui";
// components
import { SettingsControlItem } from "@/components/settings/control-item";
// services
import { UserService } from "@/services/user.service";

type Props = {
  data: IUserEmailNotificationSettings;
};

const userService = new UserService();

/**
 * Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
 * plane-selfhost), feature 3, exigence 3 - per-event-type push toggles.
 * Field-for-field mirror of `NotificationsProfileSettingsForm`'s email
 * toggles (same titles/descriptions - the event taxonomy is identical,
 * only the channel differs), against the `push_*`-prefixed siblings of
 * the same `PATCH /api/users/me/notification-preferences/` endpoint. A
 * user can freely have e.g. email off / push on for the same event type -
 * these two forms never read or write each other's fields.
 */
export const PushEventTogglesForm = observer(function PushEventTogglesForm(props: Props) {
  const { data } = props;
  const { t } = useTranslation();
  const { control, reset } = useForm<IUserEmailNotificationSettings>({
    defaultValues: { ...data },
  });

  const handleSettingChange = async (key: keyof IUserEmailNotificationSettings, value: boolean) => {
    try {
      await userService.updateCurrentUserEmailNotificationSettings({ [key]: value });
      setToast({ title: t("success"), type: TOAST_TYPE.SUCCESS, message: t("push_setting_updated_successfully") });
    } catch (_error) {
      setToast({ title: t("error"), type: TOAST_TYPE.ERROR, message: t("push_setting_update_failed") });
    }
  };

  useEffect(() => {
    reset(data);
  }, [reset, data]);

  return (
    <div className="flex flex-col gap-y-1">
      <SettingsControlItem
        title={t("property_changes")}
        description={t("property_changes_description")}
        control={
          <Controller
            control={control}
            name="push_property_change"
            render={({ field: { value, onChange } }) => (
              <ToggleSwitch
                value={value}
                onChange={(newValue) => {
                  onChange(newValue);
                  handleSettingChange("push_property_change", newValue);
                }}
                size="sm"
              />
            )}
          />
        }
      />
      <SettingsControlItem
        title={t("state_change")}
        description={t("state_change_description")}
        control={
          <Controller
            control={control}
            name="push_state_change"
            render={({ field: { value, onChange } }) => (
              <ToggleSwitch
                value={value}
                onChange={(newValue) => {
                  onChange(newValue);
                  handleSettingChange("push_state_change", newValue);
                }}
                size="sm"
              />
            )}
          />
        }
      />
      <div className="border-l-3 border-subtle-1 pl-3">
        <SettingsControlItem
          title={t("issue_completed")}
          description={t("issue_completed_description")}
          control={
            <Controller
              control={control}
              name="push_issue_completed"
              render={({ field: { value, onChange } }) => (
                <ToggleSwitch
                  value={value}
                  onChange={(newValue) => {
                    onChange(newValue);
                    handleSettingChange("push_issue_completed", newValue);
                  }}
                  size="sm"
                />
              )}
            />
          }
        />
      </div>
      <SettingsControlItem
        title={t("comments")}
        description={t("comments_description")}
        control={
          <Controller
            control={control}
            name="push_comment"
            render={({ field: { value, onChange } }) => (
              <ToggleSwitch
                value={value}
                onChange={(newValue) => {
                  onChange(newValue);
                  handleSettingChange("push_comment", newValue);
                }}
                size="sm"
              />
            )}
          />
        }
      />
      <SettingsControlItem
        title={t("mentions")}
        description={t("mentions_description")}
        control={
          <Controller
            control={control}
            name="push_mention"
            render={({ field: { value, onChange } }) => (
              <ToggleSwitch
                value={value}
                onChange={(newValue) => {
                  onChange(newValue);
                  handleSettingChange("push_mention", newValue);
                }}
                size="sm"
              />
            )}
          />
        }
      />
    </div>
  );
});
