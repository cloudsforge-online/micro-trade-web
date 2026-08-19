/**
 * A MARK AGAINST A PRICE SOMEBODY SET MUST NOT READ LIKE A MARK AGAINST A MARKET.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * micro-org#368.
 *
 * Pricing serves EMBER as `administered`: one figure an operator typed, `sourceCount: 0`, and by
 * design it does not decay. Every other asset on the board comes back `market` with four
 * independent sources behind it. Measured read-only against mainnet on 2026-08-12, the ONLY series
 * this estate holds is `DRILL | EMBER | 1h` — so the only bot anybody can build here is one whose
 * equity is valued at a number CloudsForge chose.
 *
 * Both arrive on the wire as the same string of digits. Until `bots.equity_price_source` existed
 * (`trade/src/bots.ts`, migration 11) nothing distinguished them, so this bundle could not have
 * shown the difference had it wanted to; now it can, and this file is what holds it open.
 *
 * ── WHY EVERY TEST BELOW IS A PAIR ─────────────────────────────────────────────────────────────
 *
 * A test that only proves the administered note APPEARS passes just as happily against a screen
 * that prints it on every bot — which tells a customer their market-priced equity is a figure we
 * made up. That is the same lie pointing the other way, and the worse one of the two, because a
 * label on everything teaches a reader to stop seeing it.
 *
 * So each case renders BOTH, at the SAME equity to the cent, and asserts on the difference. The
 * equality of the two figures is asserted too: if the marks differed, a reader could be seeing the
 * number rather than the provenance and the test would prove nothing about the label.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement as h, type ReactElement } from 'react'
import { MemoryRouter, Route, Routes as RouterRoutes } from 'react-router-dom'

import { withScreen, type Routes } from './dom.ts'
import * as fx from './fixtures.ts'
import { AuthProvider } from '../src/lib/auth.tsx'
import { markTone } from '../src/lib/format.ts'
import { BacktestPage } from '../src/pages/backtest.tsx'
import { BotPage } from '../src/pages/bot.tsx'
import { BotsPage } from '../src/pages/bots.tsx'
import type { Bot, EquityPriceSource } from '../src/lib/trade.ts'

// The page ROOT, which carries the mount since wave 3b moved this surface to `<apex>/trade`.
// Every use below is `${ORIGIN}/<router path>`, so this is the one line that has to know.
const ORIGIN = 'https://cloudsforge.online/trade'

/** The same equity, to the cent, in every scenario. The provenance is the only variable. */
const EQUITY = '104250'

const signedIn = (routes: Routes): Routes => ({ 'GET /auth/me': { body: fx.ME }, ...routes })

const botAt = () =>
  h(
    MemoryRouter,
    { initialEntries: [`/bots/${fx.BOT_ID}`] },
    h(
      AuthProvider,
      null,
      h(RouterRoutes, null, h(Route, { path: '/bots/:id', element: h(BotPage) })),
    ) as ReactElement,
  )

/** The bot detail screen's rendered text, for a bot marked against `source`. */
async function detailFor(over: Partial<Bot>): Promise<string> {
  let text = ''
  await withScreen(
    botAt(),
    {
      url: `${ORIGIN}/bots/${fx.BOT_ID}`,
      storage: fx.SIGNED_IN,
      routes: signedIn({
        [`GET /v1/bots/${fx.BOT_ID}/settlements`]: { body: { settlements: [] } },
        [`GET /v1/bots/${fx.BOT_ID}/fills`]: { body: { fills: [] } },
        [`GET /v1/bots/${fx.BOT_ID}`]: {
          body: { bot: fx.bot({ status: 'running', equity: EQUITY, ...over }) },
        },
      }),
    },
    async (s) => {
      await s.settle(20)
      text = s.text()
    },
  )
  return text
}

