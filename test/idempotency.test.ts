/**
 * The `Idempotency-Key`, and the one rule about when it may be presented twice.
 *
 * This is the file that would have caught the two ways a client can get this wrong against a
 * service that requires the header on every mutation:
 *
 *   * **Minting a fresh key for a retry.** The first attempt may have committed and had its
 *     answer lost; a new key makes the retry a second reservation of the customer's capital.
 *   * **Keeping the key after a refusal.** The user fixes the field the 400 complained about and
 *     resubmits — same key, different body — and the service answers 409 `idempotency_key_reuse`
 *     (`trade/src/idempotency.ts`), which has nothing to do with what they changed.
 *
 * `keepKeyAfter` is the decision as a pure function, so both are provable without a browser.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '../src/lib/api.ts'
import {
  IN_FLIGHT_CODE,
  KEY_REUSE_CODE,
  keepKeyAfter,
  newIdempotencyKey,
} from '../src/lib/idempotency.ts'

describe('the key this client mints', () => {
  it('is inside the service’s 8 to 200 character window', () => {
    // `idempotencyKeyOf` throws a BadRequestError outside it — trade/src/server.ts. A key
    // that failed this would 400 every write in the app.
    const key = newIdempotencyKey()
    assert.ok(key.length >= 8, `${key.length} characters is under the service's minimum of 8`)
    assert.ok(key.length <= 200, `${key.length} characters is over the service's maximum of 200`)
  })

  it('names the bundle, so an operator reading idempotency_keys can tell where it came from', () => {
    assert.match(newIdempotencyKey(), /^cf-trade-web-/)
  })

  it('is different every time', () => {
    const keys = new Set(Array.from({ length: 64 }, () => newIdempotencyKey()))
    assert.equal(keys.size, 64, 'the generator repeats itself')
  })

  it('survives without crypto.randomUUID, because a bundle must not die over entropy', () => {
    const real = globalThis.crypto
    try {
      // Simulate an environment with getRandomValues but no randomUUID — the shape a few older
      // embedded browsers still present.
      Object.defineProperty(globalThis, 'crypto', {
        value: { getRandomValues: real.getRandomValues.bind(real) },
        configurable: true,
      })
      const key = newIdempotencyKey()
      assert.ok(key.length >= 8 && key.length <= 200)
      assert.match(key, /^cf-trade-web-[0-9a-f]{32}$/)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: real, configurable: true })
    }
  })
})

describe('when the key must be presented again', () => {
  const api = (status: number, code?: string) =>
    new ApiError(status, 'x', code, 'req-1')

  it('keeps it when the request never got an answer', () => {
    // status 0 is this bundle's transport failure — src/lib/api.ts throws ApiError(0, …) when
    // fetch itself rejects. The request may well have been received.
    assert.equal(keepKeyAfter(api(0)), true)
  })

  it('keeps it on every 5xx, including the two the service raises after partial work', () => {
    // 503 ledger_unavailable (trade/src/server.ts) and 503 rate_unavailable.
    for (const status of [500, 502, 503, 504]) {
      assert.equal(keepKeyAfter(api(status)), true, String(status))
    }
    assert.equal(keepKeyAfter(api(503, 'ledger_unavailable')), true)
  })

  it('keeps it when the service says the original is still in flight', () => {
    // trade/src/idempotency.ts — "a claim with no response yet is 'in flight', not 'done'".
    // The honest answer is retry, with THIS key.
    assert.equal(keepKeyAfter(api(409, IN_FLIGHT_CODE)), true)
  })

  it('drops it on a 400, because the user is about to change the body', () => {
    assert.equal(keepKeyAfter(api(400, 'bad_request')), false)
  })

  it('drops it on a 409 bot_state, which is a decision rather than an unknown', () => {
    // "a stopped bot cannot be restarted" — trade/src/bots.ts. Nothing happened, and the next
    // thing the customer does is a different action.
    assert.equal(keepKeyAfter(api(409, 'bot_state')), false)
  })

  it('drops it on a 409 key reuse, which is the failure keeping it would cause again', () => {
    assert.equal(keepKeyAfter(api(409, KEY_REUSE_CODE)), false)
  })

  it('drops it on 401, 403 and 404', () => {
    for (const status of [401, 403, 404]) {
      assert.equal(keepKeyAfter(api(status)), false, String(status))
    }
  })

  it('drops it for anything that is not an ApiError at all', () => {
    // A bug in this bundle is not evidence that a request landed.
    assert.equal(keepKeyAfter(new TypeError('undefined is not a function')), false)
    assert.equal(keepKeyAfter('a string'), false)
    assert.equal(keepKeyAfter(null), false)
  })
})

describe('the codes are the ones the service actually sends', () => {
  it('matches trade/src/server.ts and :264', () => {
    // Spelled out here rather than only imported, so a rename upstream fails a test that names
    // the line to go and read.
    assert.equal(KEY_REUSE_CODE, 'idempotency_key_reuse')
    assert.equal(IN_FLIGHT_CODE, 'idempotency_in_flight')
  })
})
