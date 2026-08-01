/**
 * Running one write, and being honest about the three ways it can end.
 *
 * `useResource` covers reads. A write needs different answers: it is not running until somebody
 * asks, only one may be in flight at a time, and its failure belongs beside the control that
 * caused it rather than in place of the page.
 *
 * ── Why `busy` is not merely cosmetic here ────────────────────────────────────────────────────
 *
 * Two of this app's three writes commit something that cannot be taken back. `POST /v1/bots`
 * creates a bot with an allocation (`trade/src/server.ts:526`), and `POST /v1/bots/:id/actions`
 * with `action: "start"` **reserves that allocation at the ledger** before the status changes
 * (`trade/src/bots.ts:566-579`) — a real hold on a real balance. `POST /v1/backtests` spends no
 * money but does queue a job (`trade/src/server.ts:457-462`).
 *
 * Unlike mint, trade does not rely on a state machine to make a double click survivable: it
 * requires an `Idempotency-Key` on all three (`trade/src/server.ts:775-783`). That header is what
 * makes a RETRY safe. It is not what makes a double click safe, because the second click of a
 * double click is a new intent as far as this bundle is concerned — so the hook still refuses to
 * start a second run while one is in flight, and the buttons read the same flag so they are
 * DISABLED rather than merely ignored.
 */
import { useCallback, useRef, useState } from 'react'
import { noticeFor, type ErrorNotice } from './api.ts'
import { keepKeyAfter, newIdempotencyKey } from './idempotency.ts'

export interface Mutation<A extends unknown[], T> {
  readonly busy: boolean
  readonly error: ErrorNotice | null
  /** The last successful result, kept so a 202 acceptance can be rendered after the fact. */
  readonly result: T | null
  readonly run: (...args: A) => Promise<T | null>
  readonly reset: () => void
}

export function useMutation<A extends unknown[], T>(
  fn: (...args: A) => Promise<T>,
  fallbackMessage: string,
): Mutation<A, T> {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorNotice | null>(null)
  const [result, setResult] = useState<T | null>(null)

  const run = useCallback(
    async (...args: A): Promise<T | null> => {
      // Read from state rather than a ref on purpose: React batches the `setBusy(true)` below
      // before the next click can be processed, and a ref here would make this hook's behaviour
      // depend on scheduling rather than on state anybody can see.
      if (busy) return null
      setBusy(true)
      setError(null)
      try {
        const value = await fn(...args)
        setResult(value)
        return value
      } catch (err) {
        setError(noticeFor(err, fallbackMessage))
        return null
      } finally {
        setBusy(false)
      }
    },
    [busy, fn, fallbackMessage],
  )

  const reset = useCallback(() => {
    setError(null)
    setResult(null)
  }, [])

  return { busy, error, result, run, reset }
}

/**
 * The same, for a write that must carry an `Idempotency-Key`.
 *
 * `fn` receives the key as its FIRST argument rather than minting one itself, because the whole
 * question is when a key may be presented twice and a function that mints its own can only ever
 * answer "never" — which is the answer that reserves a bot's capital a second time after a
 * timeout.
 *
 * The lifecycle, in three lines:
 *
 *   * no key held → mint one;
 *   * the attempt ends with the outcome UNKNOWN (transport failure, 5xx, `idempotency_in_flight`)
 *     → keep it, so the retry is a replay rather than a repeat (`keepKeyAfter`, and the reasoning
 *     in `src/lib/idempotency.ts`);
 *   * the attempt ends with the outcome KNOWN, success or refusal alike → drop it, so the next
 *     intent is a new one and an edited payload cannot collide with the old fingerprint
 *     (`trade/src/idempotency.ts:151`).
 *
 * `reset()` drops the key too: it is what a screen calls when the user abandons the attempt.
 */
export function useIdempotentMutation<A extends unknown[], T>(
  fn: (idempotencyKey: string, ...args: A) => Promise<T>,
  fallbackMessage: string,
): Mutation<A, T> {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorNotice | null>(null)
  const [result, setResult] = useState<T | null>(null)
  // A ref, deliberately: the key must be readable by the very next call without waiting for a
  // render, and it is never displayed, so nothing renders from it.
  const key = useRef<string | null>(null)

  const run = useCallback(
    async (...args: A): Promise<T | null> => {
      if (busy) return null
      setBusy(true)
      setError(null)
      const attempt = key.current ?? newIdempotencyKey()
      key.current = attempt
      try {
        const value = await fn(attempt, ...args)
        key.current = null
        setResult(value)
        return value
      } catch (err) {
        if (!keepKeyAfter(err)) key.current = null
        setError(noticeFor(err, fallbackMessage))
        return null
      } finally {
        setBusy(false)
      }
    },
    [busy, fn, fallbackMessage],
  )

  const reset = useCallback(() => {
    key.current = null
    setError(null)
    setResult(null)
  }, [])

  return { busy, error, result, run, reset }
}
