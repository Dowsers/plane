/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IUserEmailNotificationSettings } from "@plane/types";
import { Input, ToggleSwitch } from "@plane/ui";
// components
import { TimezoneSelect } from "@/components/global";
import { SettingsControlItem } from "@/components/settings/control-item";
// hooks
import { useUser } from "@/hooks/store/user";
// services
import { UserService } from "@/services/user.service";

type Props = {
  data: IUserEmailNotificationSettings;
};

const userService = new UserService();

const DEFAULT_START = "20:00:00";
const DEFAULT_END = "08:00:00";

/**
 * Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
 * plane-selfhost), feature 3, exigence 2/4 - quiet hours. The
 * `<input type="time">` control mirrors this exact app's own
 * `DigestPreferencesPanel` "time of day" field (`time_of_day.slice(0,5)`
 * in / `${value}:00` out) - the same `"HH:MM:SS"` DRF `TimeField` shape.
 *
 * There is deliberately no separate "timezone" field on this form -
 * `UserNotificationPreference.quiet_hours_*` reuses the user's existing
 * `user_timezone` (see that model's own doc comment) rather than
 * duplicating it, so this renders the exact same `TimezoneSelect` control
 * Profile > Preferences already uses, writing straight to
 * `PATCH /api/users/me/` - not a new, parallel timezone field.
 */
export const PushQuietHoursForm = observer(function PushQuietHoursForm(props: Props) {
  const { data } = props;
  const { t } = useTranslation();
  const { data: user, updateCurrentUser } = useUser();

  const [enabled, setEnabled] = useState(data.quiet_hours_enabled);
  const [start, setStart] = useState(data.quiet_hours_start ?? DEFAULT_START);
  const [end, setEnd] = useState(data.quiet_hours_end ?? DEFAULT_END);

  useEffect(() => {
    setEnabled(data.quiet_hours_enabled);
    setStart(data.quiet_hours_start ?? DEFAULT_START);
    setEnd(data.quiet_hours_end ?? DEFAULT_END);
  }, [data]);

  const persist = async (patch: Partial<IUserEmailNotificationSettings>) => {
    try {
      await userService.updateCurrentUserEmailNotificationSettings(patch);
      setToast({ title: t("success"), type: TOAST_TYPE.SUCCESS, message: t("push_quiet_hours_updated_successfully") });
    } catch (_error) {
      setToast({ title: t("error"), type: TOAST_TYPE.ERROR, message: t("push_quiet_hours_update_failed") });
      // revert optimistic local state on failure
      setEnabled(data.quiet_hours_enabled);
      setStart(data.quiet_hours_start ?? DEFAULT_START);
      setEnd(data.quiet_hours_end ?? DEFAULT_END);
    }
  };

  const handleToggle = (value: boolean) => {
    setEnabled(value);
    persist({ quiet_hours_enabled: value, quiet_hours_start: start, quiet_hours_end: end });
  };

  const handleStartChange = (value: string) => {
    const next = `${value}:00`;
    setStart(next);
    if (enabled) persist({ quiet_hours_start: next });
  };

  const handleEndChange = (value: string) => {
    const next = `${value}:00`;
    setEnd(next);
    if (enabled) persist({ quiet_hours_end: next });
  };

  const handleTimezoneChange = async (value: string) => {
    try {
      await updateCurrentUser({ user_timezone: value });
      setToast({ title: t("success"), type: TOAST_TYPE.SUCCESS, message: t("push_quiet_hours_updated_successfully") });
    } catch (_error) {
      setToast({ title: t("error"), type: TOAST_TYPE.ERROR, message: t("push_quiet_hours_update_failed") });
    }
  };

  return (
    <div className="flex flex-col gap-1 pt-4">
      <div>
        <h5 className="text-14 font-medium text-primary">{t("push_quiet_hours_heading")}</h5>
        <p className="text-13 text-tertiary">{t("push_quiet_hours_description")}</p>
      </div>

      <SettingsControlItem
        title={t("push_quiet_hours_enabled_label")}
        description=""
        control={<ToggleSwitch value={enabled} onChange={handleToggle} size="sm" />}
      />

      {enabled && (
        <>
          <SettingsControlItem
            title={t("push_quiet_hours_start_label")}
            description=""
            control={
              <Input
                type="time"
                inputSize="sm"
                className="w-32"
                value={start.slice(0, 5)}
                onChange={(e) => handleStartChange(e.target.value)}
              />
            }
          />
          <SettingsControlItem
            title={t("push_quiet_hours_end_label")}
            description=""
            control={
              <Input
                type="time"
                inputSize="sm"
                className="w-32"
                value={end.slice(0, 5)}
                onChange={(e) => handleEndChange(e.target.value)}
              />
            }
          />
          <SettingsControlItem
            title={t("push_quiet_hours_timezone_label")}
            description=""
            control={<TimezoneSelect value={user?.user_timezone || "Asia/Kolkata"} onChange={handleTimezoneChange} />}
          />
        </>
      )}
    </div>
  );
});
