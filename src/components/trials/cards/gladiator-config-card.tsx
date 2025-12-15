/**
 * Gladiator Config Card
 *
 * Displays a designed gladiator's configuration from the Lanista phase.
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface GladiatorDesign {
  id?: string;
  name: string;
  persona: string;
  model: string;
  temperature: number;
  tools: string[];
  branchName?: string;
}

interface GladiatorConfigCardProps {
  gladiator: GladiatorDesign;
  index: number;
}

const modelColors: Record<string, string> = {
  opus: "bg-purple-500/20 text-purple-400 border-purple-500/50",
  sonnet: "bg-blue-500/20 text-blue-400 border-blue-500/50",
  haiku: "bg-green-500/20 text-green-400 border-green-500/50",
};

function getModelColor(model: string): string {
  const modelLower = model.toLowerCase();
  if (modelLower.includes("opus")) return modelColors.opus;
  if (modelLower.includes("sonnet")) return modelColors.sonnet;
  if (modelLower.includes("haiku")) return modelColors.haiku;
  return "bg-muted text-muted-foreground";
}

function getModelDisplayName(model: string): string {
  const modelLower = model.toLowerCase();
  if (modelLower.includes("opus")) return "Opus";
  if (modelLower.includes("sonnet")) return "Sonnet";
  if (modelLower.includes("haiku")) return "Haiku";
  return model;
}

export function GladiatorConfigCard({ gladiator, index }: GladiatorConfigCardProps) {
  return (
    <Card
      className={cn(
        "border-yellow-500/20 bg-yellow-950/10 transition-all duration-300",
        "animate-fadeIn",
      )}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span>⚔️</span>
            <span className="text-yellow-400">{gladiator.name}</span>
          </span>
          <Badge className={cn("text-xs border", getModelColor(gladiator.model))}>
            {getModelDisplayName(gladiator.model)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground italic">"{gladiator.persona}"</p>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-muted/30 rounded px-2 py-1">
            <span className="text-muted-foreground">Temperature:</span>{" "}
            <span className="text-foreground font-mono">
              {typeof gladiator.temperature === "number" && gladiator.temperature > 1
                ? (gladiator.temperature / 100).toFixed(2)
                : gladiator.temperature}
            </span>
          </div>
          <div className="bg-muted/30 rounded px-2 py-1">
            <span className="text-muted-foreground">Tools:</span>{" "}
            <span className="text-foreground">{gladiator.tools?.length || 0}</span>
          </div>
        </div>

        {gladiator.tools && gladiator.tools.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {gladiator.tools.map((tool) => (
              <Badge key={tool} variant="outline" className="text-xs bg-muted/20 border-muted">
                {tool}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