describe('the bot page names what its equity was marked against', () => {
  it('says one thing for an administered price and another for a market one, at the same figure', async () => {
    const administered = await detailFor({ equityPriceSource: 'administered' })
    const market = await detailFor({ equityPriceSource: 'market' })

    // Both rendered the same money. If they had not, everything below could be a reader seeing a
    // different NUMBER rather than a different provenance.
    assert.match(administered, /\$1,042\.50/, 'the administered screen lost its equity figure')
    assert.match(market, /\$1,042\.50/, 'the market screen lost its equity figure')

    // The administered half. This is the sentence the issue exists to put on the screen: the
    // valuation is ours, and it moves when we move it.
    assert.match(administered, /price we set/i, 'an administered mark is not labelled as one')
    assert.match(
      administered,
      /no market prices this asset/i,
      'the page shows the label without ever saying what it means for the number',
    )
    assert.match(administered, /cloudsforge sets/i, 'the note does not say whose valuation it is')

    // The market half — the one that stops this being a label printed on everything. A screen
    // that carried the administered wording here would be telling a customer that a median of
    // four independent sources is a figure we chose.
    assert.doesNotMatch(
      market,
      /price we set|no market prices this asset|cloudsforge sets/i,
      'a market-priced mark carries the administered wording, so the label says nothing — it is ' +
        'on every bot either way',
    )
    assert.match(market, /market/i, 'a market-priced mark is not labelled at all')
    assert.match(
      market,
      /median of independent sources/i,
      'the market case has a word but no sentence, so the pair is a badge rather than an answer',
    )
  })

  it('a paper bot says it was marked at its own bars, which is neither of those two', async () => {
    // `tickBot` marks a paper bot at `newest.c` and never calls pricing (`trade/src/bots.ts`), so
    // filing it under `market` would claim a quote nobody asked for. It is a third answer.
    const paper = await detailFor({ mode: 'paper', equityPriceSource: 'bar' })
    assert.match(paper, /its own bars/i, 'a paper bot claims a price source it never asked for')
    assert.match(paper, /no price was quoted for it/i, 'the page does not say what a bar mark is')
    assert.doesNotMatch(paper, /price we set/i, 'a paper mark is presented as an administered one')
    assert.doesNotMatch(
      paper,
      /median of independent sources/i,
      'a paper mark is presented as a market one, which is a quote that never happened',
    )
  })

  it('a bot nothing has marked claims nothing, and does not say "market" by default', async () => {
    // `insertBot` seeds `equity` from the allocation — capital committed, not a valuation. The
    // absence of a mark is an answer, and the dangerous rendering of it is a confident one.
    const fresh = await detailFor({ status: 'draft', equityPriceSource: null })
    assert.match(fresh, /not yet marked/i, 'an unmarked bot says nothing about being unmarked')
    assert.match(
      fresh,
      /capital allocated to it, not a valuation/i,
      'the page shows an allocation as though a tick had valued it',
    )
    assert.doesNotMatch(
      fresh,
      /median of independent sources|price we set/i,
      'a bot that has never been marked was given a provenance anyway',
    )
  })

  it('a service too old to send the field at all leaves a word on the badge, not a blank', async () => {
    // ══════════════════════════════════════════════════════════════════════════════════════════
    // THE micro-worlds DEFECT, WHICH THIS FIELD IS ONE MIGRATION AWAY FROM REPEATING.
    //
    // worlds-web went on reading a key micro-worlds had renamed. `undefined` rendered as nothing
    // at all, 47 rows on mainnet showed a blank amount for a year, and no test was red. Any
    // `trade` from before migration 11 answers `GET /v1/bots/:id` without this key, so the shape
    // is not hypothetical — it is what this bundle sees the moment it deploys ahead of the
    // service.
    // ══════════════════════════════════════════════════════════════════════════════════════════
    const absent = await detailFor({ equityPriceSource: undefined as unknown as null })
    assert.match(absent, /marked against/i, 'the fact disappeared with the field')
    assert.match(
      absent,
      /not yet marked/i,
      'a missing field rendered as an empty badge — a state with no word is the one thing this ' +
        'estate’s state rules forbid',
    )
    assert.doesNotMatch(
      absent,
      /median of independent sources|price we set/i,
      'a bundle running ahead of the service invented a provenance for every bot',
    )
  })

  it('a word this build does not know is not quietly filed under market', async () => {
    // The wire is a JSON string. `trade` constrains its own column, this bundle does not get that
    // guarantee, and a source added there before it is added here must arrive as an unknown rather
    // than as a reassurance.
    const odd = await detailFor({ equityPriceSource: 'oracle' as EquityPriceSource })
    assert.doesNotMatch(
      odd,
      /median of independent sources/i,
      'an unrecognised price source was reported as a market price, which is micro-org#368 ' +
        'arrived at from the other direction',
    )
    assert.match(odd, /oracle/i, 'the value a customer would quote to support is not on screen')
    assert.match(odd, /does not know/i, 'the page does not admit it cannot state the provenance')
  })
})

describe('the bot list names it per row', () => {
  it('two bots at identical equity are distinguished by their provenance, in the list', async () => {
    const bots = [
      fx.bot({
        id: '11111111-2222-3333-4444-555555555555',
        name: 'Marked by a market',
        status: 'running',
        equity: EQUITY,
        equityPriceSource: 'market',
      }),
      fx.bot({
        id: '22222222-3333-4444-5555-666666666666',
        name: 'Marked by us',
        status: 'running',
        equity: EQUITY,
        equityPriceSource: 'administered',
      }),
    ]
    await withScreen(
      h(MemoryRouter, { initialEntries: ['/bots'] }, h(AuthProvider, null, h(BotsPage)) as ReactElement),
      {
        url: `${ORIGIN}/bots`,
        storage: fx.SIGNED_IN,
        routes: signedIn({ 'GET /v1/bots': { body: { bots } } }),
      },
      async (s) => {
        await s.settle(20)

        const rows = [...s.document.querySelectorAll('tbody tr')]
        assert.equal(rows.length, 2, 'the list did not render both bots')
        const byMarket = rows.find((r) => s.textOf(r).includes('Marked by a market'))
        const byUs = rows.find((r) => s.textOf(r).includes('Marked by us'))
        assert.ok(byMarket && byUs, 'a bot is missing its row')

        // Same money, different claim — asserted on the ROW, because a page-level match would
        // pass on a list that printed both labels once each in the wrong cells.
        assert.match(s.textOf(byMarket), /\$1,042\.50/)
        assert.match(s.textOf(byUs), /\$1,042\.50/)
        assert.match(s.textOf(byUs), /price we set/i, 'the administered row is unlabelled')
        assert.doesNotMatch(
          s.textOf(byMarket),
          /price we set/i,
          'the market row carries the administered label, so the column marks every bot the same',
        )
        assert.match(s.textOf(byMarket), /market/i, 'the market row is unlabelled')

        // And the column has a header, so the badge is a value of something rather than an
        // unexplained word in a cell.
        assert.match(s.text(), /marked against/i, 'the provenance column has no header')
      },
    )
  })
})

