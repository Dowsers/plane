/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { mutate } from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IUserEmailNotificationSettings } from "@plane/types";
import { ToggleSwitch } from "@plane/ui";
// components
import { SettingsControlItem } from "@/components/settings/control-item";
// hooks
import { useInstance } from "@/hooks/store/use-instance";
// lib
import { isPushNotificationSupported, subscribeToWebPush } from "@/lib/push-notifications";
// services
import { PushNotificationService } from "@/services/push-notification.service";
import { UserService } from "@/services/user.service";
// local imports
import { PUSH_SUBSCRIPTIONS_SWR_KEY, PushDevicesList } from "./push-devices-list";
import { PushEventTogglesForm } from "./push-event-toggles-form";
import { PushQuietHoursForm } from "./push-quiet-hours-form";

type Props = {
  data: IUserEmailNotificationSettings;
};

const userService = new UserService();
const pushNotificationService = new PushNotificationService();

/**
 * Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
 * plane-selfhost), feature 3 ("Notifications push en self-hosted") - the
 * Profile > Notifications "Push" section: master switch (this component),
 * per-event toggles + quiet hours (nested underneath, only once push is
 * on - mirrors `DigestPreferencesPanel`'s own `form.is_enabled && (...)`
 * precedent for a closely-coupled group of sub-preferences), and the
 * "Connected devices" list (exigence 12 - always shown, independent of
 * the master switch, so a lost/stale device can still be revoked after
 * turning push off).
 *
 * Graceful degradation (exigence 4's sibling requirement, this
 * initiative's own explicit ask): if the instance hasn't configured push
 * at all (`config.is_push_notifications_enabled` false, or no
 * `config.vapid_public_key` yet - e.g. an admin turned the kill switch on
 * before ever generating/entering a VAPID key), this renders a single
 * inert notice and nothing else - no toggle that would silently fail
 * against a non-functional backend.
 */
export const PushNotificationSection = observer(function PushNotificationSection(props: Props) {
  const { data } = props;
  const { t } = useTranslation();
  const { config } = useInstance();

  const [pushEnabled, setPushEnabled] = useState(data.push_enabled);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [permissionNotice, setPermissionNotice] = useState(false);

  const vapidPublicKey = config?.vapid_public_key;
  const isInstancePushAvailable = Boolean(config?.is_push_notifications_enabled && vapidPublicKey);

  const handleEnable = async () => {
    if (!vapidPublicKey) return;
    setIsSubmitting(true);
    setPermissionNotice(false);
    try {
      const result = await subscribeToWebPush(vapidPublicKey);
      if (result.status === "unsupported") {
        setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t("push_unsupported_description") });
        return;
      }
      if (result.status === "permission-denied") {
        setPermissionNotice(true);
        return;
      }
      if (result.status === "error") {
        setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t("push_enable_failed") });
        return;
      }

      await pushNotificationService.createSubscription(result.payload);
      await userService.updateCurrentUserEmailNotificationSettings({ push_enabled: true });
      mutate(PUSH_SUBSCRIPTIONS_SWR_KEY);
      setPushEnabled(true);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("success"), message: t("push_enabled_successfully") });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t("push_enable_failed") });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisable = async () => {
    setIsSubmitting(true);
    try {
      await userService.updateCurrentUserEmailNotificationSettings({ push_enabled: false });
      setPushEnabled(false);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("success"), message: t("push_disabled_successfully") });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t("push_disable_failed") });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = (value: boolean) => {
    if (value) handleEnable();
    else handleDisable();
  };

  return (
    <div className="mt-7 flex flex-col gap-1 border-t border-subtle pt-7">
      <h5 className="text-14 font-medium text-primary">{t("push_notifications_heading")}</h5>
      <p className="pb-2 text-13 text-tertiary">{t("push_notifications_description")}</p>

      {!isInstancePushAvailable ? (
        <p className="rounded-md bg-layer-1 px-3 py-2 text-13 text-tertiary">{t("push_not_configured_description")}</p>
      ) : !isPushNotificationSupported() ? (
        <p className="rounded-md bg-layer-1 px-3 py-2 text-13 text-tertiary">{t("push_unsupported_description")}</p>
      ) : (
        <>
          <SettingsControlItem
            title={t("push_enable_label")}
            description={t("push_enable_description")}
            control={<ToggleSwitch value={pushEnabled} onChange={handleToggle} size="sm" disabled={isSubmitting} />}
          />

          {permissionNotice && (
            <p className="rounded-md bg-danger-subtle px-3 py-2 text-13 text-danger-primary">
              {t("push_permission_denied_message")}
            </p>
          )}

          {pushEnabled && (
            <div className="divide-y divide-subtle pt-2">
              <PushEventTogglesForm data={data} />
              <PushQuietHoursForm data={data} />
            </div>
          )}

          <PushDevicesList />
        </>
      )}
    </div>
  );
});
