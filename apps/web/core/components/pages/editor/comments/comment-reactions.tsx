/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { stringToEmoji } from "@plane/propel/emoji-icon-picker";
import { EmojiReactionGroup, EmojiReactionPicker } from "@plane/propel/emoji-reaction";
import type { EmojiReactionType } from "@plane/propel/emoji-reaction";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPageComment } from "@plane/types";
import { cn, groupReactions } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
// store
import type { TPageInstance } from "@/store/pages/base-page";

type Props = {
  page: TPageInstance;
  comment: TPageComment;
  className?: string;
};

/**
 * Category 10, features 1+3 (merged, "Commentaires ancres sur les Pages" +
 * "Resolution de fils de commentaires") - `PageCommentReaction` is
 * field-for-field identical in shape to `PageReaction` (feature 2), so
 * this reuses `PageReactions`'s own UI/aggregation pattern
 * (@/components/pages/editor/reactions.tsx) directly rather than
 * rebuilding it, per this feature's build brief - the only real
 * difference is the data source (`comment.reactions` plus
 * `page.comments.createReaction`/`removeReaction`, scoped to one comment
 * id, instead of `page.reactions`).
 */
export const PageCommentReactions = observer(function PageCommentReactions(props: Props) {
  const { page, comment, className } = props;
  // states
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  // store hooks
  const { data: currentUser } = useUser();
  const { getUserDetails } = useMember();
  // derived values
  const { reactions } = comment;

  const userReactions = useMemo(
    () => (currentUser ? reactions.filter((r) => r.actor === currentUser.id).map((r) => r.reaction) : []),
    [reactions, currentUser]
  );

  const groupedReactions = useMemo(() => groupReactions(reactions, "reaction"), [reactions]);

  const reactionOperations = useMemo(
    () => ({
      create: async (reaction: string) => {
        try {
          await page.comments.createReaction(comment.id, reaction);
        } catch (_error) {
          setToast({ title: "Error!", type: TOAST_TYPE.ERROR, message: "Reaction creation failed" });
        }
      },
      remove: async (reaction: string) => {
        try {
          if (!currentUser?.id) throw new Error("Missing fields");
          await page.comments.removeReaction(comment.id, reaction, currentUser.id);
        } catch (_error) {
          setToast({ title: "Error!", type: TOAST_TYPE.ERROR, message: "Reaction remove failed" });
        }
      },
      react: async (reaction: string) => {
        if (userReactions.includes(reaction)) await reactionOperations.remove(reaction);
        else await reactionOperations.create(reaction);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, comment.id, currentUser, userReactions]
  );

  const getReactionUsers = (reaction: string): string[] =>
    (groupedReactions[reaction] || [])
      .map(
        (reactionDetails) =>
          getUserDetails(reactionDetails.actor)?.display_name || reactionDetails.actor_detail?.display_name
      )
      .filter((displayName): displayName is string => !!displayName);

  const emojiReactions: EmojiReactionType[] = useMemo(
    () =>
      Object.keys(groupedReactions)
        .filter((reaction) => groupedReactions[reaction]?.length > 0)
        .map((reaction) => ({
          emoji: stringToEmoji(reaction),
          count: groupedReactions[reaction].length,
          reacted: userReactions.includes(reaction),
          users: getReactionUsers(reaction),
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupedReactions, userReactions]
  );

  const handleReactionClick = (emoji: string) => {
    const emojiCodePoints = Array.from(emoji).map((char) => char.codePointAt(0));
    reactionOperations.react(emojiCodePoints.join("-"));
  };

  const handleEmojiSelect = (emoji: string) => {
    reactionOperations.react(emoji);
  };

  if (!currentUser) return null;

  return (
    <div className={cn("relative", className)}>
      <EmojiReactionPicker
        isOpen={isPickerOpen}
        handleToggle={setIsPickerOpen}
        onChange={handleEmojiSelect}
        label={
          <EmojiReactionGroup
            reactions={emojiReactions}
            onReactionClick={handleReactionClick}
            showAddButton
            onAddReaction={() => setIsPickerOpen(true)}
          />
        }
        placement="bottom-start"
      />
    </div>
  );
});
