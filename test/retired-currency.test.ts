/**
 * NO RETIRED ASSET CODE APPEARS ON ANY SCREEN OF THIS PRODUCT, AND EVERY AMOUNT HAS ITS UNIT.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS
 *
 * The owner reported it by LOOKING AT THE PRODUCT, twice: *"i have told you to remove any reference
 * of shard"*. micro-org#227 swept the estate's user surfaces and the SDK and MISSED THIS BUNDLE.
 * On the day micro-org#418 was written, `src/pages/bot.tsx` still rendered a column headed
 * `Shards` and 685 tests ran green over it.
 *
 * They missed it for the reason `mint-web/test/retired-currency.test.ts` sets out at length: every
 * assertion in this suite was written FORWARDS. `test/format.test.ts` fed `shards()` an integer and
 * asserted it came back grouped. It was green BECAUSE the word was there. A suite made only of
 * forward assertions cannot notice retired vocabulary — it pins it in place.
 *
 * ── WHY THIS BUNDLE MAY DROP THE WORD OUTRIGHT, WHERE hub-web COULD NOT ───────────────────────
 *
 * `hub-web/test/retired-currency.test.ts` draws its line at PROMOTION rather than at the word,
 * because a retired holding is still a real ledger row and hiding it would be the worse defect.
 * Nothing on these screens is such a row. micro-trade holds live capital in the retired asset at
 * micro-ledger and says so in `trade/src/ledgerclient.ts` — but that is a service-to-service
 * wire, it is not on this surface, and no route reachable from this bundle returns an asset code
 * for it. Every figure here is a US-cent count of the customer's own cash, equity and fees.
 *
 * ── WHY IT READS RENDERED TEXT AND NEVER SOURCE ───────────────────────────────────────────────
 *
 * A grep over `src/` would match this file's own header, and `src/lib/format.ts`'s explanation of
 * what `usd()` replaced, and the two form comments recording when their labels moved. It would be
 * green because of its own justification, and it would STAY green if every screen it protects were
 * deleted. So this mounts the real pages with real fixtures and reads `screen.text()`.
 *
 * `test/render.test.ts` reads source deliberately, for claims about which SENTENCES a page can
 * produce. This is the opposite question — what a reader actually sees — and it needs the opposite
 * technique.
 *
 * ── WHY THE WORD LIST COMES FROM `micro-contracts` ────────────────────────────────────────────
 *
 * Hardcoding /shards?/ here would make a second list to keep current, and the next asset wound down
 * would be caught by `contracts` and missed by this file. It is PARSED from a sibling checkout
 * rather than imported, because this is a browser bundle and `micro-contracts` is not a dependency
 * of it. It does not SKIP when the checkout is absent: a skipped test is a green test, and the
 * defect it guards is invisible to everything else here.
 *
 * ── AND THE HALF THAT IS NOT ABOUT THE WORD AT ALL ────────────────────────────────────────────
 *
 * Deleting a label is the easy half and it is not the dangerous one. micro-worlds renamed
 * `rewardShards`→`rewardWei` on 2026-08-10; worlds-web went on reading the old key, `undefined`
 * rendered as nothing, and 47 rows on mainnet showed "· pays  Shards" with a BLANK AMOUNT for a
 * year. Nothing was red, because the render test pinned the OLD FIELD NAME and its own fixture
 * supplied it.
 *
 * So the second half of this file asserts THE AMOUNT AND ITS UNIT — the literal `$1,000.00` that
 * 100000 cents has to become — and never the name of the field carrying it. A rename that this
 * bundle fails to follow produces a dash (`usd()` renders absence visibly, by design) and fails
 * here. A rename that is followed but RE-BASED — the far worse mistake, printing the cent count
 * under a dollar sign — produces `$100,000.00` and fails here too.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { createElement as h, type ReactElement } from 'react'
import { MemoryRouter, Route, Routes as RouterRoutes } from 'react-router-dom'

import { withScreen, type Routes } from './dom.ts'
import * as fx from './fixtures.ts'
import { AuthProvider } from '../src/lib/auth.tsx'
import { BacktestPage } from '../src/pages/backtest.tsx'
import { BotPage } from '../src/pages/bot.tsx'
import { BotsPage } from '../src/pages/bots.tsx'
import { BacktestsPage } from '../src/pages/backtests.tsx'
import { NewBotPage } from '../src/pages/new-bot.tsx'
import { NewBacktestPage } from '../src/pages/new-backtest.tsx'

const ORIGIN = 'https://trade.cloudsforge.online'

const atRoute = (pattern: string, element: ReactElement, path: string): ReactElement =>
  h(
    MemoryRouter,
    { initialEntries: [path] },
    h(AuthProvider, null, h(RouterRoutes, null, h(Route, { path: pattern, element }))) as ReactElement,
  )

const page = (element: ReactElement, path: string): ReactElement =>
  h(MemoryRouter, { initialEntries: [path] }, h(AuthProvider, null, element) as ReactElement)

const signedIn = (routes: Routes): Routes => ({ 'GET /auth/me': { body: fx.ME }, ...routes })

/** `contracts/packages/chain/src/index.ts`, in the sibling checkout CI lays out as `contracts`. */
const CONTRACTS = fileURLToPath(new URL('../../contracts/packages/chain/src/index.ts', import.meta.url))

