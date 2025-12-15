/**
 * Repository Selector Component
 *
 * Lists user's GitHub repositories with search/filter
 */

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

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

interface RepoSelectorProps {
  onSelect: (repo: Repository) => void;
  selectedRepo?: Repository;
}

export function RepoSelector({ onSelect, selectedRepo }: RepoSelectorProps) {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchRepos = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/github/repos");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch repositories");
      }

      const data = await response.json();
      setRepos(data.repos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch repositories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepos();
  }, []);

  // Filter repos based on search query
  const filteredRepos = repos.filter((repo) => {
    const query = searchQuery.toLowerCase();
    return (
      repo.name.toLowerCase().includes(query) ||
      repo.fullName.toLowerCase().includes(query) ||
      repo.description?.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Loading repositories...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-500 bg-red-950/30 rounded-lg p-4">
        <p className="text-red-400">{error}</p>
        <Button onClick={fetchRepos} variant="outline" size="sm" className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="search" className="text-sm font-medium">
          Search Repositories
        </Label>
        <input
          id="search"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name or description..."
          className="mt-1 w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {filteredRepos.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No repositories found</p>
        ) : (
          filteredRepos.map((repo) => {
            const isSelected = selectedRepo?.id === repo.id;
            return (
              <button
                key={repo.id}
                onClick={() => onSelect(repo)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  isSelected
                    ? "border-orange-500 bg-orange-950/30"
                    : "border-border hover:border-orange-500/50 hover:bg-muted"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono font-semibold text-sm truncate">{repo.fullName}</p>
                    {repo.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {repo.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {repo.language && (
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-orange-500" />
                          {repo.language}
                        </span>
                      )}
                      {repo.stars > 0 && <span>⭐ {repo.stars}</span>}
                      {repo.private && <span className="text-yellow-500">🔒 Private</span>}
                      {repo.fork && <span>🍴 Fork</span>}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {filteredRepos.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {filteredRepos.length} of {repos.length} repositories
        </p>
      )}
    </div>
  );
}
