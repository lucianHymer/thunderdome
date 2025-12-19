/**
 * Unified Discovery API Endpoint
 *
 * POST /api/trials/:id/discovery - Handle both setup discovery AND consul conversations
 *
 * Mode: "setup" | "consul" (required in body)
 *
 * Actions:
 * - message: "__INIT__" - Start session (setup: exploration, consul: greeting)
 * - message: "user text" - Send user message to agent
 * - message: "__FINALIZE__" - Parse and save setup files (setup only)
 * - message: "__CANCEL__" - End session (setup only)
 */

import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { decrees, gladiators, judges, trials, users, verdicts } from "@/db/schema";
import { decrypt } from "@/lib/encryption";
import { requireUser } from "@/lib/session";
import { commitSetupFiles, extractSetupFiles, finalizeSetup } from "@/lib/setup/runner";
import {
  buildInteractiveSetupSystemPrompt,
  SETUP_DISCOVERY_PROMPT,
} from "@/lib/setup/prompts";
import {
  buildConsulSystemPromptWithTools,
  ensureConsulContainer,
} from "@/lib/trial/consul/runner";
import { buildConsulGreeting } from "@/lib/trial/consul/prompts";
import { createWordStreamResponse, streamTextToSSE } from "@/lib/streaming";
import { broadcastTrialUpdate } from "@/lib/trial/broadcast";
import { continueAfterSetup } from "@/lib/trial/code-battle/orchestrator";
import {
  destroyTrialContainer,
  getTrialContainer,
  startTrialContainer,
} from "@/lib/trial/container-service";
import type { AgentEvent } from "@/lib/docker/agent-client";
import type { ConsulContext } from "@/lib/trial/consul/runner";

interface Message {
  role: "user" | "assistant" | "consul";
  content: string;
}

type DiscoveryMode = "setup" | "consul";

// Session management
const sessions = new Map<string, { sessionId: string; mode: string }>();

const REPO_PATH = "/workspace/repo";

