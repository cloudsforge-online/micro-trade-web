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
 * creates a bot with an allocation (`trade/src/server.ts:591`), and `POST /v1/bots/:id/actions`
 * with `action: "start"` **reserves that allocation at the ledger** before the status changes
 * (`trade/src/bots.ts:566-579`) — a real hold on a real balance. `POST /v1/backtests` spends no
 * money but does queue a job (`trade/src/server.ts:522-527`).
 *
 * Unlike mint, trade does not rely on a state machine to make a double click survivable: it
 * requires an `Idempotency-Key` on all three (`trade/src/server.ts:840-848`). That header is what
 * makes a RETRY safe. It is not what makes a double click safe, because the second click of a
 * double click is a new intent as far as this bundle is concerned — so the hook still refuses to
 * start a second run while one is in flight, and the buttons read the same flag so they are
 * DISABLED rather than merely ignored.
 *
 * ── The latch is a REF, and the flag is state. They are not the same mechanism ─────────────────
 *
 * Both hooks below hold TWO things: a `busy` state, which is what the buttons read, and a `running`
 * ref, which is what actually refuses the second run. That looks redundant and is not, because the
 * two answer at different times.
 *
 * A guard written as state cannot see a second event in the same tick. `setBusy(true)` SCHEDULES a
 * render; it does not change the `busy` that the already-created handler closed over, and React
 * does not re-render between two events dispatched with no scheduling boundary between them. So
 * both handlers read `busy === false` out of their own render closure and both proceed. The
 * `disabled` attribute has exactly the same hole: it is not on the DOM node until the render
 * COMMITS, and there has been no commit. Both defences are one render behind the events they are
 * supposed to stop.
 *
 * This file used to argue the opposite, in a comment on the line that had the bug: that React
 * "batches the `setBusy(true)` below before the next click can be processed, and a ref here would
 * make this hook's behaviour depend on scheduling rather than on state anybody can see". Batching
 * is what causes this, not what prevents it — it is precisely because the two updates are batched
 * that neither handler sees the other's. `test/same-tick.test.ts` fires the two events with
 * nothing awaited between them, and against the state-only guard every one of the three money
 * paths sent TWO requests.
 *
 * The ref is set and cleared SYNCHRONOUSLY — taken before the first `await`, released in a
 * `finally` — so there is no window in which a second call can read it as free. The release is in
 * a `finally` because a latch that is not given back after a failure is a control that is dead for
 * the life of the page, on a screen about money the customer has already committed.
 *
 * `busy` stays, and every `disabled` stays with it. The ref is the correctness guarantee; the
 * state is the affordance, and a control that silently swallows presses with no sign it is working
 * is its own defect.
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
  // The latch. See the header: `busy` is one render behind the events it would have to stop, and
  // this is not.
  const running = useRef(false)

  const run = useCallback(
    async (...args: A): Promise<T | null> => {
      // Taken before the first `await`, so two calls in one tick cannot both pass it.
      if (running.current) return null
      running.current = true
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
        // Released here and nowhere else: a latch kept after a failure is a dead control.
        running.current = false
        setBusy(false)
      }
    },
    // `busy` is deliberately NOT a dependency. It was one, and it meant `run` was a different
    // function on either side of every state change — which is churn with no guard value now that
    // the guard is the ref.
    [fn, fallbackMessage],
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
  // And the latch is a ref for the same reason the key is. The key alone made a same-tick double
  // submit SURVIVABLE rather than harmless: both requests carried it, so the service recognised
  // the second as the same intent — and answered it 409 `idempotency_in_flight`
  // (`trade/src/idempotency.ts:150`, mapped at `trade/src/server.ts:271-273`). `keepKeyAfter`
  // returns true for that code, `setError` fired, and whichever promise settled last won. The
  // customer's bot started and the screen told them it had not. A component that lies about an
  // outcome is not made acceptable by the outcome being correct underneath.
  const running = useRef(false)

  const run = useCallback(
    async (...args: A): Promise<T | null> => {
      if (running.current) return null
      running.current = true
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
        running.current = false
        setBusy(false)
      }
    },
    [fn, fallbackMessage],
  )

  const reset = useCallback(() => {
    key.current = null
    setError(null)
    setResult(null)
  }, [])

  return { busy, error, result, run, reset }
}
