/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TAIConversation } from "@plane/types";
import { Button, Spinner } from "@plane/ui";
import { calculateTimeAgo, cn } from "@plane/utils";
// services
import { AIChatService } from "@/services/ai-chat.service";

const aiChatService = new AIChatService();

type Props = {
  workspaceSlug: string;
  activeConversationId: string | null;
  refreshToken: number;
  onSelect: (conversation: TAIConversation) => void;
  onNewChat: () => void;
  isCreatingNewChat: boolean;
};

const getConversationLabel = (conversation: TAIConversation, t: (key: string) => string): string => {
  if (conversation.title.trim()) return conversation.title;
  return t(`ai.chat.context_type.${conversation.context_type}`);
};

/**
 * Category 9, feature 3 - "Assistant de chat IA in-app". Left column of
 * the chat panel - the requesting user's own recent conversations
 * (`GET .../ai-conversations/` already filters to `created_by=request.user`,
 * see that endpoint's own docstring) plus a "New chat" button that starts
 * a fresh one scoped to wherever the command palette command was
 * triggered from.
 */
export const AIConversationSidebar = (props: Props) => {
  const { workspaceSlug, activeConversationId, refreshToken, onSelect, onNewChat, isCreatingNewChat } = props;
  const { t } = useTranslation();

  const [conversations, setConversations] = useState<TAIConversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    aiChatService
      .listConversations(workspaceSlug)
      .then((response) => {
        if (!cancelled) setConversations(response.results);
        return;
      })
      .catch(() => {
        if (!cancelled) setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("ai.toast.error") });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, refreshToken]);

  return (
    <div className="flex h-full w-56 shrink-0 flex-col border-r border-subtle">
      <div className="p-2">
        <Button
          variant="neutral-primary"
          size="sm"
          className="w-full"
          prependIcon={<Plus className="size-3.5" />}
          onClick={onNewChat}
          loading={isCreatingNewChat}
        >
          {t("ai.chat.new_chat")}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Spinner height="18px" width="18px" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-2 py-3 text-center text-12 text-tertiary">{t("ai.chat.no_conversations")}</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors",
                  conversation.id === activeConversationId ? "bg-layer-2" : "hover:bg-layer-1"
                )}
              >
                <span className="w-full truncate text-13 text-primary">{getConversationLabel(conversation, t)}</span>
                <span className="text-11 text-tertiary">{calculateTimeAgo(conversation.created_at)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
