/**
 * New Trial Form Component
 *
 * Form for creating a new trial with challenge prompt and type selection.
 */

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SetupDiscovery } from "@/components/setup/setup-discovery";
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

type SetupStatus = "unknown" | "checking" | "exists" | "missing" | "running";

export function NewTrialForm() {
  const router = useRouter();
  const [challengePrompt, setChallengePrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRepoSelector, setShowRepoSelector] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<Repository | undefined>();
  const [setupStatus, setSetupStatus] = useState<SetupStatus>("unknown");
  const [showSetupDiscovery, setShowSetupDiscovery] = useState(false);

  // Check if setup exists when repo is selected
  const checkSetup = useCallback(async (repo: Repository) => {
    setSetupStatus("checking");
    try {
      const [owner, repoName] = repo.fullName.split("/");
      const response = await fetch(`/api/repos/${owner}/${repoName}/setup`);
      const data = await response.json();
      setSetupStatus(data.exists ? "exists" : "missing");
    } catch {
      setSetupStatus("unknown");
    }
  }, []);

  // Check setup when repo changes
  useEffect(() => {
    if (selectedRepo) {
      checkSetup(selectedRepo);
    } else {
      setSetupStatus("unknown");
    }
  }, [selectedRepo, checkSetup]);

  const handleSetupComplete = () => {
    setShowSetupDiscovery(false);
    setSetupStatus("exists");
  };

  const handleSetupCancel = () => {
    setShowSetupDiscovery(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!challengePrompt.trim()) {
      setError("Please enter a challenge prompt");
      return;
    }

    // If repo is selected but setup is missing, show setup discovery
    if (selectedRepo && setupStatus === "missing") {
      setShowSetupDiscovery(true);
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

      const trialId = data.trial.id;

      // Auto-start the trial
      const startResponse = await fetch(`/api/trials/${trialId}/start`, {
        method: "POST",
      });

      if (!startResponse.ok) {
        const startData = await startResponse.json();
        throw new Error(startData.error || "Failed to start trial");
      }

      router.push(`/trials/${trialId}`);
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
            <>
              {/* Setup status badge */}
              {setupStatus === "checking" && (
                <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                  Checking setup...
                </span>
              )}
              {setupStatus === "exists" && (
                <span className="text-xs px-2 py-0.5 rounded bg-green-900 text-green-300">
                  Setup ready
                </span>
              )}
              {setupStatus === "missing" && (
                <span className="text-xs px-2 py-0.5 rounded bg-yellow-900 text-yellow-300">
                  Setup needed
                </span>
              )}
              <button
                type="button"
                onClick={() => setSelectedRepo(undefined)}
                className="text-xs text-red-400 hover:text-red-300"
              >
                ✕ Clear
              </button>
            </>
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

        {/* Setup Discovery UI */}
        {selectedRepo && setupStatus === "missing" && !showSetupDiscovery && (
          <div className="mt-3 border border-yellow-500/50 bg-yellow-950/20 rounded-lg p-4">
            <p className="text-sm text-yellow-200 mb-3">
              This repository needs setup discovery before starting a code battle. Claude will
              analyze the repo and create setup scripts.
            </p>
            <Button
              type="button"
              onClick={() => setShowSetupDiscovery(true)}
              variant="outline"
              className="border-yellow-500/50 text-yellow-300 hover:bg-yellow-950/50"
            >
              Run Setup Discovery
            </Button>
          </div>
        )}

        {/* Setup Discovery Modal/Panel */}
        {showSetupDiscovery && selectedRepo && (
          <div className="mt-3 border border-border rounded-lg p-4">
            <SetupDiscovery
              owner={selectedRepo.fullName.split("/")[0]}
              repo={selectedRepo.fullName.split("/")[1]}
              onComplete={handleSetupComplete}
              onCancel={handleSetupCancel}
            />
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
        disabled={
          isSubmitting ||
          !challengePrompt.trim() ||
          (selectedRepo && setupStatus === "checking") ||
          showSetupDiscovery
        }
        className="w-full bg-orange-600 hover:bg-orange-700"
        size="lg"
      >
        {isSubmitting
          ? "Creating Trial..."
          : selectedRepo && setupStatus === "missing"
            ? "Run Setup First"
            : "⚔️ Start Battle"}
      </Button>
    </form>
  );
}
