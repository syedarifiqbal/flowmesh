const BASE_DELAY_MS = 200
const MAX_DELAY_MS = 5000

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

export async function withRetry<T>(
  fn: () => Promise<{ status: number; body: T }>,
  maxRetries: number,
): Promise<T> {
  let attempt = 0

  while (true) {
    const result = await fn()

    if (!isRetryable(result.status)) {
      if (result.status >= 400) {
        const err = new Error(`FlowMesh request failed with status ${result.status}`) as Error & { status: number }
        err.status = result.status
        throw err
      }
      return result.body
    }

    attempt++
    if (attempt >= maxRetries) {
      const err = new Error(`FlowMesh request failed with status ${result.status} after ${maxRetries} attempts`) as Error & { status: number }
      err.status = result.status
      throw err
    }

    const backoff = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS)
    await delay(backoff)
  }
}
