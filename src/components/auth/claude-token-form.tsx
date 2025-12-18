"use client";

/**
 * Claude Token Form Component
 *
 * Client component for managing Claude API token.
 * Allows users to save or remove their token.
 */

import { useState } from "react";

interface ClaudeTokenFormProps {
  hasToken: boolean;
}

export function ClaudeTokenForm({ hasToken: initialHasToken }: ClaudeTokenFormProps) {
  const [token, setToken] = useState("");
  const [hasToken, setHasToken] = useState(initialHasToken);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/settings/claude-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (response.ok) {
        setMessage({ type: "success", text: "Token saved successfully" });
        setToken("");
        setHasToken(true);
      } else {
        const data = await response.json();
        setMessage({ type: "error", text: data.error || "Failed to save token" });
      }
    } catch (_error) {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm("Are you sure you want to remove your Claude API token?")) {
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/settings/claude-token", {
        method: "DELETE",
      });

      if (response.ok) {
        setMessage({ type: "success", text: "Token removed successfully" });
        setHasToken(false);
      } else {
        const data = await response.json();
        setMessage({ type: "error", text: data.error || "Failed to remove token" });
      }
    } catch (_error) {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={`p-3 rounded ${
            message.type === "success"
              ? "bg-green-900/50 text-green-300 border border-green-700"
              : "bg-red-900/50 text-red-300 border border-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {hasToken ? (
        <div className="space-y-4">
          <div className="p-3 bg-green-900/30 border border-green-700 rounded">
            <p className="text-sm text-green-400">✓ Claude API token is configured</p>
          </div>
          <button
            onClick={handleRemove}
            disabled={loading}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Removing..." : "Remove Token"}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label htmlFor="token" className="block text-sm font-medium mb-2 text-gray-200">
              Claude API Token
            </label>
            <input
              type="password"
              id="token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              required
              disabled={loading}
            />
            <p className="text-sm text-gray-400 mt-1">
              Get your token from{" "}
              <a
                href="https://console.anthropic.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-400 hover:text-orange-300 hover:underline"
              >
                Anthropic Console
              </a>
            </p>
          </div>
          <button
            type="submit"
            disabled={loading || !token}
            className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Saving..." : "Save Token"}
          </button>
        </form>
      )}
    </div>
  );
}