/**
 * The asset codes `micro-contracts` calls retired.
 *
 * Throws rather than returning nothing on a shape change, because a regex that had degraded to an
 * empty capture would make every assertion below vacuously true — in the repository that did not
 * move. Re-point this parser if `contracts` changes shape; do not delete the check.
 */
function retiredAssets(): readonly string[] {
  if (!existsSync(CONTRACTS)) {
    throw new Error(
      `${CONTRACTS} is missing. Check micro-contracts out as 'contracts' beside this repository — ` +
        'this test does not skip, because a retired asset code back on a customer screen is ' +
        'invisible to every other test here.',
    )
  }
  const source = readFileSync(CONTRACTS, 'utf8')
  const list = /RETIRED_ASSETS:[^=]*=\s*Object\.freeze\(\[([^\]]*)\]/.exec(source)
  if (!list?.[1]) {
    throw new Error(
      'contracts no longer declares RETIRED_ASSETS as a frozen array literal. Read ' +
        'packages/chain/src/index.ts and re-point this parser — do not delete the check.',
    )
  }
  const codes = [...list[1].matchAll(/'([A-Z][A-Z0-9]*)'/g)].map((m) => m[1] as string)
  if (codes.length === 0) throw new Error('RETIRED_ASSETS parsed to nothing')
  return codes
}

/**
 * Every spelling of a retired code a screen could plausibly carry.
 *
 * `SHARD` alone would miss "Shards", which is the spelling that was actually shipped. Word
 * boundaries on both ends, so a legitimate word that merely contains the code — none today, but
 * `EMBER` inside "remember" is exactly the class — cannot make this fail for the wrong reason.
 */
const spellings = (code: string): RegExp => new RegExp(`\\b${code}S?\\b`, 'i')

/* ── The fixtures. Every money field is a round number of CENTS with an obvious dollar form, so a
      re-basing mistake is legible in the failure message rather than needing arithmetic. ──────── */

/** $1,000.00 allocated, $1,010.50 of equity, $1.50 of fee owed. */
const BOT = fx.bot({
  mode: 'live',
  status: 'running',
  allocation: '100000',
  cash: '20050',
  position: '2500000',
  equity: '101050',
  highWaterMark: '100000',
  feeOwed: '150',
  feePaid: '25',
})

/** A sell of $30.00 gross, 3 cents of fee, on 2,500,000 base units. */
const FILL = {
  id: 'fill-1',
  botId: fx.BOT_ID,
  userId: BOT.userId,
  barT: 1_700_000_000,
  side: 'sell' as const,
  mode: 'live' as const,
  priceScaled: '30000000000',
  price: '30000.000000',
  qty: '2500000',
  usdCents: '3000',
  feeUsdCents: '3',
  reason: 'sma_cross: fast crossed below slow',
  status: 'settled' as const,
  entryId: 'entry-1',
  error: null,
}

const SETTLEMENT = {
  id: 'set-1',
  botId: fx.BOT_ID,
  userId: BOT.userId,
  period: '442',
  equity: '101050',
  highWaterMark: '100000',
  gain: '1050',
  fee: '157',
  attempted: '157',
  collected: '157',
  status: 'charged' as const,
  entryId: 'entry-2',
}

const METRICS = {
  startEquity: '100000',
  endEquity: '101250',
  totalReturnBps: '125',
  holdReturnBps: '90',
  maxDrawdownBps: '210',
  exposureBps: '6000',
  winRateBps: '5500',
  profitFactorBps: '13000',
  feesPaidUsdCents: '4000',
  bestTradeUsdCents: '90000',
  worstTradeUsdCents: '-45000',
  trades: 20,
  wins: 11,
  losses: 9,
  cagr: 0.12,
  sharpe: 0.9,
  sortino: 1.1,
  calmar: 0.6,
}

