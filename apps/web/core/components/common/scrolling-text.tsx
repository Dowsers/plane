/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@plane/utils";

// pixels travelled per second once the text starts scrolling
const SCROLL_SPEED = 45;
// floor on the scroll duration, so a slight overflow does not flick past
const MIN_SCROLL_DURATION = 500;
// hover time before scrolling starts, so a cursor passing through stays still
const SCROLL_DELAY = 300;
// time taken to slide back to the start once the pointer leaves
const RESET_DURATION = 250;
// the surrounding control whose hover and focus the text reacts to
const TRIGGER_SELECTOR = 'button, a[href], [role="button"], [role="option"]';

type Props = {
  children: ReactNode;
  className?: string;
  /**
   * Scrolls while true, whatever the pointer and focus are doing. For widgets
   * that highlight a row without moving DOM focus onto it, such as a combobox
   * option list. Leave undefined to rely on hover and focus alone.
   */
  active?: boolean;
  /** full text, exposed as a native tooltip for reduced-motion users */
  title?: string;
};

/**
 * Clips its content to the available width and, while the surrounding control
 * is hovered or focused, scrolls it sideways so the whole thing can be read.
 * Shows an ellipsis when idle, and stays put when the content already fits or
 * the user asked for less motion.
 */
export function ScrollingText(props: Props) {
  const { active, children, className, title } = props;
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const offsetRef = useRef(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [offset, setOffset] = useState(0);
  const [duration, setDuration] = useState(0);

  const scrollTo = useCallback((next: number) => {
    offsetRef.current = next;
    setOffset(next);
  }, []);

  const startScroll = useCallback(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // nowrap + hidden overflow makes scrollWidth the full content width
    const overflow = text.scrollWidth - container.clientWidth;
    if (overflow <= 0) return;
    setIsScrolling(true);
    setDuration(Math.max(MIN_SCROLL_DURATION, (overflow / SCROLL_SPEED) * 1000));
    scrollTo(overflow);
  }, [scrollTo]);

  const stopScroll = useCallback(() => {
    setDuration(RESET_DURATION);
    scrollTo(0);
  }, [scrollTo]);

  // react to the whole surrounding control rather than to the few pixels the
  // text covers, and to focus as well as hover so the keyboard gets there too
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // dropdown buttons nest a button inside a button; prefer the outer one, as
    // it is the box the user sees and the one focus bubbles up to
    const inner = container.closest<HTMLElement>(TRIGGER_SELECTOR);
    const outer = inner?.parentElement?.closest<HTMLElement>(TRIGGER_SELECTOR);
    const trigger = outer ?? inner ?? container;

    trigger.addEventListener("pointerenter", startScroll);
    trigger.addEventListener("pointerleave", stopScroll);
    trigger.addEventListener("focusin", startScroll);
    trigger.addEventListener("focusout", stopScroll);
    return () => {
      trigger.removeEventListener("pointerenter", startScroll);
      trigger.removeEventListener("pointerleave", stopScroll);
      trigger.removeEventListener("focusin", startScroll);
      trigger.removeEventListener("focusout", stopScroll);
    };
  }, [startScroll, stopScroll]);

  useEffect(() => {
    if (active === undefined) return;
    if (active) startScroll();
    else stopScroll();
  }, [active, startScroll, stopScroll]);

  // only drop back to the ellipsis once the text has slid home
  const handleTransitionEnd = useCallback(() => {
    if (offsetRef.current === 0) setIsScrolling(false);
  }, []);

  return (
    <span ref={containerRef} className={cn("block overflow-hidden", className)} title={title}>
      <span
        ref={textRef}
        className={cn("block whitespace-nowrap transition-transform ease-linear", {
          "w-max": isScrolling,
          "overflow-hidden text-ellipsis": !isScrolling,
        })}
        style={{
          transform: `translateX(-${offset}px)`,
          transitionDuration: `${duration}ms`,
          transitionDelay: offset > 0 ? `${SCROLL_DELAY}ms` : "0ms",
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        {children}
      </span>
    </span>
  );
}
