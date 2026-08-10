/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { ShieldAlert, XCircle } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel, PROFILE_SETTINGS_TRACKER_ELEMENTS } from "@plane/constants";
import { Tooltip } from "@plane/propel/tooltip";
import type { IApiToken } from "@plane/types";
import { Button } from "@plane/ui";
import { renderFormattedDate, calculateTimeAgo, renderFormattedTime } from "@plane/utils";
// components
import { DeleteApiTokenModal } from "@/components/api-token/delete-token-modal";
import { RequestRateLimitOverrideModal } from "@/components/api-token/rate-limit-override-modal";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { usePlatformOS } from "@/hooks/use-platform-os";

type Props = {
  token: IApiToken;
};

export const ApiTokenListItem = observer(function ApiTokenListItem(props: Props) {
  const { token } = props;
  // states
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  // hooks
  const { isMobile } = usePlatformOS();
  const { workspaces } = useWorkspace();
  const { allowPermissions } = useUserPermissions();

  // Under-permissive by design: a workspace only counts here once its role
  // has actually been fetched into `workspaceUserInfo` (see
  // `RequestRateLimitOverrideModal`'s own comment on why this account-level
  // page has no ambient workspace context) - this can hide the action for
  // an admin whose admin workspace they simply haven't opened this
  // session, but never wrongly shows it as available.
  const hasAnyKnownAdminWorkspace = Object.values(workspaces ?? {}).some((workspace) =>
    allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE, workspace.slug)
  );

  const isOverridden = Boolean(token.rate_limit_overridden_at);
  const usagePercent =
    token.rate_limit_effective_per_minute > 0
      ? Math.round((token.rate_limit_current_usage_per_minute / token.rate_limit_effective_per_minute) * 100)
      : 0;

  return (
    <>
      <DeleteApiTokenModal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} tokenId={token.id} />
      <RequestRateLimitOverrideModal
        isOpen={overrideModalOpen}
        onClose={() => setOverrideModalOpen(false)}
        token={token}
      />
      <div className="group relative flex flex-col justify-center border-b border-subtle py-3">
        <Tooltip tooltipContent="Delete token" isMobile={isMobile}>
          <button
            onClick={() => setDeleteModalOpen(true)}
            className="absolute right-4 hidden place-items-center group-hover:grid"
            data-ph-element={PROFILE_SETTINGS_TRACKER_ELEMENTS.LIST_ITEM_DELETE_ICON}
          >
            <XCircle className="h-4 w-4 text-danger-primary" />
          </button>
        </Tooltip>
        <div className="flex w-4/5 items-center">
          <h5 className="truncate text-13 font-medium">{token.label}</h5>
          <span
            className={`${
              token.is_active ? "bg-success-subtle text-success-primary" : "bg-layer-1 text-placeholder"
            } ml-2 flex h-4 max-h-fit items-center rounded-xs px-2 text-11 font-medium`}
          >
            {token.is_active ? "Active" : "Expired"}
          </span>
        </div>
        <div className="mt-1 flex w-full flex-col justify-center">
          {token.description.trim() !== "" && (
            <p className="mb-1 max-w-[70%] text-13 break-words">{token.description}</p>
          )}
          <p className="mb-1 text-11 leading-6 text-placeholder">
            {token.is_active
              ? token.expired_at
                ? `Expires ${renderFormattedDate(token.expired_at)} at ${renderFormattedTime(token.expired_at)}`
                : "Never expires"
              : `Expired ${calculateTimeAgo(token.expired_at)}`}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="flex h-4.5 items-center rounded-xs bg-layer-1 px-2 text-11 font-medium text-secondary">
              {token.rate_limit_tier_key}
            </span>
            <Tooltip tooltipContent="Requests used in the current 1-minute window">
              <span className="text-11 text-tertiary">
                {token.rate_limit_current_usage_per_minute}/{token.rate_limit_effective_per_minute} per min (
                {usagePercent}%)
              </span>
            </Tooltip>
            <span className="text-11 text-tertiary">{token.rate_limit_effective_per_hour}/hour</span>
            {isOverridden && (
              <Tooltip
                tooltipContent={token.rate_limit_override_reason || "A workspace admin overrode this token's limit."}
              >
                <span className="flex items-center gap-1 text-11 text-accent-primary">
                  <ShieldAlert className="h-3 w-3" /> Override active
                </span>
              </Tooltip>
            )}
            <Tooltip
              tooltipContent={
                hasAnyKnownAdminWorkspace ? undefined : "Only a Workspace Admin can request a rate limit override."
              }
              disabled={hasAnyKnownAdminWorkspace}
            >
              <span>
                <Button
                  variant="link-neutral"
                  size="sm"
                  className="!h-5 !px-0 !py-0 text-11"
                  disabled={!hasAnyKnownAdminWorkspace}
                  onClick={() => setOverrideModalOpen(true)}
                >
                  Request override
                </Button>
              </span>
            </Tooltip>
          </div>
        </div>
      </div>
    </>
  );
});
