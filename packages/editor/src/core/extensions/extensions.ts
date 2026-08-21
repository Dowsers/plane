/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { Extensions } from "@tiptap/core";
import { CharacterCount } from "@tiptap/extension-character-count";
// Renamed on default import (pre-existing "TaskItem"/"TaskList" triggered
// eslint-plugin-import's no-named-as-default - the module also exports a
// same-named export - fixed here as a required side-effect of this
// file's own pre-commit hook running with --deny-warnings).
import TiptapTaskItem from "@tiptap/extension-task-item";
import TiptapTaskList from "@tiptap/extension-task-list";
import { TextStyle } from "@tiptap/extension-text-style";
import { Underline } from "@tiptap/extension-underline";
import { Markdown } from "tiptap-markdown";
// extensions
import {
  CustomCalloutExtension,
  CustomCodeBlockExtension,
  CustomCodeInlineExtension,
  CustomColorExtension,
  CustomHorizontalRule,
  CustomKeymap,
  CustomLinkExtension,
  CustomMentionExtension,
  CustomQuoteExtension,
  CustomTextAlignExtension,
  CustomTypographyExtension,
  ImageExtension,
  InlineCommentExtension,
  ListKeymap,
  Table,
  TableCell,
  TableHeader,
  TableRow,
  UtilityExtension,
} from "@/extensions";
// plane editor extensions
import { CoreEditorAdditionalExtensions } from "@/plane-editor/extensions";
// types
import type { IEditorProps } from "@/types";
// local imports
import { CustomImageExtension } from "./custom-image/extension";
import { EmojiExtension } from "./emoji/extension";
import { CustomPlaceholderExtension } from "./placeholder";
import { CustomStarterKitExtension } from "./starter-kit";
import { UniqueID } from "./unique-id/extension";

type TArguments = Pick<
  IEditorProps,
  | "disabledExtensions"
  | "flaggedExtensions"
  | "fileHandler"
  | "getEditorMetaData"
  | "isTouchDevice"
  | "mentionHandler"
  | "placeholder"
  | "showPlaceholderOnEmpty"
  | "tabIndex"
  | "extendedEditorProps"
> & {
  enableHistory: boolean;
  editable: boolean;
  provider: HocuspocusProvider | undefined;
};

export const CoreEditorExtensions = (args: TArguments): Extensions => {
  const {
    disabledExtensions,
    enableHistory,
    fileHandler,
    flaggedExtensions,
    getEditorMetaData,
    isTouchDevice = false,
    mentionHandler,
    placeholder,
    showPlaceholderOnEmpty,
    tabIndex,
    editable,
    extendedEditorProps,
    provider,
  } = args;

  const extensions = [
    CustomStarterKitExtension({
      enableHistory,
    }),
    EmojiExtension,
    CustomQuoteExtension,
    CustomHorizontalRule,
    CustomKeymap,
    ListKeymap({ tabIndex }),
    CustomLinkExtension,
    // Category 10, features 1+3 (merged) - registered here (the
    // interactive editor schema, shared by every editor variant) but
    // deliberately NOT in `core-without-props.ts` - see this extension's
    // own module docstring for why that keeps PDF/Word/Markdown exports
    // comment-free for free (exigence 13).
    InlineCommentExtension,
    CustomTypographyExtension,
    Underline,
    TextStyle,
    TiptapTaskList.configure({
      HTMLAttributes: {
        class: "not-prose pl-2 space-y-2",
      },
    }),
    TiptapTaskItem.configure({
      HTMLAttributes: {
        class: "relative",
      },
      nested: true,
    }),
    CustomCodeBlockExtension,
    CustomCodeInlineExtension,
    Markdown.configure({
      html: true,
      transformCopiedText: false,
      transformPastedText: true,
      breaks: true,
    }),
    Table,
    TableHeader,
    TableCell,
    TableRow,
    CustomMentionExtension(mentionHandler),
    CustomPlaceholderExtension({ placeholder, showPlaceholderOnEmpty }),
    CharacterCount,
    CustomColorExtension,
    CustomTextAlignExtension,
    CustomCalloutExtension,
    UtilityExtension({
      disabledExtensions,
      flaggedExtensions,
      fileHandler,
      getEditorMetaData,
      isEditable: editable,
      isTouchDevice,
    }),
    ...CoreEditorAdditionalExtensions({
      disabledExtensions,
      flaggedExtensions,
      fileHandler,
      extendedEditorProps,
    }),
    UniqueID.configure({
      provider,
    }),
  ];

  if (!disabledExtensions.includes("image")) {
    extensions.push(
      ImageExtension({
        fileHandler,
      }),
      CustomImageExtension({
        fileHandler,
        isEditable: editable,
      })
    );
  }

  return extensions;
};
