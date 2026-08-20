/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { SendHorizonal } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TAIChangeProposal, TAIMessageMode } from "@plane/types";
import { Spinner, TextArea } from "@plane/ui";
import { cn } from "@plane/utils";
// local imports
import { AIChatMessageBubble } from "./message-bubble";
import { useAIConversationThread } from "./use-ai-conversation-thread";

type Props = {
  workspaceSlug: string;
  conversationId: string;
  canPropose: boolean;
};

const MODES: TAIMessageMode[] = ["ask", "propose"];

/**
 * Category 9, feature 3 - "Assistant de chat IA in-app". The main thread
 * panel: message list (polled while the assistant is still generating,
 * see `useAIConversationThread`) plus the ask/propose composer.
 *
 * `canPropose` is a cheap, approximate client-side hint (the caller
 * derives it from the viewer's WORKSPACE role) used only to grey out the
 * "Propose" tab with an explanatory tooltip - the backend's own per-
 * target-object check in `POST .../messages/` is the real gate (a 403
 * there is still shown as an inline/toast error if this approximation
 * ever disagrees, e.g. a workspace Member who is only a Guest on the
 * specific project this conversation is scoped to).
 */
export const AIChatMessageThread = (props: Props) => {
  const { workspaceSlug, conversationId, canPropose } = props;
  const { t } = useTranslation();
  const {
    messages,
    proposals,
    isLoadingThread,
    isSending,
    isAssistantGenerating,
    resolvingProposalId,
    sendMessage,
    resolveProposal,
  } = useAIConversationThread(workspaceSlug, conversationId);

  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<TAIMessageMode>("ask");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, isAssistantGenerating]);

  useEffect(() => {
    if (!canPropose && mode === "propose") setMode("ask");
  }, [canPropose, mode]);

  const proposalsByMessageId = useMemo(() => {
    const map = new Map<string, TAIChangeProposal[]>();
    for (const proposal of proposals) {
      const list = map.get(proposal.message) ?? [];
      list.push(proposal);
      map.set(proposal.message, list);
    }
    return map;
  }, [proposals]);

  const canSend = !isSending && !isAssistantGenerating && draft.trim().length > 0;

  const handleSend = async () => {
    if (!canSend) return;
    const content = draft.trim();
    setDraft("");
    try {
      await sendMessage(content, mode);
    } catch (error: unknown) {
      const err = error as { error?: string; status?: number };
      const message =
        err?.status === 403
          ? t("ai.chat.propose_forbidden")
          : err?.status === 429
            ? t("ai.chat.rate_limited")
            : (err?.error ?? t("ai.chat.send_error"));
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoadingThread ? (
          <div className="flex h-full items-center justify-center">
            <Spinner height="24px" width="24px" />
          </div>
        ) : messages.length === 0 ? (
          <p className="mt-8 text-center text-13 text-tertiary">{t("ai.chat.empty_thread")}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((message) => (
              <AIChatMessageBubble
                key={message.id}
                message={message}
                proposals={proposalsByMessageId.get(message.id) ?? []}
                resolvingProposalId={resolvingProposalId}
                onResolveProposal={resolveProposal}
              />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex flex-col gap-2 border-t border-subtle p-3">
        <div className="flex items-center gap-1">
          {MODES.map((modeOption) => {
            const disabled = modeOption === "propose" && !canPropose;
            const button = (
              <button
                key={modeOption}
                type="button"
                disabled={disabled}
                onClick={() => setMode(modeOption)}
                className={cn(
                  "rounded-full px-3 py-1 text-12 font-medium transition-colors",
                  mode === modeOption ? "bg-accent-primary text-white" : "bg-layer-2 text-secondary",
                  disabled && "cursor-not-allowed opacity-50"
                )}
              >
                {t(`ai.chat.mode.${modeOption}`)}
              </button>
            );
            return disabled ? (
              <Tooltip key={modeOption} tooltipContent={t("ai.chat.propose_disabled_tooltip")} position="top">
                <span>{button}</span>
              </Tooltip>
            ) : (
              button
            );
          })}
        </div>

        <div className="flex items-end gap-2">
          <TextArea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t(
              mode === "propose" ? "ai.chat.composer_placeholder_propose" : "ai.chat.composer_placeholder_ask"
            )}
            textAreaSize="sm"
            className="max-h-32 flex-1"
            disabled={isSending}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-md",
              canSend ? "bg-accent-primary text-white" : "cursor-not-allowed bg-layer-2 text-tertiary"
            )}
          >
            <SendHorizonal className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