const BACKTEST = {
  id: fx.BACKTEST_ID,
  userId: BOT.userId,
  status: 'complete',
  seriesId: fx.SERIES_ID,
  strategyId: 'sma_cross',
  params: {},
  seed: 1,
  startCash: '100000',
  feeBps: 10,
  slippageBps: 5,
  fromT: 1_700_000_000,
  toT: 1_700_600_000,
  resultDigest: 'digest-1',
  metrics: METRICS,
  notes: [],
  error: null,
}

/**
 * The six screens a customer reaches that print money, each mounted the way its own journey does.
 *
 * The two FORMS are here as well as the four reports. They are where somebody is invited to
 * denominate something new, and a form is the one place a retired code would do active harm rather
 * than merely being stale.
 */
const SCREENS = [
  {
    name: 'the bot page',
    element: atRoute('/bots/:id', h(BotPage), `/bots/${fx.BOT_ID}`),
    options: {
      url: `${ORIGIN}/bots/${fx.BOT_ID}`,
      storage: fx.SIGNED_IN,
      routes: signedIn({
        [`GET /v1/bots/${fx.BOT_ID}`]: { body: { bot: BOT } },
        [`GET /v1/bots/${fx.BOT_ID}/fills`]: { body: { fills: [FILL] } },
        [`GET /v1/bots/${fx.BOT_ID}/settlements`]: { body: { settlements: [SETTLEMENT] } },
      }),
    },
  },
  {
    name: 'the bots list',
    element: page(h(BotsPage), '/bots'),
    options: {
      url: `${ORIGIN}/bots`,
      storage: fx.SIGNED_IN,
      routes: signedIn({ 'GET /v1/bots': { body: { bots: [BOT] } } }),
    },
  },
  {
    name: 'the backtest report',
    element: atRoute('/backtests/:id', h(BacktestPage), `/backtests/${fx.BACKTEST_ID}`),
    options: {
      url: `${ORIGIN}/backtests/${fx.BACKTEST_ID}`,
      storage: fx.SIGNED_IN,
      routes: signedIn({
        [`GET /v1/backtests/${fx.BACKTEST_ID}`]: { body: { backtest: BACKTEST } },
        [`GET /v1/backtests/${fx.BACKTEST_ID}/result`]: { body: { fills: [], equity: [] } },
      }),
    },
  },
  {
    name: 'the backtests list',
    element: page(h(BacktestsPage), '/backtests'),
    options: {
      url: `${ORIGIN}/backtests`,
      storage: fx.SIGNED_IN,
      routes: signedIn({ 'GET /v1/backtests': { body: { backtests: [BACKTEST] } } }),
    },
  },
  {
    name: 'the new-bot form',
    element: page(h(NewBotPage), '/bots/new'),
    options: {
      url: `${ORIGIN}/bots/new`,
      storage: fx.SIGNED_IN,
      routes: signedIn({
        'GET /v1/strategies': { body: { strategies: [fx.strategy()] } },
        'GET /v1/capabilities': { body: { liveTrading: true } },
        'GET /v1/series': { body: { series: [{ id: fx.SERIES_ID, symbol: 'CFG-USD', timeframe: '1h', bars: 5000 }] } },
      }),
    },
  },
  {
    name: 'the new-backtest form',
    element: page(h(NewBacktestPage), '/backtests/new'),
    options: {
      url: `${ORIGIN}/backtests/new`,
      storage: fx.SIGNED_IN,
      routes: signedIn({
        'GET /v1/strategies': { body: { strategies: [fx.strategy()] } },
        'GET /v1/capabilities': { body: { liveTrading: true } },
        'GET /v1/series': { body: { series: [{ id: fx.SERIES_ID, symbol: 'CFG-USD', timeframe: '1h', bars: 5000 }] } },
      }),
    },
  },
] as const

describe('no retired asset code reaches a reader of this product', () => {
  it('parses micro-contracts to something, so nothing below can be vacuous', () => {
    const retired = retiredAssets()
    assert.ok(retired.length > 0)
    // The list must contain the code this bundle actually shipped, or this file has stopped
    // testing the thing it was written for. If SHARD is one day dropped from `RETIRED_ASSETS`
    // entirely, this goes red and whoever does that decides what it should watch instead.
    assert.ok(
      retired.includes('SHARD'),
      `SHARD is no longer in RETIRED_ASSETS: ${JSON.stringify(retired)} — re-point this file`,
    )
    // And the matcher has to match the spelling that shipped, not just the bare code.
    assert.match('Shards', spellings('SHARD'))
    assert.doesNotMatch('shareholder', spellings('SHARD'))
  })

  for (const screen of SCREENS) {
    it(`${screen.name} says none of them`, async () => {
      await withScreen(screen.element, screen.options, async (s) => {
        await s.settle(30)
        const text = s.text()
        for (const code of retiredAssets()) {
          assert.doesNotMatch(
            text,
            spellings(code),
            `${code} is still on ${screen.name}. Every amount on this surface is a US-cent count ` +
              'of the customer’s own cash — see src/lib/format.ts.',
          )
        }
        // The pair, so this cannot be satisfied by rendering an empty page. A blank screen passes
        // every loop above and is a worse product than the one being fixed.
        assert.ok(text.trim().length > 200, `${screen.name} rendered almost nothing`)
      })
    })
  }
})