describe('a backtest has one provenance by construction, and says so', () => {
  it('states the bar close and claims no quote', async () => {
    await withScreen(
      h(
        MemoryRouter,
        { initialEntries: [`/backtests/${fx.BACKTEST_ID}`] },
        h(
          AuthProvider,
          null,
          h(RouterRoutes, null, h(Route, { path: '/backtests/:id', element: h(BacktestPage) })),
        ) as ReactElement,
      ),
      {
        url: `${ORIGIN}/backtests/${fx.BACKTEST_ID}`,
        storage: fx.SIGNED_IN,
        routes: signedIn({
          [`GET /v1/backtests/${fx.BACKTEST_ID}`]: { body: { backtest: backtest() } },
          [`GET /v1/backtests/${fx.BACKTEST_ID}/result`]: {
            body: {
              fills: [],
              equity: [
                { t: 1_700_000_000, equity: '100000', hold: '100000' },
                { t: 1_700_003_600, equity: '101250', hold: '100400' },
              ],
            },
          },
        }),
      },
      async (s) => {
        await s.settle(30)
        // `runBacktest` marks at `bar.c` and never calls pricing (`trade/src/backtest.ts`). The
        // claim is narrower than the one a reader makes unprompted, which is why it is written.
        assert.match(s.text(), /marked at the close of the bar/i, 'the run states no provenance')
        assert.match(s.text(), /never at a quoted price|not valued at a quoted price|no figure here was priced by a quote/i)
        // And it does not borrow a live bot's vocabulary. A run has no price source column and
        // inventing one for the screen would be a provenance nothing recorded.
        assert.doesNotMatch(
          s.text(),
          /price we set|median of independent sources/i,
          'a backtest claimed a pricing provenance it never had',
        )
      },
    )
  })
})

describe('the vocabulary itself', () => {
  it('every source the service can write has a word, a glyph and a sentence', () => {
    // The service's check constraint (`trade/src/migrations.ts`, version 11) allows exactly these
    // four plus null. A fifth would come through `default`, which is the case above.
    const SOURCES: readonly (EquityPriceSource | null)[] = [
      'market',
      'administered',
      'bar',
      'unknown',
      null,
    ]
    for (const source of SOURCES) {
      const tone = markTone(source)
      assert.ok(tone.word.length > 0, `${source} has no word`)
      assert.ok(tone.glyph.length > 0, `${source} has no glyph`)
      assert.ok(tone.meaning.length > 20, `${source} has no sentence`)
    }
  })

  it('no two of them say the same thing', () => {
    // The defect this file exists for is two different facts rendering identically. A shared word
    // between any pair here would reintroduce it one screen at a time.
    const words = (['market', 'administered', 'bar', 'unknown', null] as const).map(
      (s) => markTone(s).word,
    )
    assert.equal(new Set(words).size, words.length, `two sources share a word: ${words.join(', ')}`)
  })

  it('the administered sentence says whose valuation it is, not merely that it is unusual', () => {
    // "Administered" is a word from pricing's schema, not from anybody's vocabulary. A badge
    // carrying it verbatim would be accurate and useless.
    const meaning = markTone('administered').meaning
    assert.match(meaning, /cloudsforge/i, 'the sentence does not say who set the price')
    assert.doesNotMatch(markTone('market').meaning, /cloudsforge sets/i)
  })
})

/* ── fixtures that need the page's own shapes ───────────────────────────────────────────────── */

function backtest(): Record<string, unknown> {
  return {
    id: fx.BACKTEST_ID,
    userId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    status: 'complete',
    seriesId: fx.SERIES_ID,
    strategyId: 'sma_cross',
    params: {},
    seed: 1,
    startCash: '100000',
    feeBps: 10,
    slippageBps: 5,
    fromT: 1_700_000_000,
    toT: 1_700_003_600,
    resultDigest: 'digest-1',
    metrics: {
      startEquity: '100000',
      endEquity: '101250',
      totalReturnBps: '125',
      holdReturnBps: '90',
      maxDrawdownBps: '210',
      exposureBps: '6000',
      winRateBps: '5500',
      profitFactorBps: '13000',
      feesPaidUsdCents: '40',
      bestTradeUsdCents: '900',
      worstTradeUsdCents: '-450',
      trades: 20,
      wins: 11,
      losses: 9,
      cagr: 0.12,
      sharpe: 0.9,
      sortino: 1.1,
      calmar: 0.6,
    },
    notes: [],
    error: null,
  }
}
