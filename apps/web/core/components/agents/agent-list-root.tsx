/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Plus } from "lucide-react";
import useSWR, { mutate } from "swr";
// plane imports
import type { IAgentProfile } from "@plane/types";
import { Button, Loader } from "@plane/ui";
// services
import { AgentService } from "@/services/agent.service";
// local imports
import { AgentFormModal } from "./agent-form-modal";
import { AgentListItem } from "./agent-list-item";
import { AgentTokensModal } from "./agent-tokens-modal";

const agentService = new AgentService();

const AGENTS_KEY = (workspaceSlug: string) => `WORKSPACE_AGENTS_${workspaceSlug}`;

type Props = {
  workspaceSlug: string;
};

/**
 * "Agents" tab of the workspace Members settings screen (spec's own
 * "Parametres d'espace de travail -> Membres : nouvel onglet 'Agents'",
 * docs/feature-specs/09-ai-features.md "7. Type d'acteur agent de premiere
 * classe" in plane-selfhost) - list + create/edit/disable/re-enable +
 * per-agent token management. Structurally mirrors the sibling
 * `SLAPolicyListRoot` (apps/web/core/components/sla-policies/
 * policy-list-root.tsx): plain service calls + SWR, no dedicated mobx
 * store, since `AgentProfile` has no cross-cutting consumer elsewhere in
 * the frontend (the member store only ever needs the underlying bot
 * `User`'s `is_bot`/`bot_type`, already covered by `IUserLite`).
 *
 * The parent settings page already Admin-gates the whole tab (mirrors the
 * backend's own Admin-only-for-every-verb gating on every `agent.py`
 * endpoint) - no additional permission check is duplicated here.
 */
export function AgentListRoot(props: Props) {
  const { workspaceSlug } = props;
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<IAgentProfile | null>(null);
  const [tokensAgent, setTokensAgent] = useState<IAgentProfile | null>(null);

  const { data: agents, isLoading } = useSWR(AGENTS_KEY(workspaceSlug), () => agentService.list(workspaceSlug));

  const refresh = () => mutate(AGENTS_KEY(workspaceSlug));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-12 text-tertiary">
          Distinct, non-human identities (e.g. a self-hosted Claude Code or Cursor runner) that can be assigned work
          items and post progress via their own scoped API token. Agents are always Members - they can never hold the
          Admin role or workspace ownership.
        </p>
        <Button
          variant="primary"
          size="sm"
          prependIcon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => {
            setEditingAgent(null);
            setIsFormOpen(true);
          }}
        >
          New agent
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {isLoading && (
          <Loader className="flex flex-col gap-2">
            <Loader.Item height="64px" />
            <Loader.Item height="64px" />
          </Loader>
        )}
        {!isLoading && (agents?.length ?? 0) === 0 && <p className="text-13 text-tertiary">No agents created yet.</p>}
        {agents?.map((agent) => (
          <AgentListItem
            key={agent.id}
            agent={agent}
            workspaceSlug={workspaceSlug}
            onEdit={() => {
              setEditingAgent(agent);
              setIsFormOpen(true);
            }}
            onManageTokens={() => setTokensAgent(agent)}
            onChanged={refresh}
          />
        ))}
      </div>

      <AgentFormModal
        isOpen={isFormOpen}
        handleClose={() => setIsFormOpen(false)}
        workspaceSlug={workspaceSlug}
        agent={editingAgent}
        onSaved={refresh}
      />

      <AgentTokensModal
        isOpen={!!tokensAgent}
        handleClose={() => setTokensAgent(null)}
        workspaceSlug={workspaceSlug}
        agent={tokensAgent}
      />
    </div>
  );
}
