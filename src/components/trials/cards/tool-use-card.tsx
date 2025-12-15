/**
 * Tool Use Card
 *
 * Collapsible card showing tool invocations from gladiator streams.
 */

"use client";

import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface ToolUseCardProps {
  toolName: string;
  input?: any;
  output?: string;
  isExpanded?: boolean;
}

const toolIcons: Record<string, string> = {
  bash: "🔧",
  Bash: "🔧",
  read: "📄",
  Read: "📄",
  edit: "✏️",
  Edit: "✏️",
  write: "📝",
  Write: "📝",
  glob: "🔍",
  Glob: "🔍",
  grep: "🔎",
  Grep: "🔎",
  list: "📂",
  default: "⚙️",
};

const toolColors: Record<string, string> = {
  bash: "border-orange-500/30 bg-orange-950/20",
  Bash: "border-orange-500/30 bg-orange-950/20",
  read: "border-blue-500/30 bg-blue-950/20",
  Read: "border-blue-500/30 bg-blue-950/20",
  edit: "border-yellow-500/30 bg-yellow-950/20",
  Edit: "border-yellow-500/30 bg-yellow-950/20",
  write: "border-green-500/30 bg-green-950/20",
  Write: "border-green-500/30 bg-green-950/20",
  glob: "border-purple-500/30 bg-purple-950/20",
  Glob: "border-purple-500/30 bg-purple-950/20",
  grep: "border-pink-500/30 bg-pink-950/20",
  Grep: "border-pink-500/30 bg-pink-950/20",
  default: "border-muted bg-muted/20",
};

function getToolIcon(name: string): string {
  return toolIcons[name] || toolIcons.default;
}

function getToolColor(name: string): string {
  return toolColors[name] || toolColors.default;
}

function formatInput(input: any): string {
  if (!input) return "";
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function truncate(str: string, maxLength: number = 100): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "...";
}

export function ToolUseCard({
  toolName,
  input,
  output,
  isExpanded: defaultExpanded = false,
}: ToolUseCardProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);
  const formattedInput = formatInput(input);
  const preview = getPreview(toolName, input);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className={cn("rounded-lg border transition-all duration-200", getToolColor(toolName))}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors rounded-lg"
          >
            <span>{getToolIcon(toolName)}</span>
            <span className="font-mono text-sm text-muted-foreground">{toolName}</span>
            {preview && (
              <span className="text-xs text-muted-foreground/70 truncate flex-1">{preview}</span>
            )}
            <span
              className={cn(
                "text-muted-foreground transition-transform text-xs",
                isOpen && "rotate-90",
              )}
            >
              ▶
            </span>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-2">
            {/* Input */}
            {formattedInput && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Input</span>
                <pre className="text-xs font-mono bg-black/50 text-gray-200 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
                  {formattedInput}
                </pre>
              </div>
            )}

            {/* Output */}
            {output && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Output</span>
                <pre className="text-xs font-mono bg-black/50 text-gray-200 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
                  {output}
                </pre>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function getPreview(toolName: string, input: any): string | null {
  if (!input) return null;

  const lowerName = toolName.toLowerCase();

  if (lowerName === "bash" && input.command) {
    return truncate(input.command, 60);
  }
  if (lowerName === "read" && input.file_path) {
    return truncate(input.file_path, 60);
  }
  if (lowerName === "edit" && input.file_path) {
    return truncate(input.file_path, 60);
  }
  if (lowerName === "write" && input.file_path) {
    return truncate(input.file_path, 60);
  }
  if (lowerName === "glob" && input.pattern) {
    return truncate(input.pattern, 60);
  }
  if (lowerName === "grep" && input.pattern) {
    return truncate(input.pattern, 60);
  }

  return null;
}

/**
 * Renders a list of tool uses with proper spacing
 */
interface ToolUseListProps {
  tools: Array<{
    name: string;
    input?: any;
    output?: string;
  }>;
}

export function ToolUseList({ tools }: ToolUseListProps) {
  if (tools.length === 0) return null;

  return (
    <div className="space-y-2">
      {tools.map((tool, index) => (
        <ToolUseCard
          key={`${tool.name}-${index}`}
          toolName={tool.name}
          input={tool.input}
          output={tool.output}
        />
      ))}
    </div>
  );
}
