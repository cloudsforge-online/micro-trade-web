/**
 * The four states, and the rule that a screen whose QUESTION changes must re-ask it.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THE SECOND HALF OF THIS FILE PINS.
 *
 * `useResource` as the web template writes it re-runs its effect on `[nonce]` alone. `load` is
 * excluded on purpose — most callers recreate it every render and including it would make the
 * effect a render loop — and that is correct for a screen with one fixed question, which is every
 * screen the template was written for.
 *
 * It is wrong for a screen whose question changes. On this surface the question is a PATH
 * PARAMETER: `/backtests/:id` and `/bots/:id` reuse the same component when a customer moves from
 * one run to another, and with `[nonce]` as the only dependency the second address would render
 * the FIRST run's report — its return, its drawdown, its fee — under the new id in the address
 * bar. That is a page telling somebody a modelled number that belongs to a different run.
 *
 * The hook now takes the VALUES the question depends on. These tests assert that every page whose
 * question can change passes them, and that the pages whose question cannot do not pretend to.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { resourceState } from '../src/lib/resource.ts'

const read = (file: string): string => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

const notice = { message: 'boom', requestId: 'req-1', forbidden: false }
const refusal = { message: 'nope', requestId: 'req-1', forbidden: true }

describe('the four states are four, and never collapse into each other', () => {
  it('is loading before anything has arrived', () => {
    assert.equal(resourceState({ loading: true, error: null, count: null }), 'loading')
  })

  it('is ok when there is something', () => {
    assert.equal(resourceState({ loading: false, error: null, count: 3 }), 'ok')
  })

  it('is empty when the query answered with nothing', () => {
    assert.equal(resourceState({ loading: false, error: null, count: 0 }), 'empty')
  })

  it('is failed when the query did not answer', () => {
    assert.equal(resourceState({ loading: false, error: notice, count: null }), 'failed')
  })

  it('is forbidden when it was understood and refused', () => {
    assert.equal(resourceState({ loading: false, error: refusal, count: null }), 'forbidden')
  })

  it('reports FAILURE rather than EMPTY when both could apply', () => {
    // A request that threw has told us nothing about whether data exists. Reporting "nothing
    // here" for a timeout is how an outage reads as a quiet week.
    assert.equal(resourceState({ loading: false, error: notice, count: 0 }), 'failed')
  })

  it('reports FAILURE rather than LOADING when both could apply', () => {
    assert.equal(resourceState({ loading: true, error: notice, count: null }), 'failed')
  })

  it('reports FORBIDDEN rather than a generic failure', () => {
    // The two have different remedies: one is retryable and one is never.
    assert.equal(resourceState({ loading: true, error: refusal, count: 0 }), 'forbidden')
  })

  it('stays loading on a null count even when loading is false', () => {
    // No data and no error is a request that has not resolved. Calling it empty would render
    // "nothing here" for a request still in flight.
    assert.equal(resourceState({ loading: false, error: null, count: null }), 'loading')
  })
})

describe('a screen whose question can change re-asks it', () => {
  /** Every `useResource(...)` call in a page, as source text. */
  function calls(page: string): string[] {
    const source = read(`src/pages/${page}.tsx`)
    const out: string[] = []
    for (const m of source.matchAll(/useResource[<(]/g)) {
      const at = m.index
      const next = source.indexOf('\n\n', at)
      out.push(source.slice(at, next === -1 ? undefined : next))
    }
    return out
  }

  /** Pages that read an id out of the address, so their question changes without unmounting. */
  const PARAMETERISED = ['backtest', 'bot']
  /** Pages whose question is fixed for as long as they are mounted. */
  const FIXED = ['strategies', 'backtests', 'bots', 'new-backtest', 'new-bot']

  for (const page of PARAMETERISED) {
    it(`${page}.tsx passes the id from the address to every read`, () => {
      // Without it, navigating from one run to another inside the same route shows the first
      // run's numbers under the second run's id — and on this surface those numbers are a
      // financial claim about a strategy the reader did not ask about.
      const found = calls(page)
      assert.ok(found.length > 0, `${page} does not call useResource`)
      for (const call of found) {
        assert.match(call, /\[id\]/, `a read in ${page}.tsx does not re-run when the id changes`)
      }
    })
  }

  for (const page of FIXED) {
    it(`${page}.tsx asks a fixed question, and passes no decorative empty array`, () => {
      for (const call of calls(page)) {
        assert.doesNotMatch(call, /\[\s*\]\s*[,)]/, `${page} passes a decorative empty array`)
      }
    })
  }

  it('no page passes `load` itself as a dependency', () => {
    // It is recreated every render by every caller here, so it would make the effect a render
    // loop — which is why the hook takes values rather than the closure.
    for (const page of [...PARAMETERISED, ...FIXED]) {
      for (const call of calls(page)) {
        assert.doesNotMatch(call, /,\s*\[load\]/, `${page} passes load as a dependency`)
      }
    }
  })

  it('the hook threads the dependencies into the effect rather than accepting and ignoring them', () => {
    // A parameter that is taken and dropped is worse than none: every call site then reads as
    // though it re-fetches.
    const source = read('src/lib/resource.ts')
    assert.match(source, /\}, \[nonce, \.\.\.deps\]\)/)
  })

  it('the hook still aborts the in-flight request when the question changes', () => {
    // The cleanup is what stops a slow answer to the old question landing after the new one.
    const source = read('src/lib/resource.ts')
    assert.match(source, /return \(\) => controller\.abort\(\)/)
  })
})