describe('every amount is rendered in the unit it is denominated in', () => {
  /*
   * ══════════════════════════════════════════════════════════════════════════════════════════
   * READ THESE AS DOLLARS, NOT AS FIELD NAMES.
   *
   * Not one assertion below mentions `allocation`, `usdCents` or `feesPaidUsdCents`. They name
   * the MONEY: the fixture allocates 100000 cents, so the screen must say `$1,000.00`. That is
   * the assertion micro-worlds' render test did not have, and it is the reason a blank amount
   * survived on mainnet for a year.
   * ══════════════════════════════════════════════════════════════════════════════════════════
   */

  it('the bot page prints dollars for cash, equity and fees, and no bare cent count', async () => {
    const spec = SCREENS[0]
    await withScreen(spec.element, spec.options, async (s) => {
      await s.settle(30)
      const text = s.text()

      for (const [cents, dollars] of [
        ['100000', '$1,000.00'], // allocated
        ['20050', '$200.50'], // cash
        ['101050', '$1,010.50'], // equity, and the settlement's equity
        ['150', '$1.50'], // fee owed
        ['25', '$0.25'], // fee paid
      ] as const) {
        assert.ok(
          text.includes(dollars),
          `${cents} cents did not render as ${dollars}. Either the amount is missing (a renamed ` +
            `field this bundle did not follow) or it was printed unscaled.`,
        )
      }

      // ── The re-basing check, which is the mistake worth more than the missing one. 100000 cents
      // is a thousand dollars; a screen printing "$100,000.00" has multiplied the customer's
      // allocation by a hundred and would still pass every "no retired word" assertion above.
      assert.ok(!text.includes('$100,000.00'), 'a cent count was printed as though it were dollars')

      // ── A fill: signed, because a buy and a sell are opposite facts in the same column.
      assert.ok(text.includes('+$30.00'), 'the fill did not render its signed cash movement')
      assert.ok(text.includes('$0.03'), 'the fill fee, three cents, did not render')

      // ── And the two figures on this page that are NOT money. 2,500,000 base-asset smallest
      // units is a quantity; rendering it through the money formatter would put it on screen as
      // $25,000.00, which is a number nobody holds.
      assert.ok(text.includes('2,500,000'), 'the position is not shown as a plain count')
      assert.ok(!text.includes('$25,000.00'), 'a base-unit quantity was formatted as money')
    })
  })

  it('the backtest report prints dollars for fees and for the best and worst trade', async () => {
    const spec = SCREENS[2]
    await withScreen(spec.element, spec.options, async (s) => {
      await s.settle(30)
      const text = s.text()
      assert.ok(text.includes('$1,000.00'), 'the starting cash did not render as dollars')
      assert.ok(text.includes('$40.00'), 'the fees paid did not render as dollars')
      assert.ok(text.includes('+$900.00'), 'the best trade lost its sign or its unit')
      assert.ok(text.includes('-$450.00'), 'the worst trade lost its sign or its unit')
      assert.ok(text.includes('$1,012.50'), 'the end equity did not render as dollars')
      // The literal that would appear if the report were relabelled rather than re-denominated.
      assert.ok(!text.includes('$100,000.00'), 'a cent count was printed as though it were dollars')
    })
  })

  it('the two forms still ask for CENTS, and say so, because that is what they send', async () => {
    // The forms are the asymmetric case: the request body is the integer as typed. A label that
    // drifted to "dollars" while the field kept sending cents would take a hundred times what the
    // customer intended — the opposite direction from every other assertion in this file, and the
    // one that costs money rather than confidence.
    for (const spec of [SCREENS[4], SCREENS[5]]) {
      await withScreen(spec.element, spec.options, async (s) => {
        await s.settle(30)
        assert.match(s.text(), /US cents/i, `${spec.name} does not say what unit it takes`)
      })
    }
  })
})
