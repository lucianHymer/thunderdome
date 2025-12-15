/**
 * GitHub Repositories API
 *
 * GET /api/github/repos - Fetch user's GitHub repositories
 */

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { db } from '@/db';
import { users, accounts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * GitHub repository response type
 */
interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  private: boolean;
  fork: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  stargazers_count: number;
  language: string | null;
  default_branch: string;
}

/**
 * GET - Fetch user's GitHub repositories
 */
export async function GET() {
  try {
    const user = await requireUser();

    // Get the user's GitHub access token from accounts table
    const [account] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, user.id), eq(accounts.provider, 'github')))
      .limit(1);

    if (!account?.access_token) {
      return NextResponse.json(
        { error: 'GitHub access token not found. Please reconnect your GitHub account.' },
        { status: 401 }
      );
    }

    // Fetch repositories from GitHub API
    const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
      headers: {
        Authorization: `Bearer ${account.access_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GitHub API error:', response.status, errorText);

      if (response.status === 401) {
        return NextResponse.json(
          { error: 'GitHub token is invalid or expired. Please reconnect your GitHub account.' },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to fetch repositories from GitHub' },
        { status: response.status }
      );
    }

    const repos: GitHubRepo[] = await response.json();

    // Transform to simpler format for frontend
    const transformedRepos = repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      url: repo.html_url,
      private: repo.private,
      fork: repo.fork,
      language: repo.language,
      stars: repo.stargazers_count,
      updatedAt: repo.updated_at,
      defaultBranch: repo.default_branch,
    }));

    return NextResponse.json({ repos: transformedRepos });
  } catch (error) {
    console.error('Error fetching GitHub repos:', error);
    return NextResponse.json(
      { error: 'Failed to fetch repositories' },
      { status: 500 }
    );
  }
}
