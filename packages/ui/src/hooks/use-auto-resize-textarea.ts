/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useLayoutEffect } from "react";

export const useAutoResizeTextArea = (
  textAreaRef: React.RefObject<HTMLTextAreaElement>,
  value: string | number | readonly string[]
) => {
  useLayoutEffect(() => {
    const textArea = textAreaRef.current;
    if (!textArea) return;

    const resize = () => {
      // We need to reset the height momentarily to get the correct scrollHeight for the textarea
      textArea.style.height = "0px";
      textArea.style.height = `${textArea.scrollHeight}px`;
    };

    resize();

    // A textarea that first lays out while its ancestor is still hidden or
    // mid-transition (e.g. inside a modal that's always mounted but closed,
    // or animating open via Headless UI's Transition) measures a scrollHeight
    // of 0 here and nothing re-triggers this effect afterwards, since `value`
    // isn't changing - the field gets stuck at that stale height. Re-measure
    // whenever the element's actual rendered size changes, which also fires
    // the moment it becomes visible.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resize);
    observer.observe(textArea);
    return () => observer.disconnect();
  }, [textAreaRef, value]);
};
