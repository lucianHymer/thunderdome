/**
 * Scrollable Container Component
 *
 * A container that auto-scrolls to bottom when content changes.
 * Uses "detached" state tracking - once user scrolls up, auto-scroll
 * is disabled until they scroll back to the bottom.
 */

"use client";

import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface ScrollableContainerProps {
  children: React.ReactNode;
  /** Value to watch for changes - triggers auto-scroll when changed */
  scrollTrigger?: unknown;
  /** Additional class names */
  className?: string;
  /** Whether to auto-scroll on content changes (default: true) */
  autoScroll?: boolean;
  /** Pixel threshold for re-attaching when user scrolls back to bottom (default: 50) */
  reattachThreshold?: number;
}

export function ScrollableContainer({
  children,
  scrollTrigger,
  className,
  autoScroll = true,
  reattachThreshold = 50,
}: ScrollableContainerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDetachedRef = useRef(false);
  const lastScrollTopRef = useRef(0);

  // Handle user scroll - detect if they scrolled up (detach) or back to bottom (reattach)
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const currentScrollTop = el.scrollTop;
    const distanceFromBottom = el.scrollHeight - currentScrollTop - el.clientHeight;

    // User scrolled UP - detach from auto-scroll
    if (currentScrollTop < lastScrollTopRef.current && distanceFromBottom > reattachThreshold) {
      isDetachedRef.current = true;
    }

    // User scrolled back to bottom - reattach
    if (distanceFromBottom <= reattachThreshold) {
      isDetachedRef.current = false;
    }

    lastScrollTopRef.current = currentScrollTop;
  }, [reattachThreshold]);

  // Set up scroll listener
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Auto-scroll to bottom when content changes (if not detached)
  useEffect(() => {
    if (autoScroll && scrollRef.current && !isDetachedRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
      lastScrollTopRef.current = el.scrollTop;
    }
  }, [scrollTrigger, autoScroll]);

  return (
    <div
      ref={scrollRef}
      className={cn(
        // min-h-0 is critical for flexbox - allows container to shrink below content size
        "min-h-0 overflow-y-auto",
        className,
      )}
    >
      {children}
    </div>
  );
}
