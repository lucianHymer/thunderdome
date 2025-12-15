/**
 * New Trial Form Component
 *
 * Form for creating a new trial with challenge prompt and type selection.
 */

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RepoSelector } from "./repo-selector";

interface Repository {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  private: boolean;
  fork: boolean;
  language: string | null;
  stars: number;
  updatedAt: string;
  defaultBranch: string;
}

export function NewTrialForm() {
  const router = useRouter();
  const [challengePrompt, setChallengePrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRepoSelector, setShowRepoSelector] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<Repository | undefined>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!challengePrompt.trim()) {
      setError("Please enter a challenge prompt");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/trials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengePrompt,
          ...(selectedRepo && { repoUrl: selectedRepo.url }),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create trial");
      }

      router.push(`/trials/${data.trial.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trial");
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <Label htmlFor="challenge" className="text-lg font-semibold">
          Challenge Prompt
        </Label>
        <p className="text-sm text-muted-foreground mb-2">
          Describe the coding challenge for the AI gladiators to complete
        </p>
        <Textarea
          id="challenge"
          value={challengePrompt}
          onChange={(e) => setChallengePrompt(e.target.value)}
          placeholder="e.g., Implement a function that validates email addresses using regex..."
          className="min-h-[200px] font-mono"
          disabled={isSubmitting}
        />
      </div>

      <div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRepoSelector(!showRepoSelector)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className={`transition-transform ${showRepoSelector ? "rotate-90" : ""}`}>▶</span>
            <span>
              {selectedRepo ? `Repository: ${selectedRepo.fullName}` : "Add Repository (Optional)"}
            </span>
          </button>
          {selectedRepo && (
            <button
              type="button"
              onClick={() => setSelectedRepo(undefined)}
              className="text-xs text-red-400 hover:text-red-300"
            >
              ✕ Clear
            </button>
          )}
        </div>
        {showRepoSelector && (
          <div className="mt-3 border border-border rounded-lg p-4">
            <p className="text-sm text-muted-foreground mb-3">
              Select a repository for Code Battle mode. Gladiators will be able to modify code and
              create branches.
            </p>
            <RepoSelector onSelect={setSelectedRepo} selectedRepo={selectedRepo} />
          </div>
        )}
      </div>

      {error && (
        <div className="border border-red-500 bg-red-950/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      <Button
        type="submit"
        disabled={isSubmitting || !challengePrompt.trim()}
        className="w-full bg-orange-600 hover:bg-orange-700"
        size="lg"
      >
        {isSubmitting ? "Creating Trial..." : "⚔️ Start Battle"}
      </Button>
    </form>
  );
}
