/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Bell } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Popover } from "@plane/propel/popover";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TViewSubscriptionWritePayload } from "@plane/types";
import { ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { SettingsControlItem } from "@/components/settings/control-item";
// hooks
import { useViewSubscription } from "@/hooks/store/use-view-subscription";

type Props = {
  workspaceSlug: string;
  viewId: string;
  className?: string;
};

/**
 * Bell icon + popover mounted next to a saved view's existing
 * favorite/duplicate/share icons (view toolbar/header) - lets the current
 * user subscribe to in-app/email notifications for that view and pick which
 * of the 3 independent triggers (item added / completed / cancelled) fire.
 * Only ever rendered for a real saved `IssueView` row - never for the 4
 * default system views (All Issues, Assigned, Created, Subscribed), which
 * have no database row to subscribe to. See
 * docs/feature-specs/04-views-filters.md ("Abonnements/notifications par
 * vue") in plane-selfhost.
 */
export const ViewSubscriptionBell = observer(function ViewSubscriptionBell(props: Props) {
  const { workspaceSlug, viewId, className } = props;
  // i18n
  const { t } = useTranslation();
  // states
  const [isSubmitting, setIsSubmitting] = useState(false);
  // store hooks
  const { getSubscriptionByViewId, fetchSubscription, subscribeToView, updateSubscription, unsubscribeFromView } =
    useViewSubscription();

  const subscription = getSubscriptionByViewId(viewId);

  useEffect(() => {
    if (workspaceSlug && viewId) fetchSubscription(workspaceSlug, viewId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, viewId]);

  const isSubscribed = !!subscription?.is_active;

  const handleError = () =>
    setToast({
      type: TOAST_TYPE.ERROR,
      title: t("common.errors.default.title"),
      message: t("common.errors.default.message"),
    });

  const handleToggleSubscribed = async (value: boolean) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (value) await subscribeToView(workspaceSlug, viewId);
      else await unsubscribeFromView(workspaceSlug, viewId);
    } catch {
      handleError();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleField = async (field: keyof TViewSubscriptionWritePayload, value: boolean) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await updateSubscription(workspaceSlug, viewId, { [field]: value });
    } catch {
      handleError();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Popover>
      <Popover.Button>
        <Tooltip
          tooltipContent={
            isSubscribed ? t("view.subscription.subscribed_tooltip") : t("view.subscription.subscribe_tooltip")
          }
        >
          <div
            className={cn(
              "flex size-[26px] flex-shrink-0 items-center justify-center rounded-sm bg-layer-1/70 text-secondary hover:text-primary",
              className
            )}
          >
            <Bell className={cn("h-3.5 w-3.5", isSubscribed && "fill-accent-primary text-accent-primary")} />
          </div>
        </Tooltip>
      </Popover.Button>
      <Popover.Panel side="bottom" align="end">
        <div className="w-80 space-y-1 rounded-lg border-[0.5px] border-strong bg-surface-1 p-3 shadow-raised-200">
          <SettingsControlItem
            title={t("view.subscription.notify_me_title")}
            description={t("view.subscription.notify_me_description")}
            control={
              <ToggleSwitch value={isSubscribed} onChange={handleToggleSubscribed} disabled={isSubmitting} size="sm" />
            }
          />
          {isSubscribed && (
            <div className="space-y-1 border-t border-subtle pt-1">
              <SettingsControlItem
                title={t("view.subscription.item_added_title")}
                description={t("view.subscription.item_added_description")}
                control={
                  <ToggleSwitch
                    value={subscription?.notify_on_add ?? true}
                    onChange={(value) => handleToggleField("notify_on_add", value)}
                    disabled={isSubmitting}
                    size="sm"
                  />
                }
              />
              <SettingsControlItem
                title={t("view.subscription.item_completed_title")}
                description={t("view.subscription.item_completed_description")}
                control={
                  <ToggleSwitch
                    value={subscription?.notify_on_complete ?? true}
                    onChange={(value) => handleToggleField("notify_on_complete", value)}
                    disabled={isSubmitting}
                    size="sm"
                  />
                }
              />
              <SettingsControlItem
                title={t("view.subscription.item_cancelled_title")}
                description={t("view.subscription.item_cancelled_description")}
                control={
                  <ToggleSwitch
                    value={subscription?.notify_on_cancel ?? true}
                    onChange={(value) => handleToggleField("notify_on_cancel", value)}
                    disabled={isSubmitting}
                    size="sm"
                  />
                }
              />
              <div className="border-t border-subtle pt-1">
                <SettingsControlItem
                  title={t("view.subscription.also_send_by_email_title")}
                  description={t("view.subscription.also_send_by_email_description")}
                  control={
                    <ToggleSwitch
                      value={subscription?.notify_by_email ?? false}
                      onChange={(value) => handleToggleField("notify_by_email", value)}
                      disabled={isSubmitting}
                      size="sm"
                    />
                  }
                />
              </div>
            </div>
          )}
        </div>
      </Popover.Panel>
    </Popover>
  );
});
