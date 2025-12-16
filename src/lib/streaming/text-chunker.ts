/**
 * Text Chunking Utilities for Smooth SSE Streaming
 *
 * Provides functions to re-chunk text for smoother display in SSE streams.
 * Instead of sending large chunks that appear all at once, these utilities
 * break text into smaller pieces (words) for a natural typing feel.
 */

/**
 * Splits text into tokens (words + whitespace preserved)
 */
export function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter(Boolean);
}

/**
 * Creates an async generator that yields text tokens with delays.
 * Use this to re-chunk text for smoother SSE streaming.
 *
 * @param text - The text to stream
 * @param delayMs - Delay between tokens in milliseconds (default: 20)
 */
export async function* streamTextTokens(
  text: string,
  delayMs: number = 20,
): AsyncGenerator<string, void, unknown> {
  const tokens = tokenize(text);
  for (const token of tokens) {
    yield token;
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }
}

/**
 * Streams text to an SSE controller word-by-word
 *
 * @param controller - ReadableStream controller
 * @param encoder - TextEncoder instance
 * @param text - Text to stream
 * @param delayMs - Delay between words (default: 20)
 */
export async function streamTextToSSE(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  text: string,
  delayMs: number = 20,
): Promise<void> {
  for await (const token of streamTextTokens(text, delayMs)) {
    const data = JSON.stringify({ type: "content", text: token });
    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
  }
}

/**
 * Creates an SSE-formatted ReadableStream that yields text word-by-word
 *
 * @param text - The text to stream
 * @param delayMs - Delay between words (default: 20)
 */
export function createWordStreamResponse(text: string, delayMs: number = 20): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      await streamTextToSSE(controller, encoder, text, delayMs);
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