/**
 * POST - Unified handler for setup discovery and consul conversations
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id: trialId } = await params;
    const body = await request.json();
    const { mode, message, history = [] } = body as {
      mode: DiscoveryMode;
      message: string;
      history?: Message[];
    };

    if (!mode || !["setup", "consul"].includes(mode)) {
      return NextResponse.json({ error: "Invalid or missing mode parameter" }, { status: 400 });
    }

    // Get the trial and verify ownership
    const [trial] = await db.select().from(trials).where(eq(trials.id, trialId)).limit(1);

    if (!trial) {
      return NextResponse.json({ error: "Trial not found" }, { status: 404 });
    }

    if (trial.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get user's Claude token
    const [dbUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

    if (!dbUser?.claudeToken) {
      return NextResponse.json({ error: "Claude token not configured" }, { status: 400 });
    }

    const claudeToken = decrypt(dbUser.claudeToken);

    // === SETUP MODE ===
    if (mode === "setup") {
      if (!trial.repoUrl) {
        return NextResponse.json({ error: "Trial has no repository URL" }, { status: 400 });
      }

      // Handle finalize action
      if (message === "__FINALIZE__") {
        const sessionKey = `${trialId}-setup`;
        const session = sessions.get(sessionKey);
        if (!session) {
          return NextResponse.json({ error: "No active setup session" }, { status: 400 });
        }

        const conversationSummary = history
          .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
          .join("\n\n");

        const extractResult = await extractSetupFiles(
          trialId,
          conversationSummary,
          session.sessionId,
          claudeToken,
        );

        if (!extractResult.success || !extractResult.files) {
          return NextResponse.json(
            { error: extractResult.error || "Failed to extract setup files from conversation." },
            { status: 400 },
          );
        }

        const writeResult = await finalizeSetup(
          trialId,
          extractResult.files.setup_md,
          extractResult.files.setup_sh,
        );

        if (!writeResult.success) {
          return NextResponse.json({ error: writeResult.error }, { status: 500 });
        }

        await broadcastTrialUpdate(trialId, {
          type: "container_status",
          status: "committing",
          message: "Committing setup files to repository...",
        });

        const commitResult = await commitSetupFiles(trialId);

        if (!commitResult.success) {
          return NextResponse.json(
            { error: `Failed to commit setup files: ${commitResult.error}` },
            { status: 500 },
          );
        }

        await broadcastTrialUpdate(trialId, {
          type: "setup_complete",
          message: "Setup files committed to repository",
        });

        sessions.delete(sessionKey);

        continueAfterSetup(trialId, claudeToken).catch((error) => {
          broadcastTrialUpdate(trialId, {
            type: "error",
            phase: "setup",
            message: error instanceof Error ? error.message : "Failed to continue after setup",
          });
        });

        return NextResponse.json({
          success: true,
          message: "Setup files committed. Battle continuing...",
        });
      }

      // Handle cancel action
      if (message === "__CANCEL__") {
        const sessionKey = `${trialId}-setup`;
        sessions.delete(sessionKey);
        return NextResponse.json({ success: true, message: "Setup session cancelled" });
      }

      // Handle messaging - ensure container and session exist
      const sessionKey = `${trialId}-setup`;
      let session = sessions.get(sessionKey);
      let isNewSession = false;

      if (!session) {
        // Start container if needed
        let container = getTrialContainer(trialId);
        if (!container) {
          container = await startTrialContainer(trialId);
          await container.waitForAgentServer(60000);
        }

        // Create agent session
        const agentClient = container.getAgentClient();
        const sessionResult = await agentClient.createSession({
          systemPrompt: buildInteractiveSetupSystemPrompt(),
          tools: ["Read", "Glob", "Grep", "Bash"],
          model: "opus",
          cwd: REPO_PATH,
          maxTurns: 50,
          oauthToken: claudeToken,
        });

        session = { sessionId: sessionResult.sessionId, mode: "setup" };
        sessions.set(sessionKey, session);
        isNewSession = true;
      }

      // Build conversation prompt
      let conversationPrompt: string;
      if (message === "__INIT__") {
        conversationPrompt = SETUP_DISCOVERY_PROMPT(trial.repoUrl!, REPO_PATH);
      } else if (history.length > 0) {
        conversationPrompt = `${history
          .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
          .join("\n\n")}\n\nUser: ${message}`;
      } else {
        conversationPrompt = message;
      }

      // Stream setup response
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const container = getTrialContainer(trialId);
            if (!container) {
              throw new Error("Container not found");
            }

            const agentClient = container.getAgentClient();
            const toolUses: Array<{ id: string; name: string; input: unknown }> = [];

            await agentClient.sendMessage(
              session!.sessionId,
              conversationPrompt,
              claudeToken,
              (event: AgentEvent) => {
                if (event.event === "assistant") {
                  const data = event.data as { content?: string };
                  if (data.content) {
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({
                          type: "assistant",
                          content: { text: data.content, partial: true },
                        })}\n\n`,
                      ),
                    );
                  }
                }

                if (event.event === "tool_use") {
                  const data = event.data as { id?: string; tool?: string; input?: unknown };
                  if (data.tool) {
                    toolUses.push({
                      id: data.id || `tool_${Date.now()}`,
                      name: data.tool,
                      input: data.input,
                    });
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({
                          type: "tool_use",
                          data: { tool: data.tool, input: data.input },
                        })}\n\n`,
                      ),
                    );
                  }
                }

                if (event.event === "done") {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: "turn_complete",
                        toolUses: toolUses.length > 0 ? toolUses : undefined,
                      })}\n\n`,
                    ),
                  );
                }
              },
            );

            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (error) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  message: error instanceof Error ? error.message : "Failed to get response",
                })}\n\n`,
              ),
            );
            controller.close();
          }
        },
      });

      return new NextResponse(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // === CONSUL MODE ===
    if (mode === "consul") {
      // Load trial context
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

      if (!verdict) {
        return NextResponse.json({ error: "No verdict found for this trial" }, { status: 400 });
      }

      const context: ConsulContext = {
        trial: {
          id: trial.id,
          challengePrompt: trial.challengePrompt,
          repoUrl: trial.repoUrl,
          trialType: trial.trialType,
        },
        gladiators: trialGladiators.map((g) => ({
          id: g.id,
          name: g.name,
          persona: g.persona,
          responseContent: g.responseContent,
          branchName: g.branchName || "",
        })),
        judges: trialJudges.map((j) => ({
          id: j.id,
          name: j.name,
          focus: j.focus,
          evaluation: j.evaluation,
        })),
        verdict: {
          summary: verdict.summary,
          winnerGladiatorId: verdict.winnerGladiatorId,
          reasoning: verdict.reasoning,
        },
      };

      // Handle initialization - return greeting
      if (message === "__INIT__") {
        const greeting = buildConsulGreeting(context);
        const stream = createWordStreamResponse(greeting, 25);
        return new NextResponse(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }

      // Handle messaging - ensure container and session exist
      const sessionKey = `${trialId}-consul`;
      let session = sessions.get(sessionKey);

      if (!session && trial.repoUrl) {
        // Ensure consul container is set up
        await ensureConsulContainer(trialId, trial.repoUrl, user.id);

        // Create agent session
        const container = getTrialContainer(trialId);
        if (!container) {
          throw new Error("Failed to get consul container");
        }

        const agentClient = container.getAgentClient();
        const sessionResult = await agentClient.createSession({
          systemPrompt: buildConsulSystemPromptWithTools(context),
          tools: ["Bash", "Read", "Grep", "Glob"],
          model: "opus",
          cwd: REPO_PATH,
          maxTurns: 30,
          oauthToken: claudeToken,
        });

        session = { sessionId: sessionResult.sessionId, mode: "consul" };
        sessions.set(sessionKey, session);
      }

      if (!session) {
        return NextResponse.json({ error: "Failed to create consul session" }, { status: 500 });
      }

      // Build conversation context
      let conversationPrompt = message;
      if (history.length > 0) {
        conversationPrompt = `${history
          .map((msg: Message) => `${msg.role === "user" ? "User" : "Consul"}: ${msg.content}`)
          .join("\n\n")}\n\nUser: ${message}`;
      }

      // Stream consul response
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const container = getTrialContainer(trialId);
            if (!container) {
              throw new Error("Container not found");
            }

            const agentClient = container.getAgentClient();
            let fullResponse = "";

            await agentClient.sendMessage(
              session!.sessionId,
              conversationPrompt,
              claudeToken,
              async (event: AgentEvent) => {
                if (event.event === "assistant") {
                  const data = event.data as { content?: string };
                  if (data.content) {
                    fullResponse += data.content;
                    await streamTextToSSE(controller, encoder, data.content, 15);
                  }
                }
              },
            );

            // Store conversation
            await db.insert(decrees).values({
              trialId,
              actionType: "COMMENT",
              actionDetails: JSON.stringify({
                type: "consul_conversation",
                userMessage: message,
                consulResponse: fullResponse,
              }),
              consulConversation: JSON.stringify([
                ...history,
                { role: "user", content: message },
                { role: "consul", content: fullResponse },
              ]),
            });

            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (error) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  message:
                    error instanceof Error ? error.message : "Failed to get response from Consul",
                })}\n\n`,
              ),
            );
            controller.close();
          }
        },
      });

      return new NextResponse(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process request" },
      { status: 500 },
    );
  }
}
