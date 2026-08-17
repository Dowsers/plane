/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { X } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IAgentProfile, TAgentType } from "@plane/types";
import { Button, CustomSelect, EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
// services
import { AgentService } from "@/services/agent.service";
// local imports
import { AGENT_TYPE_OPTIONS } from "./constants";

const agentService = new AgentService();

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  /** `null` for create, a profile for edit. Edit never touches `status` -
   * that's the list item's own toggle action, kept out of this form. */
  agent: IAgentProfile | null;
  onSaved: () => void;
};

const defaultState = () => ({
  displayName: "",
  agentType: "generic" as TAgentType,
  description: "",
});

/**
 * Create/edit modal for a single workspace agent - deliberately has NO
 * role field (exigence 1/2/6, docs/feature-specs/09-ai-features.md "7.
 * Type d'acteur agent de premiere classe" in plane-selfhost): an agent is
 * always created as workspace Member, the backend
 * (`AgentProfileViewSet.create`/`partial_update`,
 * apps/api/plane/app/views/agent.py) never reads a `role` key off the
 * request body at all, so there is nothing here that could ever grant one.
 */
export function AgentFormModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, agent, onSaved } = props;
  const [state, setState] = useState(defaultState());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (agent) {
      setState({
        displayName: agent.display_name,
        agentType: agent.agent_type,
        description: agent.description,
      });
    } else {
      setState(defaultState());
    }
  }, [agent, isOpen]);

  const handleSave = async () => {
    if (!state.displayName.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Display name is required." });
      return;
    }

    setIsSaving(true);
    try {
      if (agent) {
        await agentService.update(workspaceSlug, agent.id, {
          display_name: state.displayName.trim(),
          agent_type: state.agentType,
          description: state.description.trim(),
        });
      } else {
        await agentService.create(workspaceSlug, {
          display_name: state.displayName.trim(),
          agent_type: state.agentType,
          description: state.description.trim(),
        });
      }
      onSaved();
      handleClose();
    } catch (error: unknown) {
      const message = (error as { error?: string })?.error ?? "Unable to save the agent.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    } finally {
      setIsSaving(false);
    }
  };

  const selectedAgentTypeLabel = AGENT_TYPE_OPTIONS.find((option) => option.value === state.agentType)?.label;

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <h4 className="text-18 font-medium text-primary">{agent ? "Edit agent" : "New agent"}</h4>
          <button onClick={handleClose} type="button">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-13 font-medium text-secondary">Display name</span>
          <Input
            type="text"
            placeholder="e.g. Claude Code runner"
            value={state.displayName}
            onChange={(event) => setState((prev) => ({ ...prev, displayName: event.target.value }))}
            inputSize="sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-13 font-medium text-secondary">Agent type</span>
          <CustomSelect
            value={state.agentType}
            label={selectedAgentTypeLabel}
            onChange={(value: TAgentType) => setState((prev) => ({ ...prev, agentType: value }))}
            input
          >
            {AGENT_TYPE_OPTIONS.map((option) => (
              <CustomSelect.Option key={option.value} value={option.value}>
                {option.label}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-13 font-medium text-secondary">Description (optional)</span>
          <TextArea
            placeholder="What does this agent do?"
            value={state.description}
            onChange={(event) => setState((prev) => ({ ...prev, description: event.target.value }))}
            textAreaSize="sm"
            className="min-h-[70px] w-full"
          />
        </div>

        <p className="text-11 text-tertiary">
          Agents are always created as workspace Members and can never be granted Admin or workspace ownership.
        </p>

        <div className="flex items-center justify-end gap-2 border-t border-subtle pt-4">
          <Button variant="neutral-primary" size="sm" onClick={handleClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={isSaving}>
            {agent ? "Save changes" : "Create agent"}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
