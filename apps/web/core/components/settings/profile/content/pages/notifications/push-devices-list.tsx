/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Globe2, Smartphone } from "lucide-react";
import useSWR, { mutate } from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPushDeviceType, TPushNotificationSubscription } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { calculateTimeAgo, renderFormattedDate } from "@plane/utils";
// services
import { PushNotificationService } from "@/services/push-notification.service";

const pushNotificationService = new PushNotificationService();

export const PUSH_SUBSCRIPTIONS_SWR_KEY = "CURRENT_USER_PUSH_SUBSCRIPTIONS";

const DEVICE_TYPE_ICON: Record<TPushDeviceType, typeof Globe2> = {
  WEB: Globe2,
  ANDROID: Smartphone,
  IOS: Smartphone,
};

/**
 * Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
 * plane-selfhost), feature 3, exigence 12 - "manage my devices" list.
 * Shown regardless of the user's own `push_enabled` master switch (unlike
 * the per-event toggles/quiet hours, which are nested under it) so a
 * user can still revoke a lost/stale device even after turning push off
 * for themselves - see this feature's own frontend report for the
 * rationale. No mobx store, same "no cross-cutting consumer elsewhere"
 * rationale as `AgentTokensModal`'s own token list.
 */
export function PushDevicesList() {
  const { t } = useTranslation();
  const [revokeTarget, setRevokeTarget] = useState<TPushNotificationSubscription | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const { data: subscriptions, isLoading } = useSWR(PUSH_SUBSCRIPTIONS_SWR_KEY, () =>
    pushNotificationService.listSubscriptions()
  );

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setIsRevoking(true);
    try {
      await pushNotificationService.revokeSubscription(revokeTarget.id);
      setRevokeTarget(null);
      mutate(PUSH_SUBSCRIPTIONS_SWR_KEY);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("success"), message: t("push_device_revoked_successfully") });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t("push_device_revoke_failed") });
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 pt-4">
      <div>
        <h5 className="text-14 font-medium text-primary">{t("push_devices_heading")}</h5>
        <p className="text-13 text-tertiary">{t("push_devices_description")}</p>
      </div>

      {isLoading && (
        <Loader className="flex flex-col gap-2">
          <Loader.Item height="44px" />
        </Loader>
      )}

      {!isLoading && (subscriptions?.length ?? 0) === 0 && (
        <p className="text-13 text-tertiary">{t("push_devices_empty")}</p>
      )}

      <div className="flex flex-col gap-2">
        {subscriptions?.map((subscription) => {
          const DeviceIcon = DEVICE_TYPE_ICON[subscription.device_type];
          return (
            <div
              key={subscription.id}
              className="flex items-center justify-between gap-3 rounded-md border border-subtle px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <DeviceIcon className="size-4 shrink-0 text-tertiary" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-13 font-medium text-primary">
                    {subscription.user_agent || subscription.device_type}
                  </span>
                  <span className="text-11 text-tertiary">
                    {t("push_device_last_used")}{" "}
                    {subscription.last_used_at
                      ? calculateTimeAgo(subscription.last_used_at)
                      : t("push_device_last_used_never")}
                    {" - "}
                    {renderFormattedDate(subscription.created_at)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRevokeTarget(subscription)}
                className="shrink-0 text-13 font-medium text-danger-primary hover:underline"
              >
                {t("push_device_revoke")}
              </button>
            </div>
          );
        })}
      </div>

      <AlertModalCore
        isOpen={!!revokeTarget}
        handleClose={() => setRevokeTarget(null)}
        handleSubmit={handleRevoke}
        isSubmitting={isRevoking}
        title={t("push_device_revoke")}
        content={`${t("push_device_revoke_confirm")} (${revokeTarget?.user_agent ?? revokeTarget?.device_type ?? ""})?`}
      />
    </div>
  );
}
