/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
import { Loader } from "@plane/ui";
// components
import { PageWrapper } from "@/components/common/page-wrapper";
// hooks
import { useInstance } from "@/hooks/store";
// types
import type { Route } from "./+types/page";
// local
import { InstancePushNotificationForm } from "./push-notification-form";

/**
 * Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
 * plane-selfhost), feature 3 ("Notifications push en self-hosted") -
 * god-mode Settings > Notifications: VAPID (Web Push) configuration, the
 * instance-wide kill switch, and a "send test notification" action.
 *
 * FCM/APNs credential fields are deliberately NOT surfaced here - the
 * backend's own `push_notification_task._send_fcm_push`/`_send_apns_push`
 * are labeled stubs (categories 12 features 1/2/5, the mobile app itself,
 * were confirmed as total fabrication - no real mobile client exists
 * anywhere in this fork to ever hold an FCM/APNs token), so exposing
 * config fields for a send path that can never fire from this fork would
 * be a UI for dead code. Web Push (VAPID) is the only reachable channel
 * today.
 */
const InstanceNotificationsPage = observer(function InstanceNotificationsPage(_props: Route.ComponentProps) {
  // store
  const { fetchInstanceConfigurations, formattedConfig } = useInstance();

  const { isLoading } = useSWR("INSTANCE_CONFIGURATIONS", () => fetchInstanceConfigurations());

  return (
    <PageWrapper
      header={{
        title: "Push notifications",
        description:
          "Configure Web Push for this instance so members can get notified (mention, assignment, state change, comment) even when Plane isn't open in a browser tab.",
      }}
    >
      {formattedConfig && !isLoading ? (
        <InstancePushNotificationForm config={formattedConfig} />
      ) : (
        <Loader className="space-y-8">
          <Loader.Item height="50px" width="40%" />
          <div className="grid w-2/3 grid-cols-2 gap-x-8 gap-y-4">
            <Loader.Item height="50px" />
            <Loader.Item height="50px" />
          </div>
          <Loader.Item height="50px" width="20%" />
        </Loader>
      )}
    </PageWrapper>
  );
});

export const meta: Route.MetaFunction = () => [{ title: "Push Notifications - God Mode" }];

export default InstanceNotificationsPage;
