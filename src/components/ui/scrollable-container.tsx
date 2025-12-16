/**
 * Scrollable Container Component
 *
 * A container that auto-scrolls to bottom when content changes.
 * Works correctly in both flexbox and fixed-height contexts.
 */

"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface ScrollableContainerProps {
  children: React.ReactNode;
  /** Value to watch for changes - triggers auto-scroll when changed */
  scrollTrigger?: unknown;
  /** Additional class names */
  className?: string;
  /** Whether to auto-scroll on content changes (default: true) */
  autoScroll?: boolean;
  /** Pixel threshold for smart scroll - only scrolls if within this distance of bottom (default: 100) */
  smartScrollThreshold?: number;
}

export function ScrollableContainer({
  children,
  scrollTrigger,
  className,
  autoScroll = true,
  smartScrollThreshold = 100,
}: ScrollableContainerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Smart scroll - only auto-scroll if user is near bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      const el = scrollRef.current;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < smartScrollThreshold;
      if (isNearBottom) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [scrollTrigger, autoScroll, smartScrollThreshold]);

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
