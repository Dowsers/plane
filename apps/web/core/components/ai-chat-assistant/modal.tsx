/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Bot, X } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TAIConversation } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore, Spinner } from "@plane/ui";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { AIChatService } from "@/services/ai-chat.service";
// local imports
import { AIConversationSidebar } from "./conversation-sidebar";
import { AIChatMessageThread } from "./message-thread";

const aiChatService = new AIChatService();

type Props = {
  workspaceSlug: string;
};

/**
 * Category 9, feature 3 - "Assistant de chat IA in-app"
 * (docs/feature-specs/09-ai-features.md in plane-selfhost). Top-level chat
 * panel modal, opened via the command palette
 * (`power-k/config/ai-assistant-commands.ts`) through
 * `useCommandPalette().aiChatAssistantModal`. Mounted once, workspace-wide,
 * in `power-k/projects-app-provider.tsx` - same convention as
 * `WorkspaceLevelModals`.
 *
 * Every time the modal transitions from closed to open, a fresh
 * conversation is created scoped to whatever context the triggering
 * command derived (spec's own wording: "cree une conversation... dont le
 * contexte est deduit de l'endroit d'ou l'utilisateur l'a declenchee").
 * The left sidebar's own "New chat" button repeats that same action later
 * without needing to reopen the modal; clicking any OLDER conversation in
 * that sidebar just resumes it (no new conversation created).
 *
 * `canPropose` is a coarse, WORKSPACE-level approximation of "propose"
 * mode eligibility (Guest excluded) - see `AIChatMessageThread`'s own
 * docstring for why this is only a UX hint, not the real gate.
 */
export const AIChatAssistantModal = observer(function AIChatAssistantModal(props: Props) {
  const { workspaceSlug } = props;
  const { t } = useTranslation();
  const { aiChatAssistantModal, toggleAIChatAssistantModal } = useCommandPalette();
  const { allowPermissions } = useUserPermissions();

  const [activeConversation, setActiveConversation] = useState<TAIConversation | null>(null);
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
  const [sidebarRefreshToken, setSidebarRefreshToken] = useState(0);
  // Surfaced inline (not just as a toast) since this is the expected,
  // common shape of "the assistant isn't enabled for this context" -
  // see the module docstring for why this can't be gated client-side
  // ahead of time.
  const [createError, setCreateError] = useState<string | null>(null);
  const wasOpenRef = useRef(false);

  const canPropose = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );

  const handleNewChat = async () => {
    setIsCreatingNewChat(true);
    setCreateError(null);
    try {
      const created = await aiChatService.createConversation(workspaceSlug, {
        context_type: aiChatAssistantModal.contextType,
        context_object_id: aiChatAssistantModal.contextObjectId,
      });
      setActiveConversation(created);
      setSidebarRefreshToken((prev) => prev + 1);
    } catch (error: unknown) {
      const err = error as { error?: string };
      const message = err?.error ?? t("ai.chat.create_error");
      setCreateError(message);
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    } finally {
      setIsCreatingNewChat(false);
    }
  };

  const handleSelectConversation = (conversation: TAIConversation) => {
    setCreateError(null);
    setActiveConversation(conversation);
  };

  useEffect(() => {
    if (aiChatAssistantModal.isOpen && !wasOpenRef.current) {
      handleNewChat();
    }
    wasOpenRef.current = aiChatAssistantModal.isOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiChatAssistantModal.isOpen]);

  const handleClose = () => toggleAIChatAssistantModal({ isOpen: false });

  return (
    <ModalCore
      isOpen={aiChatAssistantModal.isOpen}
      handleClose={handleClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.VIXL}
    >
      <div className="flex h-[32rem] max-h-[80vh]">
        <AIConversationSidebar
          workspaceSlug={workspaceSlug}
          activeConversationId={activeConversation?.id ?? null}
          refreshToken={sidebarRefreshToken}
          onSelect={handleSelectConversation}
          onNewChat={handleNewChat}
          isCreatingNewChat={isCreatingNewChat}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-subtle px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-tertiary" />
              <span className="text-14 font-medium text-primary">{t("ai.chat.title")}</span>
            </div>
            <button type="button" onClick={handleClose} className="text-tertiary hover:text-primary">
              <X className="size-4" />
            </button>
          </div>
          {activeConversation ? (
            <AIChatMessageThread
              workspaceSlug={workspaceSlug}
              conversationId={activeConversation.id}
              canPropose={canPropose}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center px-6">
              {isCreatingNewChat ? (
                <Spinner height="24px" width="24px" />
              ) : createError ? (
                <p className="max-w-xs text-center text-13 text-tertiary">{createError}</p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </ModalCore>
  );
});
