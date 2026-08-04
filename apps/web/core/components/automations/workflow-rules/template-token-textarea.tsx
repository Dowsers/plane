/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// plane imports
import { TextArea } from "@plane/ui";
// local imports
import { COMMENT_TEMPLATE_TOKENS } from "./constants";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

/**
 * `comment_template` editor for `POST_COMMENT`/`MENTION_USER` actions - a
 * plain textarea plus a row of buttons that insert `{{issue.identifier}}`/
 * `{{issue.title}}`/`{{actor.display_name}}` tokens at the last-known
 * cursor position. Deliberately simple button-insertion, not full
 * autocomplete, per this feature's own spec. Tracks the cursor position in
 * local state (via onSelect/onClick/onKeyUp) rather than through a ref into
 * `@plane/ui`'s `TextArea` - that component re-parents any forwarded ref
 * into its own internal auto-resize ref instead of exposing the underlying
 * DOM node, so an externally-held ref can't be used to read
 * `selectionStart` reliably.
 */
export function TemplateTokenTextarea(props: Props) {
  const { value, onChange, placeholder } = props;
  const [cursor, setCursor] = useState(value.length);

  const trackCursor = (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCursor(event.currentTarget.selectionStart ?? event.currentTarget.value.length);
  };

  const insertToken = (token: string) => {
    const at = Math.min(cursor, value.length);
    const nextValue = `${value.slice(0, at)}${token}${value.slice(at)}`;
    onChange(nextValue);
    setCursor(at + token.length);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <TextArea
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          trackCursor(event);
        }}
        onSelect={trackCursor}
        onClick={trackCursor}
        onKeyUp={trackCursor}
        placeholder={placeholder ?? "Write a comment..."}
        textAreaSize="sm"
        className="min-h-[70px] w-full"
      />
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-11 text-tertiary">Insert:</span>
        {COMMENT_TEMPLATE_TOKENS.map((item) => (
          <button
            key={item.token}
            type="button"
            onClick={() => insertToken(item.token)}
            className="rounded-sm border border-subtle-1 px-1.5 py-0.5 text-11 text-secondary hover:bg-layer-1"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
