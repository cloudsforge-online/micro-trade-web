/**
 * THE GATE IN FRONT OF THE WHOLE TRADING SURFACE, AND THE TIMER BEHIND IT.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * `TRADE_EXCHANGE_ENABLED` is **false by default** (`trade/src/env.ts`), and every one of the
 * sixteen exchange routes is registered through `exchangeRoute`, which refuses with a 503 and the
 * code `exchange_disabled` when it is off (`trade/src/server.ts`). So a deployment with no order
 * book is the ORDINARY case, not a broken one, and this app must not present it as a fault.
 *
 * The precedent is already in this repository. `new-bot.tsx` asks `GET /v1/capabilities` before it
 * offers a live bot, distinguishes "switched off" from "could not tell", and renders the service's
 * own refusal sentence verbatim rather than a paraphrase — `test/render.test.ts` enforces all
 * three. This is that pattern applied one level up, to a whole product surface instead of one radio
 * button, and it keeps the same three rules:
 *
 *   1. **ASK, never assume.** The flag is a property of the deployment, not of the build.
 *   2. **"Could not check" is its own answer.** A failed capability read is not permission, and it
 *      is not a refusal either. It gets its own branch and its own words.
 *   3. **The refusal is quoted, not rewritten.** Two sentences that can drift apart will.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useEffect, type ReactNode } from 'react'
import { Failed, Loading } from '../components/states.tsx'
import type { OrderBookCapabilities } from './exchange.ts'
import { useResource, type Resource } from './resource.ts'
import { getCapabilities, type TradeCapabilities } from './trade.ts'

export interface OrderBookGateState {
  readonly capabilities: Resource<{ capabilities: TradeCapabilities }>
  /** The block the service published, or null when it published none or the read failed. */
  readonly book: OrderBookCapabilities | null
}

/**
 * Ask this deployment whether it has an order book, and what its vocabularies are.
 *
 * Unauthenticated (`getCapabilities` sends `auth: false`), so it answers before a session exists and
 * a signed-out reader gets the same honest answer as a signed-in one.
 */
export function useOrderBook(): OrderBookGateState {
  const capabilities = useResource(
    (signal) => getCapabilities(signal),
    // Always one: a capabilities response is a single document, and there is no "empty" state for
    // it. Returning `orderBook ? 1 : 0` here would render the EMPTY state for a deployment with the
    // exchange switched off, which is a different sentence from the one that case deserves.
    () => 1,
    'We could not ask this deployment whether its exchange is switched on.',
  )
  return { capabilities, book: capabilities.data?.capabilities.orderBook ?? null }
}

/**
 * Render the trading surface, or the honest reason there is not one.
 *
 * A render prop rather than `children`, so a page cannot be written that reads the vocabularies
 * before they have arrived: the callback is only ever called with a book that is present and
 * enabled.
 */
export function OrderBookGate({
  state,
  children,
}: {
  state: OrderBookGateState
  children: (book: OrderBookCapabilities) => ReactNode
}) {
  const { capabilities, book } = state

  if (capabilities.state === 'loading') {
    return <Loading label="Checking whether this deployment has an exchange" />
  }

  // Rule 2. A capability read that failed tells us NOTHING about the flag, and the failure state
  // says exactly that rather than either offering the screen or claiming the exchange is off.
  if (capabilities.error) {
    return (
      <Failed
        notice={capabilities.error}
        onRetry={capabilities.reload}
        title="We could not check whether trading is switched on here"
      />
    )
  }

  if (book === null || !book.enabled) {
    return (
      <section className="tw-gate" role="status">
        <h2 className="tw-gate__title">There is no order book on this deployment</h2>
        {/*
          Rule 3: the service's own words. `orderBook.refusal` is present only when the flag is off
          (`trade/src/server.ts`), and quoting it means the warning here and the 503 a script would
          get from the API cannot say different things.
        */}
        <p className="tw-gate__reason">
          {book?.refusal ??
            'This deployment does not report an exchange at all, which is what a Forge Trade older ' +
              'than the order book answers. Everything on the modelling side of the product — the ' +
              'strategy catalogue, backtests and bots — works normally.'}
        </p>
        <p className="tw-gate__hint">
          Nothing is broken and nothing needs retrying. Whoever runs this deployment turns the
          exchange on; until then there are no markets to show, no balances to hold and no orders to
          place.
        </p>
      </section>
    )
  }

  return <>{children(book)}</>
}

/**
 * Re-read a resource on a timer, while the reader is looking at it.
 *
 * ── This is not the `setInterval` the estate forbids ──────────────────────────────────────────
 *
 * Rule 8 is about a SERVICE doing domain work on a timer: a background loop that settles fees,
 * reaps rows or advances state has to be a leased job (`@cloudsforge/jobs`) so that two replicas
 * cannot both do it and so that a missed run is visible. None of that applies to a browser tab
 * re-reading a price it is already displaying. This timer:
 *
 *   * performs no domain work — every request it makes is a GET;
 *   * has exactly one contender, the tab it lives in;
 *   * is cleared on unmount, so a page nobody is on costs nothing;
 *   * and is a preference the reader can switch off, because on a metered connection somebody
 *     should be allowed to say no.
 *
 * The interval is deliberately not sub-second. Market data on this surface is polled, not streamed,
 * and a page that polled a book ten times a second would be spending the customer's own rate-limit
 * quota (`RATE_RULES['market.read']`, `trade/src/ratelimit.ts`) on a refresh rate no human reads.
 */
export function useAutoRefresh(reload: () => void, everyMs: number, enabled: boolean): void {
  useEffect(() => {
    if (!enabled || everyMs <= 0) return
    const timer = setInterval(reload, everyMs)
    return () => clearInterval(timer)
  }, [reload, everyMs, enabled])
}

/** How often the live surfaces re-read, in milliseconds. One place, so the pages agree. */
export const REFRESH_MS = 5_000
