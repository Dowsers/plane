/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { NewTabIcon, EditIcon, TrashIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { getIconForLink, copyTextToClipboard, calculateTimeAgo, isWorkspaceAgentActor } from "@plane/utils";
// components
import { AgentBadge } from "@/components/common/agent-badge";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
import { usePlatformOS } from "@/hooks/use-platform-os";
// types
import type { TLinkOperationsModal } from "./create-update-link-modal";

export type TIssueLinkDetail = {
  linkId: string;
  linkOperations: TLinkOperationsModal;
  isNotAllowed: boolean;
};

export function IssueLinkDetail(props: TIssueLinkDetail) {
  // props
  const { linkId, linkOperations, isNotAllowed } = props;
  // hooks
  const {
    toggleIssueLinkModal: toggleIssueLinkModalStore,
    link: { getLinkById },
    setIssueLinkData,
  } = useIssueDetail();
  const { getUserDetails } = useMember();
  const { isMobile } = usePlatformOS();
  const linkDetail = getLinkById(linkId);
  if (!linkDetail) return <></>;

  const Icon = getIconForLink(linkDetail.url);

  const toggleIssueLinkModal = (modalToggle: boolean) => {
    toggleIssueLinkModalStore(modalToggle);
    setIssueLinkData(linkDetail);
  };

  const createdByDetails = getUserDetails(linkDetail.created_by_id);

  return (
    <div key={linkId}>
      <div className="relative flex flex-col rounded-md bg-surface-2 p-2.5">
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- pre-existing "click row to copy link" convenience affordance; the row's own title/edit/open/delete controls below remain independently keyboard-reachable buttons/links. */}
        <div
          className="flex w-full cursor-pointer items-start justify-between gap-2"
          onClick={() => {
            copyTextToClipboard(linkDetail.url);
            setToast({
              type: TOAST_TYPE.SUCCESS,
              title: "Link copied!",
              message: "Link copied to clipboard",
            });
          }}
        >
          <div className="flex items-start gap-2 truncate">
            <span className="py-1">
              <Icon className="size-3 flex-shrink-0 stroke-2 text-tertiary group-hover:text-primary" />
            </span>
            <Tooltip
              tooltipContent={linkDetail.title && linkDetail.title !== "" ? linkDetail.title : linkDetail.url}
              isMobile={isMobile}
            >
              <span className="truncate text-11">
                {linkDetail.title && linkDetail.title !== "" ? linkDetail.title : linkDetail.url}
              </span>
            </Tooltip>
          </div>

          {!isNotAllowed && (
            <div className="z-[1] flex flex-shrink-0 items-center gap-2">
              <button
                type="button"
                className="flex items-center justify-center p-1 hover:bg-layer-1"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleIssueLinkModal(true);
                }}
              >
                <EditIcon className="h-3 w-3 stroke-[1.5] text-secondary" />
              </button>
              <a
                href={linkDetail.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center p-1 hover:bg-layer-1"
              >
                <NewTabIcon className="h-3 w-3 stroke-[1.5] text-secondary" />
              </a>
              <button
                type="button"
                className="flex items-center justify-center p-1 hover:bg-layer-1"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  linkOperations.remove(linkDetail.id);
                }}
              >
                <TrashIcon className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        <div className="px-5">
          <p className="mt-0.5 stroke-[1.5] text-11 text-tertiary">
            Added {calculateTimeAgo(linkDetail.created_at)}
            <br />
            {createdByDetails && (
              <span className="inline-flex items-center gap-1">
                by{" "}
                {createdByDetails?.is_bot && !isWorkspaceAgentActor(createdByDetails)
                  ? createdByDetails?.first_name + " Bot"
                  : createdByDetails?.display_name}
                {isWorkspaceAgentActor(createdByDetails) && <AgentBadge />}
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
