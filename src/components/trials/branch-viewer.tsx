"use client";

/**
 * Branch Viewer Component
 *
 * Shows gladiator branches with GitHub links and PR creation
 */

import { ExternalLink, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface BranchViewerProps {
  repoUrl: string;
  gladiators: Array<{
    id: string;
    name: string;
    branchName: string | null;
    status: string;
  }>;
  winnerId: string | null;
}

export function BranchViewer({ repoUrl, gladiators, winnerId }: BranchViewerProps) {
  // Parse repo URL to build GitHub links
  const repoPath = new URL(repoUrl).pathname.slice(1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Code Branches
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {gladiators.map((g) => (
            <div
              key={g.id}
              className={`flex items-center justify-between p-2 rounded border ${
                g.id === winnerId ? "border-yellow-500 bg-yellow-500/10" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span>{g.name}</span>
                {g.id === winnerId && <span>⭐</span>}
              </div>

              {g.branchName && (
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`https://github.com/${repoPath}/tree/${g.branchName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View Branch <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t">
          <p className="text-sm text-muted-foreground mb-2">Quick actions:</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a
                href={`https://github.com/${repoPath}/branches/all?query=thunderdome`}
                target="_blank"
              >
                View All Trial Branches
              </a>
            </Button>
            {winnerId && (
              <Button size="sm" asChild>
                <a
                  href={`https://github.com/${repoPath}/compare/main...${
                    gladiators.find((g) => g.id === winnerId)?.branchName
                  }`}
                  target="_blank"
                >
                  Create PR for Winner
                </a>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
