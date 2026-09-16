/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
import { Bell } from "lucide-react";
// plane imports
import { IconButton } from "@plane/propel/icon-button";
import { Tooltip } from "@plane/propel/tooltip";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Avatar, AvatarGroup } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { useTranslation } from "@plane/i18n";
// hooks
import { useUser } from "@/hooks/store/user";
// store
import type { TPageInstance } from "@/store/pages/base-page";

type Props = {
  page: TPageInstance;
};

/**
 * Category 10, feature 5 ("Abonnements/notifications par page") - the bell
 * icon in the Page header (exigence 1/2), placed next to lock/move/copy-
 * link/favorite/share (see `PageHeaderActions`, ../header/actions). Works
 * identically for a project-scoped Page and a workspace-scoped Wiki page:
 * both are backed by the same `TPageInstance.isSubscribed`/`subscribers`/
 * `subscribe`/`unsubscribe` (`BasePage`) - `ProjectPage`/`WorkspacePage`
 * each wire the underlying REST call to their own scope's endpoint,
 * exactly like `is_favorite`/`reactions` before it in this same file.
 *
 * No permission gate (unlike `PageFavoriteControl`/`PageLockControl`) -
 * subscribing isn't role-gated server-side beyond "must already be able to
 * read the page" (`PageSubscriptionPermission`), which is already
 * guaranteed by the page having loaded far enough for this header to
 * render at all. Unsubscribing is allowed unconditionally either way
 * (exigence 9).
 *
 * Exigence 12 (subscriber list, "visible to anyone who can read the
 * page") is folded into this same control rather than a separate piece of
 * UI: a small avatar stack immediately to the left of the bell, each
 * avatar's own built-in hover tooltip surfacing the subscriber's name -
 * per this feature's own build brief ("doesn't need to be elaborate").
 */
export const PageSubscribeControl = observer(function PageSubscribeControl({ page }: Props) {
  const { isSubscribed, subscribers, subscribe, unsubscribe } = page;
  // i18n
  const { t } = useTranslation();
  // store hooks
  const { data: currentUser } = useUser();

  const otherSubscribers = useMemo(
    () => subscribers.filter((subscriber) => subscriber.subscriber !== currentUser?.id),
    [subscribers, currentUser?.id]
  );

  const handleToggle = async () => {
    try {
      if (isSubscribed) {
        await unsubscribe();
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("page_subscribe_control.unsubscribed_title"),
          message: t("page_subscribe_control.unsubscribed_message"),
        });
      } else {
        await subscribe();
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("page_subscribe_control.subscribed_title"),
          message: t("page_subscribe_control.subscribed_message"),
        });
      }
    } catch (_error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("page_subscribe_control.error_message"),
      });
    }
  };

  return (
    <div className="flex items-center gap-1">
      {otherSubscribers.length > 0 && (
        <AvatarGroup size="sm" max={3}>
          {otherSubscribers.map((subscriber) => (
            <Avatar
              key={subscriber.id}
              name={subscriber.subscriber_detail?.display_name}
              src={getFileURL(subscriber.subscriber_detail?.avatar_url ?? "")}
            />
          ))}
        </AvatarGroup>
      )}
      <Tooltip
        tooltipContent={isSubscribed ? t("common.actions.unsubscribe") : t("common.actions.subscribe")}
        position="bottom"
      >
        <IconButton
          variant="ghost"
          size="lg"
          icon={Bell}
          onClick={handleToggle}
          aria-label={
            isSubscribed
              ? t("page_subscribe_control.unsubscribe_aria_label")
              : t("page_subscribe_control.subscribe_aria_label")
          }
          className={cn(isSubscribed && "text-accent-primary [&_svg]:fill-current")}
        />
      </Tooltip>
    </div>
  );
});
