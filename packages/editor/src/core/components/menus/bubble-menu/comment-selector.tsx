/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { MessageSquarePlus } from "lucide-react";
// plane imports
import { cn } from "@plane/utils";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// types
import type { TInlineCommentHandler } from "@/types/inline-comment";
// local imports
import { FloatingMenuRoot } from "../floating-menu/root";
import { useFloatingMenu } from "../floating-menu/use-floating-menu";

type Props = {
  editor: Editor;
  commentHandler: TInlineCommentHandler;
};

/**
 * Category 10, features 1+3 (merged, "Commentaires ancres sur les Pages" +
 * "Resolution de fils de commentaires") - the bubble menu's "Commenter"
 * button (exigence 1), structurally modeled on `BubbleMenuLinkSelector` in
 * this same directory per this feature's own build brief: a small popup
 * opened via `FloatingMenuRoot`/`useFloatingMenu`, submit mints an id and
 * applies a Mark to the selection.
 *
 * Unlike the link popup, submitting here does two things instead of one:
 * (1) mint `anchorId` client-side and apply the `InlineComment` Mark to
 * the *original* selection (`editor.state.selection` - still valid at
 * submit time even though DOM focus has moved to this popup's textarea,
 * exactly the same assumption `setLinkEditor`/`helpers/editor-commands.ts`
 * already relies on for its own popup), then (2) hand the anchor + the
 * user's first message off to `commentHandler.createThread` - the actual
 * `POST .../comments/` call, which only `apps/web` (not this package) can
 * make.
 *
 * The message composer here is a plain `<textarea>`, not a nested Tiptap
 * instance: embedding a second rich-text editor inside this editor's own
 * bubble menu would be substantially riskier/heavier for a first message
 * that is, in practice, almost always a short note - a deliberate scope
 * trade-off documented in this feature's build report. `comment_html` is
 * built by escaping the text and wrapping it in `<p>`/`<br />` - the
 * server strips tags into `comment_stripped` regardless.
 */
export function BubbleMenuCommentSelector(props: Props) {
  const { editor, commentHandler } = props;
  // states
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // floating ui
  const { options, getReferenceProps, getFloatingProps } = useFloatingMenu({
    handleOpenChange: (open) => {
      if (open) {
        setMessage("");
        setError(null);
      }
    },
  });
  const { context } = options;
  // refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focuses the textarea whenever the popup opens - a `useEffect` +
  // imperative `.focus()` rather than the native `autoFocus` JSX
  // attribute, which `eslint-plugin-jsx-a11y`'s `no-autofocus` rule flags.
  useEffect(() => {
    if (context.open) textareaRef.current?.focus();
  }, [context.open]);

  const handleSubmit = useCallback(async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || isSubmitting) return;

    const { from, to } = editor.state.selection;
    if (from === to) {
      setError("Select some text to comment on first.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const anchorId = uuidv4();
      const anchorText = editor.state.doc.textBetween(from, to, "\n");

      editor
        .chain()
        .setTextSelection({ from, to })
        .setMark(CORE_EXTENSIONS.INLINE_COMMENT, { commentId: anchorId })
        .setTextSelection(to)
        .run();

      const commentHtml = `<p>${escapeHtmlForComment(trimmedMessage)}</p>`;
      await commentHandler.createThread({ anchorId, anchorText, commentHtml });

      context.onOpenChange(false);
      setMessage("");
    } catch (_e) {
      setError("Couldn't post the comment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [commentHandler, context, editor, isSubmitting, message]);

  if (!commentHandler.isCommentingEnabled) return null;

  return (
    <FloatingMenuRoot
      classNames={{
        buttonContainer: "h-full",
        button: cn(
          "flex h-full items-center gap-1 rounded-sm px-3 text-13 font-medium whitespace-nowrap text-tertiary transition-colors hover:bg-layer-1 active:bg-layer-1",
          {
            "bg-layer-1": context.open,
          }
        ),
      }}
      getFloatingProps={getFloatingProps}
      getReferenceProps={getReferenceProps}
      menuButton={
        <>
          Comment
          <MessageSquarePlus className="size-3 shrink-0" />
        </>
      }
      options={options}
    >
      <div className="mt-1 w-72 rounded-md bg-surface-1 p-2 shadow-raised-200">
        <textarea
          ref={textareaRef}
          rows={3}
          placeholder="Leave a comment on the selected text…"
          className="w-full resize-none rounded-sm border-[0.5px] border-strong bg-surface-1 p-1.5 text-13 outline-none placeholder:text-placeholder"
          value={message}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            setError(null);
            setMessage(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
        />
        {error && <p className="mt-1 text-11 text-danger-primary">{error}</p>}
        <div className="mt-1.5 flex justify-end">
          <button
            type="button"
            disabled={!message.trim() || isSubmitting}
            className="rounded-sm bg-accent-primary px-2.5 py-1 text-12 font-medium text-white transition-opacity disabled:opacity-50"
            onClick={(e) => {
              e.stopPropagation();
              void handleSubmit();
            }}
          >
            {isSubmitting ? "Posting…" : "Comment"}
          </button>
        </div>
      </div>
    </FloatingMenuRoot>
  );
}

function escapeHtmlForComment(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return escaped.replace(/\n/g, "<br />");
}
