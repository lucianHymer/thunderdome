/**
 * Export Report Endpoint
 *
 * GET /api/trials/:id/export - Generate markdown report for trial results
 */

import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { gladiators, judges, trials, verdicts } from "@/db/schema";
import { requireUser } from "@/lib/session";

/**
 * GET - Export trial results as markdown report
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id: trialId } = await params;

    // Get the trial and verify ownership
    const [trial] = await db.select().from(trials).where(eq(trials.id, trialId)).limit(1);

    if (!trial) {
      return NextResponse.json({ error: "Trial not found" }, { status: 404 });
    }

    if (trial.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Load all trial data
    const trialGladiators = await db
      .select()
      .from(gladiators)
      .where(eq(gladiators.trialId, trialId));

    const trialJudges = await db.select().from(judges).where(eq(judges.trialId, trialId));

    const [verdict] = await db
      .select()
      .from(verdicts)
      .where(eq(verdicts.trialId, trialId))
      .limit(1);

    // Generate markdown report
    const report = generateMarkdownReport({
      trial,
      gladiators: trialGladiators,
      judges: trialJudges,
      verdict: verdict || null,
    });

    // Return as downloadable file
    return new NextResponse(report, {
      headers: {
        "Content-Type": "text/markdown",
        "Content-Disposition": `attachment; filename="trial-${trialId}-report.md"`,
      },
    });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}

/**
 * Generate a comprehensive markdown report of trial results
 */
function generateMarkdownReport(data: {
  trial: any;
  gladiators: any[];
  judges: any[];
  verdict: any | null;
}): string {
  const { trial, gladiators, judges, verdict } = data;

  const sections: string[] = [];

  // Header
  sections.push("# Thunderdome Trial Report\n");
  sections.push(`**Trial ID**: ${trial.id}`);
  sections.push(`**Repository**: ${trial.repoUrl}`);
  sections.push(`**Type**: ${trial.trialType}`);
  sections.push(`**Status**: ${trial.status}`);
  sections.push(`**Created**: ${trial.createdAt?.toISOString() || "N/A"}`);
  sections.push(`**Completed**: ${trial.completedAt?.toISOString() || "N/A"}\n`);

  // Challenge
  sections.push("## The Challenge\n");
  sections.push(trial.challengePrompt);
  sections.push("\n---\n");

  // Verdict
  if (verdict) {
    sections.push("## Verdict\n");
    sections.push(`**Summary**: ${verdict.summary}\n`);

    if (verdict.winnerGladiatorId) {
      const winner = gladiators.find((g) => g.id === verdict.winnerGladiatorId);
      sections.push(`**Winner**: ${winner?.name || "Unknown"} 👑\n`);
    } else {
      sections.push("**Winner**: No clear winner\n");
    }

    sections.push("### Reasoning\n");
    sections.push(verdict.reasoning);
    sections.push("\n---\n");
  }

  // Gladiators
  sections.push("## Gladiator Responses\n");
  gladiators.forEach((gladiator, index) => {
    const isWinner = verdict?.winnerGladiatorId === gladiator.id;

    sections.push(`### ${index + 1}. ${gladiator.name}${isWinner ? " 👑" : ""}\n`);
    sections.push(`**Persona**: ${gladiator.persona}`);
    sections.push(`**Model**: ${gladiator.model}`);
    sections.push(`**Branch**: ${gladiator.branchName}`);
    sections.push(`**Status**: ${gladiator.status}\n`);

    sections.push("#### Response\n");
    sections.push("```");
    sections.push(gladiator.responseContent || "No response available");
    sections.push("```\n");
  });

  sections.push("---\n");

  // Judge Evaluations
  sections.push("## Judge Evaluations\n");
  judges.forEach((judge, index) => {
    sections.push(`### ${index + 1}. ${judge.name}\n`);
    sections.push(`**Focus**: ${judge.focus}`);
    sections.push(`**Model**: ${judge.model}\n`);

    if (judge.evaluation) {
      try {
        const parsed = JSON.parse(judge.evaluation);

        if (parsed.summary) {
          sections.push(`**Summary**: ${parsed.summary}\n`);
        }

        if (parsed.evaluations && Array.isArray(parsed.evaluations)) {
          sections.push("#### Evaluations\n");

          parsed.evaluations.forEach((evalData: any) => {
            const gladiator = gladiators.find((g) => g.id === evalData.gladiatorId);
            sections.push(`##### ${gladiator?.name || "Unknown"}: ${evalData.score}/10\n`);

            if (evalData.strengths && evalData.strengths.length > 0) {
              sections.push("**Strengths**:");
              evalData.strengths.forEach((s: string) => {
                sections.push(`- ${s}`);
              });
              sections.push("");
            }

            if (evalData.weaknesses && evalData.weaknesses.length > 0) {
              sections.push("**Weaknesses**:");
              evalData.weaknesses.forEach((w: string) => {
                sections.push(`- ${w}`);
              });
              sections.push("");
            }

            if (evalData.comments) {
              sections.push(`**Comments**: ${evalData.comments}\n`);
            }
          });
        }
      } catch {
        // If not JSON, show raw evaluation
        sections.push("#### Evaluation\n");
        sections.push("```");
        sections.push(judge.evaluation);
        sections.push("```\n");
      }
    } else {
      sections.push("*No evaluation available*\n");
    }
  });

  sections.push("---\n");

  // Footer
  sections.push("## About Thunderdome\n");
  sections.push(
    "This report was generated by Thunderdome, an AI gladiator battle system where AI agents compete to complete coding challenges.",
  );
  sections.push(
    "\nEach gladiator is an AI with a unique persona and toolset. Judges evaluate their performance, and a verdict determines the winner.",
  );

  return sections.join("\n");
}
