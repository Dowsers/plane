/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { CheckCircle2, Locate, MoreHorizontal, RotateCcw, Trash2, Pencil } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPageComment } from "@plane/types";
import { Avatar } from "@plane/ui";
import { calculateTimeAgo, cn, getFileURL } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
// store
import type { TPageInstance } from "@/store/pages/base-page";
// local imports
import { PageCommentComposer } from "./comment-composer";
import { PageCommentReactions } from "./comment-reactions";

type TCommentEntryProps = {
  page: TPageInstance;
  comment: TPageComment;
  canEdit: boolean;
  canDelete: boolean;
};

/** One row (root comment or reply) - author, timestamp, body, reactions,
 * edit/delete affordances. Body is rendered from `comment_stripped`
 * (plain text, computed server-side via `strip_tags`), never
 * `comment_html` via `dangerouslySetInnerHTML` - this feature's composers
 * are plain textareas under this app's control, but a comment can also be
 * created directly against the REST API (e.g. by a script, or a future
 * public-API consumer) which the server does not HTML-sanitize before
 * storing `comment_html` - rendering `comment_stripped` instead avoids a
 * stored-XSS vector for a marginal loss of exact whitespace fidelity. */
const CommentEntryRow = observer(function CommentEntryRow(props: TCommentEntryProps) {
  const { page, comment, canEdit, canDelete } = props;
  const [isEditing, setIsEditing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { getUserDetails } = useMember();
  const author = getUserDetails(comment.actor);
  const { t } = useTranslation();

  const handleEdit = async (commentHtml: string) => {
    try {
      await page.comments.updateComment(comment.id, { comment_html: commentHtml });
      setIsEditing(false);
    } catch (_error) {
      setToast({ title: t("toast.error"), type: TOAST_TYPE.ERROR, message: t("wiki.comments.errors.update_failed") });
    }
  };

  const handleDelete = async () => {
    try {
      await page.comments.deleteComment(comment.id);
    } catch (_error) {
      setToast({ title: t("toast.error"), type: TOAST_TYPE.ERROR, message: t("wiki.comments.errors.delete_failed") });
    }
  };

  return (
    <div className="group/comment-row flex flex-col gap-1 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Avatar src={getFileURL(author?.avatar_url ?? "")} name={author?.display_name} size="sm" />
          <span className="text-13 font-medium text-primary">
            {author?.display_name ?? t("common.deactivated_user")}
          </span>
          <span className="text-11 text-tertiary">
            {t("wiki.comments.time_ago", { time: calculateTimeAgo(comment.created_at) })}
          </span>
        </div>
        {(canEdit || canDelete) && (
          <div className="relative">
            <button
              type="button"
              className="grid size-5 place-items-center rounded-sm text-tertiary opacity-0 transition-opacity group-hover/comment-row:opacity-100 hover:bg-layer-1"
              onClick={() => setIsMenuOpen((v) => !v)}
              aria-label={t("wiki.comments.aria.actions")}
            >
              <MoreHorizontal className="size-3.5" />
            </button>
            {isMenuOpen && (
              <div className="absolute top-6 right-0 z-10 min-w-24 rounded-md border border-subtle bg-surface-1 py-1 shadow-raised-200">
                {canEdit && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-12 text-primary hover:bg-layer-1"
                    onClick={() => {
                      setIsEditing(true);
                      setIsMenuOpen(false);
                    }}
                  >
                    <Pencil className="size-3" /> {t("edit")}
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-12 text-danger-primary hover:bg-layer-1"
                    onClick={() => {
                      setIsMenuOpen(false);
                      void handleDelete();
                    }}
                  >
                    <Trash2 className="size-3" /> {t("delete")}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {isEditing ? (
        <PageCommentComposer
          initialValue={comment.comment_stripped}
          placeholder={t("wiki.comments.placeholder_edit")}
          submitLabel={t("save")}
          focusOnMount
          onSubmit={handleEdit}
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <p className="text-13 whitespace-pre-wrap text-primary">{comment.comment_stripped}</p>
      )}
      <PageCommentReactions page={page} comment={comment} className="mt-0.5" />
    </div>
  );
});

type Props = {
  page: TPageInstance;
  thread: TPageComment;
  isActive: boolean;
  /** `true` when the Page is locked/archived - hides reply/resolve/reopen
   * affordances (backend blocks them with a 400) but keeps edit/delete
   * available, mirroring exactly what the server does/doesn't gate on
   * those two states (see this feature's build report). */
  isPageLockedOrArchived: boolean;
  registerCardRef: (element: HTMLDivElement | null) => void;
  onCardClick?: () => void;
  /** `"positioned"` (default) - absolutely positioned + `translateY`-moved
   * by `use-comment-gutter-layout.ts` (a live-anchored thread). `"static"`
   * - normal document flow, used for the fixed "orphaned" section at the
   * top of the gutter (exigence 6), which has no live anchor to align
   * against. */
  layout?: "positioned" | "static";
};

/**
 * Category 10, features 1+3 (merged, "Commentaires ancres sur les Pages" +
 * "Resolution de fils de commentaires") - one thread: root comment +
 * replies + reply composer + resolve/reopen. Positioned by the caller
 * (the gutter or the fixed orphaned section) via `registerCardRef` +
 * `transform: translateY(...)` (see `use-comment-gutter-layout.ts`) - this
 * component itself only ever sets `position: absolute; top: 0; left: 0`
 * and lets the layout hook move it.
 */
export const PageCommentThreadCard = observer(function PageCommentThreadCard(props: Props) {
  const { page, thread, isActive, isPageLockedOrArchived, registerCardRef, onCardClick, layout = "positioned" } = props;
  const [isReplying, setIsReplying] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  // store hooks
  const { data: currentUser } = useUser();
  const { t } = useTranslation();

  const canWrite = page.canCurrentUserCommentOnPage;
  const isAuthor = thread.actor === currentUser?.id;
  const canModerateThread = canWrite && (page.canCurrentUserModeratePageComments || isAuthor);
  const canResolveOrReopen = canModerateThread && !isPageLockedOrArchived;
  const canReply = canWrite && !isPageLockedOrArchived;

  const handleResolveToggle = async () => {
    setIsResolving(true);
    try {
      if (thread.is_resolved) await page.comments.reopenThread(thread.id);
      else await page.comments.resolveThread(thread.id);
    } catch (_error) {
      setToast({
        title: t("toast.error"),
        type: TOAST_TYPE.ERROR,
        message: t("wiki.comments.errors.status_update_failed"),
      });
    } finally {
      setIsResolving(false);
    }
  };

  const handleReply = async (commentHtml: string) => {
    try {
      await page.comments.addReply(thread.id, { comment_html: commentHtml });
      setIsReplying(false);
    } catch (_error) {
      setToast({ title: t("toast.error"), type: TOAST_TYPE.ERROR, message: t("wiki.comments.errors.reply_failed") });
    }
  };

  return (
    <div
      ref={registerCardRef}
      className={cn(
        // `layout` alone decides `position` - never combine `relative` and
        // `absolute` on the same element, Tailwind's generated stylesheet
        // order (not this string's order) would decide which one actually
        // wins, and a `PageCommentThreadCard` accidentally rendered
        // `position: relative` instead of `absolute` would silently break
        // `use-comment-gutter-layout.ts`'s `translateY` positioning.
        "group w-full rounded-md border border-subtle bg-surface-1 p-2.5 shadow-raised-100 transition-shadow",
        layout === "positioned" ? "absolute top-0 left-0" : "relative mb-3",
        {
          "ring-accent-primary ring-2": isActive,
          "opacity-60": thread.is_resolved,
        }
      )}
    >
      {/*
        A real `<button>` (not a click handler on the card's own
        background `<div>`) for the doc-highlight <-> gutter-card sync's
        gutter-side trigger (feature 1's UX section: "clic ... fait
        defiler jusqu'au fil correspondant ... et inversement") - native
        keyboard/a11y semantics for free, and it sidesteps needing
        `stopPropagation` guards on every other interactive element in
        this card (reply/resolve/edit/delete buttons, the reactions
        picker, the composer textarea) that a whole-card click handler
        would otherwise require.
      */}
      {!thread.is_orphaned && (
        <button
          type="button"
          aria-label={t("wiki.comments.aria.scroll_to_text")}
          title={t("wiki.comments.scroll_to_text")}
          className="absolute top-2 right-2 grid size-5 place-items-center rounded-sm text-tertiary opacity-0 transition-opacity group-hover:opacity-100 hover:bg-layer-1"
          onClick={onCardClick}
        >
          <Locate className="size-3.5" />
        </button>
      )}
      {thread.is_orphaned && (
        <div className="mb-1.5 rounded-sm bg-layer-1 px-1.5 py-1 text-11 text-tertiary">
          {t("wiki.comments.anchor_not_found")} <span className="italic">“{thread.anchor_text}”</span>
        </div>
      )}
      <CommentEntryRow
        page={page}
        comment={thread}
        canEdit={canWrite && isAuthor}
        canDelete={canWrite && (page.canCurrentUserModeratePageComments || isAuthor)}
      />
      {thread.replies.length > 0 && (
        <div className="ml-3 border-l border-subtle pl-2.5">
          {thread.replies.map((reply) => (
            <CommentEntryRow
              key={reply.id}
              page={page}
              comment={reply}
              canEdit={canWrite && reply.actor === currentUser?.id}
              canDelete={canWrite && (page.canCurrentUserModeratePageComments || reply.actor === currentUser?.id)}
            />
          ))}
        </div>
      )}
      {isReplying && canReply && (
        <div className="mt-1 ml-3 pl-2.5">
          <PageCommentComposer
            placeholder={t("wiki.comments.placeholder_reply")}
            submitLabel={t("wiki.comments.reply")}
            focusOnMount
            onSubmit={handleReply}
            onCancel={() => setIsReplying(false)}
          />
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-2 border-t border-subtle pt-1.5">
        {canReply && !isReplying && (
          <button
            type="button"
            className="text-12 font-medium text-secondary transition-colors hover:text-primary"
            onClick={() => setIsReplying(true)}
          >
            {t("wiki.comments.reply")}
          </button>
        )}
        {canResolveOrReopen && (
          <button
            type="button"
            disabled={isResolving}
            className="ml-auto flex items-center gap-1 text-12 font-medium text-secondary transition-colors hover:text-primary disabled:opacity-50"
            onClick={() => void handleResolveToggle()}
          >
            {thread.is_resolved ? (
              <>
                <RotateCcw className="size-3" /> {t("wiki.comments.reopen")}
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3" /> {t("wiki.comments.resolve")}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
});
