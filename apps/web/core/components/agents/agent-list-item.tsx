/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Key, MoreHorizontal, Pencil, Power, PowerOff } from "lucide-react";
// plane imports
import { IconButton } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IAgentProfile } from "@plane/types";
import { AlertModalCore, Avatar, CustomMenu } from "@plane/ui";
import { calculateTimeAgo, getFileURL } from "@plane/utils";
// components
import { AgentBadge } from "@/components/common/agent-badge";
// services
import { AgentService } from "@/services/agent.service";
// local imports
import { AGENT_TYPE_LABELS } from "./constants";

const agentService = new AgentService();

type Props = {
  agent: IAgentProfile;
  workspaceSlug: string;
  onEdit: () => void;
  onManageTokens: () => void;
  onChanged: () => void;
};

export function AgentListItem(props: Props) {
  const { agent, workspaceSlug, onEdit, onManageTokens, onChanged } = props;
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [disableModalOpen, setDisableModalOpen] = useState(false);

  const isDisabled = agent.status === "DISABLED";

  const handleToggleStatus = async () => {
    setIsTogglingStatus(true);
    try {
      if (isDisabled) {
        await agentService.update(workspaceSlug, agent.id, { status: "ACTIVE" });
      } else {
        // Disabling goes through the dedicated soft-disable endpoint
        // (exigence 9) - immediately revokes every active token.
        await agentService.disable(workspaceSlug, agent.id);
      }
      onChanged();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Unable to update this agent's status." });
    } finally {
      setIsTogglingStatus(false);
      setDisableModalOpen(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-subtle px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={agent.display_name} src={getFileURL(agent.avatar_url)} size="md" />
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-13 font-medium text-primary">{agent.display_name}</span>
            <AgentBadge />
            <span className="shrink-0 rounded-xs bg-surface-2 px-1.5 py-0.5 text-11 text-tertiary">
              {AGENT_TYPE_LABELS[agent.agent_type]}
            </span>
            <span
              className={`shrink-0 rounded-xs px-1.5 py-0.5 text-11 font-medium ${
                isDisabled ? "bg-layer-1 text-placeholder" : "bg-success-subtle text-success-primary"
              }`}
            >
              {isDisabled ? "Disabled" : "Active"}
            </span>
          </div>
          <span className="truncate text-11 text-tertiary">
            {agent.project_count} project{agent.project_count === 1 ? "" : "s"} - Last seen{" "}
            {agent.last_seen_at ? calculateTimeAgo(agent.last_seen_at) : "Never"} - Owner:{" "}
            {agent.created_by?.display_name ?? "—"}
          </span>
          {agent.description && <span className="mt-0.5 truncate text-11 text-tertiary">{agent.description}</span>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <CustomMenu
          customButton={<IconButton variant="tertiary" size="sm" icon={MoreHorizontal} />}
          placement="bottom-end"
          closeOnSelect
        >
          <CustomMenu.MenuItem onClick={onEdit} className="flex items-center gap-2">
            <Pencil className="h-3 w-3" /> Edit
          </CustomMenu.MenuItem>
          <CustomMenu.MenuItem onClick={onManageTokens} className="flex items-center gap-2">
            <Key className="h-3 w-3" /> Manage tokens
          </CustomMenu.MenuItem>
          {isDisabled ? (
            <CustomMenu.MenuItem onClick={handleToggleStatus} className="flex items-center gap-2">
              <Power className="h-3 w-3" /> Re-enable
            </CustomMenu.MenuItem>
          ) : (
            <CustomMenu.MenuItem
              onClick={() => setDisableModalOpen(true)}
              className="flex items-center gap-2 text-danger-primary"
            >
              <PowerOff className="h-3 w-3" /> Disable
            </CustomMenu.MenuItem>
          )}
        </CustomMenu>
      </div>

      <AlertModalCore
        isOpen={disableModalOpen}
        handleClose={() => setDisableModalOpen(false)}
        handleSubmit={handleToggleStatus}
        isSubmitting={isTogglingStatus}
        title="Disable agent"
        content={`Are you sure you want to disable "${agent.display_name}"? This immediately revokes every active token for this agent. Its past comments and activity history are kept.`}
      />
    </div>
  );
}
