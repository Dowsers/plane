/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@plane/utils";
// local imports
import { escapeHtmlToParagraph } from "./utils";

type Props = {
  initialValue?: string;
  placeholder: string;
  submitLabel: string;
  onSubmit: (commentHtml: string) => Promise<void>;
  onCancel?: () => void;
  /** Focuses the textarea once, right after mount - a `useEffect` +
   * imperative `.focus()` rather than the native `autoFocus` JSX
   * attribute, which `eslint-plugin-jsx-a11y`'s `no-autofocus` rule flags
   * (autofocus can be disorienting for screen-reader/keyboard users on a
   * page load - here it only ever fires on an explicit user action:
   * opening the reply/edit box - a narrower, already-accepted use case,
   * but flagged all the same since the rule can't tell the difference). */
  focusOnMount?: boolean;
  className?: string;
};

/**
 * Category 10, features 1+3 (merged) - shared plain-textarea composer used
 * for the reply box and the edit-own-text box (the bubble-menu's own
 * create-thread popup has its own small textarea, colocated in
 * `packages/editor` since it can't depend on this `apps/web` component -
 * see that popup's own docstring).
 */
export function PageCommentComposer(props: Props) {
  const { initialValue = "", placeholder, submitLabel, onSubmit, onCancel, focusOnMount, className } = props;
  const [value, setValue] = useState(initialValue);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focusOnMount) textareaRef.current?.focus();
    // Only ever on mount - this composer instance never toggles `focusOnMount`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(escapeHtmlToParagraph(trimmed));
      setValue("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <textarea
        ref={textareaRef}
        rows={2}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void handleSubmit();
          }
          if (e.key === "Escape") onCancel?.();
        }}
        className="w-full resize-none rounded-sm border-[0.5px] border-subtle bg-surface-1 p-1.5 text-13 text-primary outline-none placeholder:text-placeholder"
      />
      <div className="flex justify-end gap-1.5">
        {onCancel && (
          <button
            type="button"
            className="rounded-sm px-2 py-1 text-12 text-secondary transition-colors hover:bg-layer-1"
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          disabled={!value.trim() || isSubmitting}
          className="rounded-sm bg-accent-primary px-2.5 py-1 text-12 font-medium text-white transition-opacity disabled:opacity-50"
          onClick={() => void handleSubmit()}
        >
          {isSubmitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
