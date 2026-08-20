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
import { cn, groupReactions } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
// store
import type { TPageInstance } from "@/store/pages/base-page";

type Props = {
  page: TPageInstance;
  className?: string;
};

/**
 * Category 10, feature 2 ("Reactions emoji sur les Pages") - same emoji-
 * reaction UX as `IssueReaction`
 * (@/components/issues/issue-detail/reactions/issue.tsx), just backed by
 * `TPageInstance.reactions`/`createReaction`/`removeReaction` (a page-
 * instance-scoped observable array, see `BasePage`) instead of the
 * issue-detail root store's page-agnostic reaction map - there is only
 * ever one Page open in the editor at a time in this fork, so a global
 * map keyed by page id would add indirection with no benefit here.
 *
 * Unlike `IssueReaction`, this component is never `disabled`: reactions
 * stay allowed on archived and locked pages (spec exigences 8/9) and the
 * server already blocks them on trashed pages by 404-ing the page fetch
 * itself before this component can ever mount.
 */
export const PageReactions = observer(function PageReactions(props: Props) {
  const { page, className } = props;
  // states
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  // store hooks
  const { data: currentUser } = useUser();
  const { getUserDetails } = useMember();
  // derived values
  const { reactions, createReaction, removeReaction } = page;

  const userReactions = useMemo(
    () => (currentUser ? reactions.filter((r) => r.actor === currentUser.id).map((r) => r.reaction) : []),
    [reactions, currentUser]
  );

  const groupedReactions = useMemo(() => groupReactions(reactions, "reaction"), [reactions]);

  const pageReactionOperations = useMemo(
    () => ({
      create: async (reaction: string) => {
        try {
          await createReaction(reaction);
          setToast({
            title: "Success!",
            type: TOAST_TYPE.SUCCESS,
            message: "Reaction created successfully",
          });
        } catch (_error) {
          setToast({
            title: "Error!",
            type: TOAST_TYPE.ERROR,
            message: "Reaction creation failed",
          });
        }
      },
      remove: async (reaction: string) => {
        try {
          if (!currentUser?.id) throw new Error("Missing fields");
          await removeReaction(reaction, currentUser.id);
          setToast({
            title: "Success!",
            type: TOAST_TYPE.SUCCESS,
            message: "Reaction removed successfully",
          });
        } catch (_error) {
          setToast({
            title: "Error!",
            type: TOAST_TYPE.ERROR,
            message: "Reaction remove failed",
          });
        }
      },
      react: async (reaction: string) => {
        if (userReactions.includes(reaction)) await pageReactionOperations.remove(reaction);
        else await pageReactionOperations.create(reaction);
      },
    }),
    [createReaction, removeReaction, currentUser, userReactions]
  );

  const getReactionUsers = (reaction: string): string[] => {
    const reactionUsers = (groupedReactions[reaction] || [])
      .map(
        (reactionDetails) =>
          getUserDetails(reactionDetails.actor)?.display_name || reactionDetails.actor_detail?.display_name
      )
      .filter((displayName): displayName is string => !!displayName);

    return reactionUsers;
  };

  // Transform reactions data to Propel EmojiReactionType format
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
    // Convert emoji back to decimal string format for the API
    const emojiCodePoints = Array.from(emoji).map((char) => char.codePointAt(0));
    const reactionString = emojiCodePoints.join("-");
    pageReactionOperations.react(reactionString);
  };

  const handleEmojiSelect = (emoji: string) => {
    // emoji is already in decimal string format from EmojiReactionPicker
    pageReactionOperations.react(emoji);
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
