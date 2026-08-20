/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
// plane imports
import type { TAIChangeProposal, TAIMessage, TAIMessageMode } from "@plane/types";
// services
import { AIChatService } from "@/services/ai-chat.service";

const aiChatService = new AIChatService();

// This backend has no push/SSE mechanism for "still generating" (see the
// backend's own `plane.utils.ai_chat_assistant` module docstring) - the
// frontend polls `GET .../messages/` at this cadence while the latest
// assistant message is `pending`/`streaming`, same polling convention as
// `ai-summary/root.tsx`'s own `POLL_INTERVAL_MS`.
const POLL_INTERVAL_MS = 1500;

export type TAIConversationThreadError = { error?: string; status?: number } | null;

/**
 * Category 9, feature 3 - "Assistant de chat IA in-app". Encapsulates the
 * message list + change-proposal fetch/poll/send lifecycle for one open
 * conversation, so `message-thread.tsx` stays presentational.
 *
 * Proposals: `GET /workspaces/:slug/ai-proposals/` only supports a
 * `status` filter, not `conversation`/`message` (see the backend view's
 * own code, `AIChangeProposalListEndpoint.get`) - so this hook fetches the
 * full (own + reviewable) proposals list once per conversation load/poll
 * tick, and `message-thread.tsx` groups it by `message` id locally rather
 * than this hook issuing one request per assistant message.
 */
export function useAIConversationThread(workspaceSlug: string, conversationId: string | null) {
  const [messages, setMessages] = useState<TAIMessage[]>([]);
  const [proposals, setProposals] = useState<TAIChangeProposal[]>([]);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<TAIConversationThreadError>(null);
  const [resolvingProposalId, setResolvingProposalId] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;
    const data = await aiChatService.listMessages(workspaceSlug, conversationId);
    setMessages(data);
  }, [workspaceSlug, conversationId]);

  const fetchProposals = useCallback(async () => {
    if (!conversationId) return;
    const response = await aiChatService.listProposals(workspaceSlug);
    setProposals(response.results);
  }, [workspaceSlug, conversationId]);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setProposals([]);
      return;
    }
    let cancelled = false;
    setIsLoadingThread(true);
    Promise.all([fetchMessages(), fetchProposals()])
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsLoadingThread(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, conversationId]);

  const latestMessage = messages[messages.length - 1];
  const isAssistantGenerating =
    !!latestMessage &&
    latestMessage.role === "assistant" &&
    (latestMessage.status === "pending" || latestMessage.status === "streaming");

  useEffect(() => {
    if (!conversationId || !isAssistantGenerating) return;
    const interval = setInterval(() => {
      fetchMessages().catch(() => undefined);
      fetchProposals().catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [conversationId, isAssistantGenerating, fetchMessages, fetchProposals]);

  const sendMessage = useCallback(
    async (content: string, mode: TAIMessageMode) => {
      if (!conversationId) return;
      setIsSending(true);
      setSendError(null);
      try {
        const response = await aiChatService.sendMessage(workspaceSlug, conversationId, { content, mode });
        setMessages((prev) => [...prev, response.user_message, response.assistant_message]);
        if (mode === "propose") {
          await fetchProposals().catch(() => undefined);
        }
      } catch (error: unknown) {
        setSendError(error as TAIConversationThreadError);
        throw error;
      } finally {
        setIsSending(false);
      }
    },
    [workspaceSlug, conversationId, fetchProposals]
  );

  const resolveProposal = useCallback(
    async (proposalId: string, resolveAction: "approve" | "reject") => {
      setResolvingProposalId(proposalId);
      try {
        const updated =
          resolveAction === "approve"
            ? await aiChatService.approveProposal(workspaceSlug, proposalId)
            : await aiChatService.rejectProposal(workspaceSlug, proposalId);
        setProposals((prev) => prev.map((proposal) => (proposal.id === updated.id ? updated : proposal)));
        return updated;
      } finally {
        setResolvingProposalId(null);
      }
    },
    [workspaceSlug]
  );

  return {
    messages,
    proposals,
    isLoadingThread,
    isSending,
    sendError,
    isAssistantGenerating,
    resolvingProposalId,
    sendMessage,
    resolveProposal,
  };
}
