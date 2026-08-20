/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import { Bot } from "lucide-react";
import { useParams } from "next/navigation";
// plane imports
import type { TAIConversationContextType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
// components
import type { TPowerKCommandConfig } from "@/components/power-k/core/types";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

/**
 * Category 9, feature 3 - "Assistant de chat IA in-app"
 * (docs/feature-specs/09-ai-features.md in plane-selfhost). The chat
 * panel's own entry point - opens `AIChatAssistantModal`
 * (`@/components/ai-chat-assistant`, mounted in
 * `power-k/projects-app-provider.tsx`) via
 * `useCommandPalette().toggleAIChatAssistantModal`.
 *
 * `context_type`/`context_object_id` are auto-derived from wherever the
 * command was triggered (spec's own wording) - work item detail -> "issue",
 * a cycle/module/page detail -> that context type, a project route ->
 * "project", anything else (e.g. the workspace home) -> "workspace" as
 * the fallback. Mirrors `detectContextFromURL`'s own param names
 * (`power-k/core/context-detector.ts`) rather than reusing that function
 * directly, since this needs the resolved OBJECT ID (a real issue UUID via
 * `getIssueIdByIdentifier`, not the human-readable `PROJ-123` identifier
 * in the URL), not just the context TYPE.
 *
 * Deliberately NOT gated on `Workspace.is_ai_assistant_enabled` the way
 * the sibling `AIFeatureToggleRow`-driven features gate their own
 * in-product entry points: unlike `is_ai_triage_enabled`/
 * `is_ai_summary_enabled`, this feature's workspace master switch sits
 * behind an Admin-only endpoint (`WorkspaceAIAssistantConfigEndpoint`),
 * not the generically-readable workspace object, so there is no cheap
 * signal a non-admin member's browser can read to decide whether to show
 * this command. Always visible instead; if the assistant turns out to be
 * disabled for the resolved context, `AIChatAssistantModal` surfaces the
 * backend's own 400 message inline rather than hiding the door entirely -
 * same "fail open, let the backend's own error speak" precedent as
 * `useDuplicateCheck`'s own docstring.
 */
export const usePowerKAIAssistantCommands = (): TPowerKCommandConfig[] => {
  // params
  const { projectId: routeProjectId, workItem: workItemIdentifier, cycleId, moduleId, pageId } = useParams();
  // store hooks
  const { toggleAIChatAssistantModal } = useCommandPalette();
  const {
    issue: { getIssueIdByIdentifier },
  } = useIssueDetail(EIssueServiceType.ISSUES);

  const deriveContext = useCallback((): {
    contextType: TAIConversationContextType;
    contextObjectId: string | null;
  } => {
    if (workItemIdentifier) {
      const issueId = getIssueIdByIdentifier(workItemIdentifier.toString());
      if (issueId) return { contextType: "issue", contextObjectId: issueId };
    }
    if (cycleId) return { contextType: "cycle", contextObjectId: cycleId.toString() };
    if (moduleId) return { contextType: "module", contextObjectId: moduleId.toString() };
    if (pageId) return { contextType: "page", contextObjectId: pageId.toString() };
    if (routeProjectId) return { contextType: "project", contextObjectId: routeProjectId.toString() };
    return { contextType: "workspace", contextObjectId: null };
  }, [workItemIdentifier, cycleId, moduleId, pageId, routeProjectId, getIssueIdByIdentifier]);

  return [
    {
      id: "open_ai_assistant",
      group: "general",
      type: "action",
      i18n_title: "power_k.general_actions.open_ai_assistant",
      icon: Bot,
      action: () => {
        const { contextType, contextObjectId } = deriveContext();
        toggleAIChatAssistantModal({ isOpen: true, contextType, contextObjectId });
      },
      isEnabled: () => true,
      isVisible: () => true,
      closeOnSelect: true,
    },
  ];
};
