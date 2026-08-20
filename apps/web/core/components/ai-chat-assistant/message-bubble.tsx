/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Bot } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TAIChangeProposal, TAIMessage } from "@plane/types";
import { cn } from "@plane/utils";
// local imports
import { AIChangeProposalCard } from "./proposal-card";

type Props = {
  message: TAIMessage;
  proposals: TAIChangeProposal[];
  resolvingProposalId: string | null;
  onResolveProposal: (proposalId: string, action: "approve" | "reject") => Promise<unknown>;
};

/**
 * One message bubble in the chat panel (category 9, feature 3). `role`
 * drives alignment/styling - `user` is always the conversation's own
 * creator (this backend only ever returns a caller's own conversations,
 * see `AIConversationListCreateEndpoint.get`'s own docstring), so no
 * avatar/display-name lookup is needed for it.
 *
 * A `failed` message shows `error_message` instead of a blank bubble
 * (never silently empty). A `pending`/`streaming` assistant message with
 * no content yet renders the shared "generating" indicator instead of an
 * empty bubble.
 */
export const AIChatMessageBubble = (props: Props) => {
  const { message, proposals, resolvingProposalId, onResolveProposal } = props;
  const { t } = useTranslation();

  if (message.role === "system") {
    return <p className="mx-auto max-w-[85%] text-center text-12 text-tertiary">{message.content}</p>;
  }

  const isUser = message.role === "user";
  const isGenerating = message.role === "assistant" && (message.status === "pending" || message.status === "streaming");
  const isFailed = message.status === "failed";

  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      {!isUser && (
        <div className="flex items-center gap-1.5 px-1 text-12 text-tertiary">
          <Bot className="size-3.5" />
          <span>{t("ai.chat.assistant_label")}</span>
        </div>
      )}
      <div
        className={cn("max-w-[85%] rounded-lg px-3 py-2 text-13", {
          "bg-accent-primary text-white": isUser,
          "bg-layer-2 text-primary": !isUser && !isFailed,
          "text-danger bg-danger-subtle": isFailed,
        })}
      >
        {isFailed ? (
          <span>{message.error_message || t("ai.chat.generic_failure")}</span>
        ) : isGenerating && !message.content ? (
          <span className="flex items-center gap-1.5 text-tertiary">
            <span className="flex gap-0.5">
              <span className="bg-tertiary size-1.5 animate-bounce rounded-full [animation-delay:-0.3s]" />
              <span className="bg-tertiary size-1.5 animate-bounce rounded-full [animation-delay:-0.15s]" />
              <span className="bg-tertiary size-1.5 animate-bounce rounded-full" />
            </span>
            {t("ai.chat.generating")}
          </span>
        ) : (
          <span className="whitespace-pre-wrap">{message.content}</span>
        )}
      </div>

      {proposals.length > 0 && (
        <div className="flex w-full max-w-[85%] flex-col gap-2 pt-1">
          {proposals.map((proposal) => (
            <AIChangeProposalCard
              key={proposal.id}
              proposal={proposal}
              isResolving={resolvingProposalId === proposal.id}
              onResolve={onResolveProposal}
            />
          ))}
        </div>
      )}
    </div>
  );
};
