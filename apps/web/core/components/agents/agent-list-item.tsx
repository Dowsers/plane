/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Key, MoreHorizontal, Pencil, Power, PowerOff } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
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
  const { t } = useTranslation();
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
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.errors.default.title"),
        message: t("agents.list.errors.status_update_failed"),
      });
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
              {isDisabled ? t("common.disabled") : t("common.active")}
            </span>
          </div>
          <span className="truncate text-11 text-tertiary">
            {agent.project_count}{" "}
            {agent.project_count === 1 ? t("agents.list.project_singular") : t("agents.list.project_plural")} -{" "}
            {t("agents.list.last_seen")}{" "}
            {agent.last_seen_at ? calculateTimeAgo(agent.last_seen_at) : t("agents.list.never")} -{" "}
            {t("agents.list.owner")}: {agent.created_by?.display_name ?? "—"}
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
            <Pencil className="h-3 w-3" /> {t("edit")}
          </CustomMenu.MenuItem>
          <CustomMenu.MenuItem onClick={onManageTokens} className="flex items-center gap-2">
            <Key className="h-3 w-3" /> {t("agents.list.manage_tokens")}
          </CustomMenu.MenuItem>
          {isDisabled ? (
            <CustomMenu.MenuItem onClick={handleToggleStatus} className="flex items-center gap-2">
              <Power className="h-3 w-3" /> {t("agents.list.re_enable")}
            </CustomMenu.MenuItem>
          ) : (
            <CustomMenu.MenuItem
              onClick={() => setDisableModalOpen(true)}
              className="flex items-center gap-2 text-danger-primary"
            >
              <PowerOff className="h-3 w-3" /> {t("agents.list.disable")}
            </CustomMenu.MenuItem>
          )}
        </CustomMenu>
      </div>

      <AlertModalCore
        isOpen={disableModalOpen}
        handleClose={() => setDisableModalOpen(false)}
        handleSubmit={handleToggleStatus}
        isSubmitting={isTogglingStatus}
        title={t("agents.list.disable_modal.title")}
        content={t("agents.list.disable_modal.content", { name: agent.display_name })}
      />
    </div>
  );
}
