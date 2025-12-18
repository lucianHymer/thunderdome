/**
 * Interactive Session UI Component
 *
 * A reusable component for displaying and interacting with Claude sessions.
 * Supports customization for different use cases (Setup Discovery, Consul, etc.)
 */

"use client";

import { Loader2, Send, Square, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionMessage, SessionStatus } from "@/hooks/use-interactive-session";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Markdown } from "./markdown";
import { ScrollableContainer } from "./scrollable-container";
import { Textarea } from "./textarea";

/**
 * Quick action button configuration
 */
export interface QuickAction {
  label: string;
  message: string;
  icon?: ReactNode;
  variant?: "default" | "outline" | "secondary";
}

/**
 * Props for the InteractiveSession component
 */
export interface InteractiveSessionProps {
  /** Messages to display */
  messages: SessionMessage[];
  /** Current session status */
  status: SessionStatus;
  /** Error message if any */
  error?: string | null;
  /** Called when user sends a message */
  onSend: (message: string) => void;
  /** Called when user stops the session */
  onStop?: () => void;

  // Customization
  /** Input placeholder text */
  placeholder?: string;
  /** Whether to show tool status bar (current tool + count) */
  showToolUse?: boolean;
  /** Whether to show thinking/reasoning */
  showThinking?: boolean;
  /** Quick action buttons */
  quickActions?: QuickAction[];
  /** Custom message renderer */
  renderMessage?: (message: SessionMessage, index: number) => ReactNode;
  /** Custom class name for the container */
  className?: string;
  /** Custom class name for messages area */
  messagesClassName?: string;
  /** Custom class name for input area */
  inputClassName?: string;
  /** Label for user messages */
  userLabel?: string;
  /** Label for assistant messages */
  assistantLabel?: string;
  /** Theme variant */
  variant?: "default" | "purple" | "orange";
  /** Whether to disable input */
  disabled?: boolean;
  /** Header content to display above messages */
  header?: ReactNode;
  /** Footer content to display below input */
  footer?: ReactNode;
}

/**
 * Get theme classes based on variant
 */
function getThemeClasses(variant: InteractiveSessionProps["variant"] = "default") {
  switch (variant) {
    case "purple":
      return {
        border: "border-purple-500/30",
        userBg: "bg-purple-600",
        assistantBg: "bg-muted/50",
        inputBorder: "border-purple-500/50 focus:border-purple-400",
        buttonBg: "bg-purple-600 hover:bg-purple-700",
        accent: "text-purple-400",
      };
    case "orange":
      return {
        border: "border-orange-500/30",
        userBg: "bg-orange-600",
        assistantBg: "bg-muted/50",
        inputBorder: "border-orange-500/50 focus:border-orange-400",
        buttonBg: "bg-orange-600 hover:bg-orange-700",
        accent: "text-orange-400",
      };
    default:
      return {
        border: "border-border",
        userBg: "bg-blue-600",
        assistantBg: "bg-muted/50",
        inputBorder: "border-border focus:border-primary",
        buttonBg: "bg-primary hover:bg-primary/90",
        accent: "text-primary",
      };
  }
}

/**
 * Default message renderer
 */
