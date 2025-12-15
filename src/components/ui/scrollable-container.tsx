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
}

export function ScrollableContainer({
  children,
  scrollTrigger,
  className,
  autoScroll = true,
}: ScrollableContainerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when scrollTrigger changes
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [scrollTrigger, autoScroll]);

  return (
    <div
      ref={scrollRef}
      className={cn(
        // min-h-0 is critical for flexbox - allows container to shrink below content size
        "min-h-0 overflow-y-auto",
        className
      )}
    >
      {children}
    </div>
  );
}
