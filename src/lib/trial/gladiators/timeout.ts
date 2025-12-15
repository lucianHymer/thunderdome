/**
 * Timeout utilities for gladiator execution
 *
 * Provides timeout handling for promises and async generators
 * to prevent gladiators from running indefinitely.
 */

/**
 * Error thrown when a timeout occurs
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Wraps a promise with a timeout
 *
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param errorMessage - Custom error message
 * @returns The promise result or throws TimeoutError
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   fetchData(),
 *   5000,
 *   'Data fetch timed out'
 * );
 * ```
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage?: string,
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(errorMessage || `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Wraps an async generator with a timeout for each yielded value
 *
 * If no value is yielded within the timeout period, throws TimeoutError.
 * This allows for streaming with per-event timeout rather than total timeout.
 *
 * @param generator - The async generator to wrap
 * @param timeoutMs - Timeout in milliseconds per yielded value
 * @param errorMessage - Custom error message
 * @yields Values from the wrapped generator
 * @returns The final return value from the generator
 *
 * @example
 * ```typescript
 * async function* slowStream() {
 *   yield 1;
 *   await sleep(100);
 *   yield 2;
 * }
 *
 * for await (const val of withStreamTimeout(slowStream(), 50)) {
 *   console.log(val); // Throws TimeoutError before yielding 2
 * }
 * ```
 */
export async function* withStreamTimeout<T, TReturn = any>(
  generator: AsyncGenerator<T, TReturn, unknown>,
  timeoutMs: number,
  errorMessage?: string,
): AsyncGenerator<T, TReturn, unknown> {
  let timeoutId: NodeJS.Timeout | undefined;
  let isDone = false;
  let finalReturn: TReturn | undefined;

  try {
    while (!isDone) {
      // Create a timeout promise for the next value
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new TimeoutError(
              errorMessage || `Stream timed out waiting for next value after ${timeoutMs}ms`,
            ),
          );
        }, timeoutMs);
      });

      // Race between next value and timeout
      const nextPromise = generator.next();
      const result = await Promise.race([nextPromise, timeoutPromise]);

      // Clear the timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }

      if (result.done) {
        isDone = true;
        finalReturn = result.value as TReturn;
      } else {
        yield result.value;
      }
    }

    return finalReturn!;
  } catch (error) {
    // Clean up timeout on error
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Try to clean up the generator
    try {
      await generator.return(undefined as any);
    } catch {
      // Ignore cleanup errors
    }

    throw error;
  } finally {
    // Ensure timeout is cleared
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Wraps an async generator with a total timeout
 *
 * Unlike withStreamTimeout, this enforces a total time limit for the entire
 * generator execution, not per-value.
 *
 * @param generator - The async generator to wrap
 * @param timeoutMs - Total timeout in milliseconds
 * @param errorMessage - Custom error message
 * @yields Values from the wrapped generator
 * @returns The final return value from the generator
 */
export async function* withTotalTimeout<T, TReturn = any>(
  generator: AsyncGenerator<T, TReturn, unknown>,
  timeoutMs: number,
  errorMessage?: string,
): AsyncGenerator<T, TReturn, unknown> {
  const startTime = Date.now();
  let finalReturn: TReturn | undefined;

  try {
    for await (const value of generator) {
      // Check if we've exceeded the timeout
      if (Date.now() - startTime > timeoutMs) {
        throw new TimeoutError(errorMessage || `Stream exceeded total timeout of ${timeoutMs}ms`);
      }

      yield value;
    }

    // Generator completed successfully
    return finalReturn!;
  } catch (error) {
    // Try to clean up the generator
    try {
      await generator.return(undefined as any);
    } catch {
      // Ignore cleanup errors
    }

    throw error;
  }
}