function DefaultMessage({
  message,
  userLabel = "You",
  assistantLabel = "Assistant",
  theme,
}: {
  message: SessionMessage;
  userLabel?: string;
  assistantLabel?: string;
  theme: ReturnType<typeof getThemeClasses>;
}) {
  // Don't render system messages (tool use) - we show those in the status bar
  if (message.role === "system") {
    return null;
  }

  // Don't render empty assistant messages (tool-only messages)
  if (message.role === "assistant" && !message.content?.trim()) {
    return null;
  }

  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg p-3",
          isUser ? `${theme.userBg} text-white` : `${theme.assistantBg} text-foreground`,
        )}
      >
        {!isUser && (
          <div className={cn("text-xs font-medium mb-1", theme.accent)}>{assistantLabel}</div>
        )}
        <div className="text-sm">
          {isUser ? (
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : (
            <Markdown>{message.content}</Markdown>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Tool status indicator - shows current tool and count
 */
function ToolStatus({
  currentTool,
  toolCount,
  theme,
}: {
  currentTool: string | null;
  toolCount: number;
  theme: ReturnType<typeof getThemeClasses>;
}) {
  if (!currentTool && toolCount === 0) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
      <Wrench className={cn("h-3 w-3", theme.accent)} />
      {currentTool ? (
        <span className="flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className={theme.accent}>{currentTool}</span>
        </span>
      ) : (
        <span>Idle</span>
      )}
      {toolCount > 0 && (
        <span className="ml-auto tabular-nums">
          {toolCount} tool{toolCount !== 1 ? "s" : ""} used
        </span>
      )}
    </div>
  );
}

/**
 * Streaming indicator
 */
function StreamingIndicator({ theme }: { theme: ReturnType<typeof getThemeClasses> }) {
  return (
    <div className="flex justify-start">
      <div className={cn("rounded-lg p-3", theme.assistantBg)}>
        <Loader2 className={cn("h-4 w-4 animate-spin", theme.accent)} />
      </div>
    </div>
  );
}

/**
 * Interactive Session Component
 */
export function InteractiveSession({
  messages,
  status,
  error,
  onSend,
  onStop,
  placeholder = "Type a message...",
  showToolUse = false,
  quickActions,
  renderMessage,
  className,
  messagesClassName,
  inputClassName,
  userLabel = "You",
  assistantLabel = "Assistant",
  variant = "default",
  disabled = false,
  header,
  footer,
}: InteractiveSessionProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const theme = getThemeClasses(variant);

  const isStreaming = status === "streaming" || status === "connecting";
  const canSend = !isStreaming && !disabled && input.trim().length > 0;
  const showQuickActions =
    quickActions && quickActions.length > 0 && !isStreaming && messages.length > 0;

  // Compute tool stats from messages
  const { currentTool, toolCount } = useMemo(() => {
    let count = 0;
    let lastTool: string | null = null;

    for (const msg of messages) {
      // Count tool uses from assistant messages
      if (msg.toolUses) {
        count += msg.toolUses.length;
        if (msg.toolUses.length > 0) {
          lastTool = msg.toolUses[msg.toolUses.length - 1].name;
        }
      }
      // Count system messages (which are tool use notifications)
      if (msg.role === "system" && msg.content.startsWith("Using tool:")) {
        count++;
        lastTool = msg.content.replace("Using tool: ", "");
      }
    }

    // Only show current tool if streaming
    return {
      currentTool: isStreaming ? lastTool : null,
      toolCount: count,
    };
  }, [messages, isStreaming]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
    }
  }, [input]);

  const handleSend = () => {
    if (!canSend) return;
    onSend(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = (action: QuickAction) => {
    onSend(action.message);
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      {header && <div className="shrink-0">{header}</div>}

      {/* Messages */}
      <ScrollableContainer
        scrollTrigger={messages}
        className={cn("flex-1 pr-2", messagesClassName)}
      >
        <div className="space-y-4 pb-4">
          {messages.map((message, index) =>
            renderMessage ? (
              renderMessage(message, index)
            ) : (
              <DefaultMessage
                key={message.id}
                message={message}
                userLabel={userLabel}
                assistantLabel={assistantLabel}
                theme={theme}
              />
            ),
          )}
          {isStreaming && !messages.some((m) => m.isPartial) && (
            <StreamingIndicator theme={theme} />
          )}
        </div>
      </ScrollableContainer>

      {/* Tool Status */}
      {showToolUse && (currentTool || toolCount > 0) && (
        <div className="shrink-0 mb-2">
          <ToolStatus currentTool={currentTool} toolCount={toolCount} theme={theme} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="shrink-0 bg-red-950/30 border border-red-500/50 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Quick Actions */}
      {showQuickActions && (
        <div className="shrink-0 flex flex-wrap gap-2 py-2">
          {quickActions!.map((action) => (
            <Button
              key={action.label}
              size="sm"
              variant={action.variant || "outline"}
              className={cn("border-opacity-50 hover:bg-opacity-20", theme.border)}
              onClick={() => handleQuickAction(action)}
            >
              {action.icon && <span className="mr-1">{action.icon}</span>}
              {action.label}
            </Button>
          ))}
        </div>
      )}

      {/* Input */}
      <div
        className={cn("shrink-0 flex gap-2 pt-3 border-t items-end", theme.border, inputClassName)}
      >
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isStreaming || disabled}
          className={cn(
            "flex-1 min-h-[40px] max-h-[150px] resize-none bg-black/30",
            theme.inputBorder,
          )}
          rows={1}
        />
        {isStreaming && onStop ? (
          <Button onClick={onStop} size="icon" variant="destructive" className="shrink-0">
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSend}
            disabled={!canSend}
            size="icon"
            className={cn("shrink-0", theme.buttonBg)}
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Footer */}
      {footer && <div className="shrink-0 mt-2">{footer}</div>}
    </div>
  );
}
