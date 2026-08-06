/**
 * The `Idempotency-Key` this bundle sends, and the one rule about when it may be reused.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * EVERY MUTATING ROUTE ON `trade` REQUIRES THIS HEADER. A POST WITHOUT ONE IS A 400.
 *
 * `idempotencyKeyOf` runs at the top of each mutation and throws when the header is missing or
 * outside 8–200 characters (`trade/src/server.ts`). The file header says why in one line
 * (`trade/src/server.ts`): "Every mutating route here either moves money or commits capital,
 * and a caller that cannot tell whether its retry landed is a caller that will retry until
 * something does."
 *
 * This is the opposite of `mint`, which reads no such header anywhere — so a client copied from
 * micro-mint-web without reading this service would 400 on every write, and one that guessed the
 * other way round would send a header trade would have refused to serve without.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── The reuse rule, which is the part that is easy to get backwards ───────────────────────────
 *
 * The service stores the key with a FINGERPRINT of the request body (`requestFingerprint`,
 * `trade/src/idempotency.ts`) and then makes three different decisions:
 *
 *   * same key, same body, work committed → the stored response is REPLAYED
 *     (`trade/src/idempotency.ts`). This is what a retry after a lost answer must hit.
 *   * same key, **different** body → `IdempotencyKeyReuseError`, a 409
 *     (`trade/src/idempotency.ts`, mapped at `trade/src/server.ts`). Returning the
 *     first request's answer to a second, different request "is worse than an error: the caller
 *     believes the thing it asked for happened."
 *   * same key, claim exists, no response yet → `IdempotencyInFlightError`, also a 409
 *     (`trade/src/idempotency.ts`, mapped at `trade/src/server.ts`). Retry shortly,
 *     with the SAME key.
 *
 * So a key is not "one per click" and it is not "one per form" either. It belongs to an
 * ATTEMPT AT ONE INTENT: minted when the user commits to an action, kept while the outcome is
 * unknown, and thrown away the moment the outcome is known — success or refusal alike. Keeping it
 * after a refusal is how a user who fixes a validation error gets a 409 they cannot act on;
 * dropping it after a timeout is how a bot's capital gets reserved twice.
 *
 * `keepKeyAfter()` below is that decision as a pure function, so `test/idempotency.test.ts` can
 * walk every case without a browser.
 */
import { ApiError } from './api.ts'

/** How the service spells the two idempotency refusals. `trade/src/server.ts`, `:264`. */
export const IN_FLIGHT_CODE = 'idempotency_in_flight'
export const KEY_REUSE_CODE = 'idempotency_key_reuse'

/**
 * A fresh key.
 *
 * Prefixed so that an operator reading `idempotency_keys.key` can tell a browser's key from a
 * service's without joining anything. The stored key is namespaced by the calling service and the
 * route anyway (`namespacedKey`, `trade/src/idempotency.ts`), so this prefix is for
 * humans, not for collision avoidance.
 *
 * Length is 45 characters, comfortably inside the service's 8–200 window
 * (`trade/src/server.ts`).
 */
export function newIdempotencyKey(): string {
  return `cf-trade-web-${uuid()}`
}

function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(16))
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  // Last resort. Weak randomness is survivable for an idempotency key — the worst outcome of a
  // collision is a 409 rather than a wrong charge, because the service compares the BODY too —
  // and a bundle that threw here instead would take the page down over telemetry-grade entropy.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
}

/**
 * Whether the key that produced `err` must be presented again on the next attempt.
 *
 * True only while the outcome is genuinely UNKNOWN:
 *
 *   * a transport failure (`status: 0`) — the request may have been received and its answer lost;
 *   * any 5xx, including the service's own `503 ledger_unavailable`
 *     (`trade/src/server.ts`) and `503 rate_unavailable` (`:269-274`), both of which can
 *     fire after work has partially committed;
 *   * `idempotency_in_flight`, which is the service explicitly saying "the original is still
 *     committing; come back with this key" (`trade/src/idempotency.ts`).
 *
 * False for every 4xx that is a decision: a 400 on a bad field, a 404 on an unknown series, a 409
 * `bot_state` ("a stopped bot cannot be restarted", `trade/src/bots.ts`), a 403. None of those
 * did any work, and all of them are followed by the user changing something — at which point the
 * old key with a new body is a 409 `idempotency_key_reuse` that has nothing to do with the change
 * they made.
 */
export function keepKeyAfter(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false
  if (err.code === IN_FLIGHT_CODE) return true
  return err.status === 0 || err.status >= 500
}
