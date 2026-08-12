/**
 * This surface's slice of `docs/ecosystem/22-browser-journeys.md`, as data.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THE CATALOGUE IS DATA AND NOT JUST A LIST OF `it(...)` TITLES
 *
 * Doc 22 §3.2 makes the layer boundary mechanical rather than advisory: every scenario declares
 * one `asserts` kind, and any scenario whose outcome depends on a SERVER-SIDE rule must carry
 * `ownedBy` — "a path, resolvable by grep, in the service that enforces the rule". A meta-test
 * reads these and fails the suite when one is missing.
 *
 * The second reason is doc 22 §8: a scenario that exists and cannot run is a gap somebody can
 * close, and an absent scenario is a gap nobody can see.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */

export type Asserts = 'presentation' | 'client-request' | 'navigation'
export type Tier = 'T1' | 'T2' | 'T3'

export interface Scenario {
  readonly id: string
  readonly what: string
  readonly asserts: Asserts
  readonly tier: Tier
  readonly gate?: boolean
  readonly ownedBy?: { readonly path: string; readonly grep: string }
  readonly blocked?: string
}

export const SCENARIOS: readonly Scenario[] = [
  /* ── 6.6 Group F — Forge Trade ────────────────────────────────────────────────────────────── */
  {
    id: 'BJ-TRD-01',
    what: 'the strategy catalogue renders for an anonymous reader with no sign-in prompt and no credential attached',
    asserts: 'presentation',
    tier: 'T2',
  },
  {
    id: 'BJ-TRD-02',
    what: 'queuing a backtest navigates to the status page, and the page says the run has not happened',
    asserts: 'navigation',
    tier: 'T1',
    gate: true,
    // Doc 22 puts this at T3 because it wants a real run. The half that is a property of THIS
    // CLIENT — that a 202 sends the browser to the status address and that the address says the
    // run has not happened — needs nothing up.
  },
  {
    id: 'BJ-TRD-03',
    what: 'the report replaces the status only when the run reports complete, never on the 202',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-04',
    what: 'another customer’s backtest id renders the not-found screen rather than a permission error',
    asserts: 'presentation',
    tier: 'T1',
    ownedBy: { path: 'trade/src/server.ts', grep: 'not_found' },
  },
  {
    id: 'BJ-TRD-05',
    what: '/backtests/new renders the form, not a detail view for an id called "new"',
    asserts: 'navigation',
    tier: 'T2',
  },
  {
    id: 'BJ-TRD-06',
    what: 'a bot is created as a draft, and the page states that nothing is reserved and nothing trades until start',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-TRD-07',
    what: 'creating the same bot twice under one intent sends one key, so the service can replay rather than make a second bot',
    asserts: 'client-request',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-08',
    what: 'a stopped bot has no start button, and the page says why',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
    ownedBy: { path: 'trade/src/bots.ts', grep: 'stopped' },
  },
  {
    id: 'BJ-TRD-09',
    what: 'a live bot under a kill switch IS offered the button, and the refusal is rendered in full rather than hidden',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
    ownedBy: { path: 'trade/src/bots.ts', grep: 'LIVE_DISABLED' },
  },
  {
    id: 'BJ-TRD-10',
    what: 'the page says pause is not a flatten and the position stays open, and labels equity a mark from the last tick',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-11',
    what: 'the bot list equity column is labelled a mark, not a settlement',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-12',
    what: 'the fee settlements panel renders one row per settlement in the response, with no duplicate settlement id',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-13',
    what: 'another customer’s bot id renders the owner-scoped not-found screen',
    asserts: 'presentation',
    tier: 'T1',
    ownedBy: { path: 'trade/src/server.ts', grep: 'not_found' },
  },

  /*
   * ── 6.6 Group F, continued — the exchange screens ───────────────────────────────────────────
   *
   * BJ-TRD-14 … 44 are the markets list, the trading screen, the orders surface and the balances
   * screen. Doc 22 assigns every one of them T1 and says why in §6.6: the tier is where a scenario
   * RUNS, not where its subject lives, and all thirty-one run against stubbed responses with no
   * exchange up anywhere. Doc 22 §8.9 records the three assertions that genuinely need
   * `TRADE_EXCHANGE_ENABLED` on somewhere and therefore are NOT claimed here — that the engine
   * honours the key BJ-TRD-28 sends, that it reads minor units at the scale the ticket meant, and
   * that the five-second poll does not race a customer mid-keystroke.
   *
   * The word "terminal" does not appear in any `what` below, and that is deliberate rather than
   * prose: `journeys.test.ts`'s REFUSAL pattern reads it in the BJ-TRD-08 sense — "stop is
   * terminal" — and would demand an `ownedBy` from every scenario that merely named the trading
   * screen. It is called the market screen here for that reason.
   */
  {
    id: 'BJ-TRD-14',
    what:
      'with the order book off, the service’s own refusal sentence is quoted and no /v1/exchange/ ' +
      'market request is made at all',
    asserts: 'client-request',
    tier: 'T1',
    gate: true,
    ownedBy: { path: 'trade/src/server.ts', grep: 'EXCHANGE_DISABLED' },
  },
  {
    id: 'BJ-TRD-15',
    what:
      'an order-book block absent from capabilities — a trade older than the exchange — reaches ' +
      'the same conclusion as off, from silence',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-16',
    what:
      'a capability read that failed says it could not check and offers a retry, never the words ' +
      'that say the exchange is switched off here',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-TRD-17',
    what: 'with the order book on, the market screen opens with the book and the order ticket on it',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-18',
    what: 'the depth ladder puts the asks above the spread above the bids, in document order',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-TRD-19',
    what: 'the spread is a figure the reader can check against the two sides shown, not prose',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-20',
    what: 'the ladder’s cumulative total column accumulates in the base asset’s own decimals',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-21',
    what: 'the ladder says in words that a level may hold more than the size it publishes',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-22',
    what:
      'an empty book is a state of the market, distinguishable from a failure and from a loading ' +
      'screen',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-23',
    what: 'a one-sided book says there is no spread to report rather than printing one',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-24',
    what: 'pressing a ladder price copies the decimal into the ticket and sends nothing',
    asserts: 'client-request',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-TRD-25',
    what:
      'the ticket builds its controls from the vocabularies the deployment published, not from a ' +
      'copy of the enums',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-26',
    what: 'the cost is restated in the market’s own units, on the screen, before anything is sent',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-27',
    what:
      'a quantity off the lot grid is warned about and NOT blocked, because the engine owns the ' +
      'refusal and a client that blocks it hides a rule the customer cannot then read',
    asserts: 'presentation',
    tier: 'T1',
    ownedBy: { path: 'trade/src/exchange.ts', grep: 'validatePlacement' },
  },
  {
    id: 'BJ-TRD-28',
    what:
      'placing a limit order puts integer minor units on the wire as strings, and a double submit ' +
      'carries exactly one idempotency key',
    asserts: 'client-request',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-TRD-29',
    what: 'the receipt renders what the engine did with the order, not a toast that disappears',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-30',
    what:
      'the receipt survives the refresh it triggers itself: the poll does not unmount the ticket ' +
      'and what was typed is still in the boxes',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-TRD-31',
    what:
      'a refresh that fails leaves the stale figures up and labelled stale, with placing and ' +
      'cancelling still on the screen',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-32',
    what: 'a refused order keeps the ticket’s values and quotes the request id',
    asserts: 'presentation',
    tier: 'T1',
    ownedBy: { path: 'trade/src/exchange.ts', grep: 'below_min_notional' },
  },
  {
    id: 'BJ-TRD-33',
    what: 'every explanation is a real button in the tab order, never a title attribute',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-TRD-34',
    what: 'opening an explanation announces a role="tooltip" bubble that describes its own trigger',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-35',
    what: 'Escape dismisses an open explanation, per SC 1.4.13, without moving the pointer',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-36',
    what: 'the trigger toggles, so one control both opens an explanation and shuts it again',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-37',
    what: 'every trigger names its own term, so a button list is navigable without opening anything',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-38',
    what:
      'anything that changes what an order DOES is explained in the open rather than behind a ' +
      'bubble — a tooltip is for a definition, not for a consequence',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-39',
    what: 'colour is never the only channel: the tape spells which side crossed the spread, in words',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-TRD-40',
    what: 'the candle chart has a table view carrying the same numbers the chart draws',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-41',
    what:
      'the market list links each market to its own screen and states its fees from the response, ' +
      'not from a constant',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-42',
    what:
      'cancelling an open order sends a DELETE carrying NO idempotency key — the id in the path is ' +
      'the key — and the button names the order it cancels',
    asserts: 'client-request',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-TRD-43',
    what: 'an order’s event trail renders every state it passed through, in the order the engine wrote them',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-TRD-44',
    what:
      'the balances screen renders the service’s own total rather than two decimal strings added ' +
      'in the browser',
    asserts: 'presentation',
    tier: 'T1',
  },

  /* ── 6.19 Group S — the adversarial matrix ────────────────────────────────────────────────── */
  {
    id: 'BJ-ADV-06-H1',
    what: 'queuing a backtest under a double-submit sends one idempotency key',
    asserts: 'client-request',
    tier: 'T1',
  },
  {
    id: 'BJ-ADV-06-H2',
    what: 'after the browser has moved to the status page there is no form left holding the settled intent',
    asserts: 'navigation',
    tier: 'T1',
  },
  {
    id: 'BJ-ADV-07-H1',
    what: 'creating a bot under a double-submit sends one idempotency key',
    asserts: 'client-request',
    tier: 'T1',
  },
  {
    id: 'BJ-ADV-07-H4',
    what: 'a failed bot creation states the failure with its request id and keeps the draft on screen',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-ADV-08-H1',
    what: 'a bot action under a double-submit sends one action',
    asserts: 'client-request',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-ADV-08-H3',
    what: 'bot actions from two tabs',
    asserts: 'client-request',
    tier: 'T3',
    gate: true,
    blocked:
      'two browser contexts against one service. Doc 22 §4 makes that tier 3 by definition and ' +
      'puts tier 3 in micro-beacon; nothing in this repository can hold two browsers open. The ' +
      'defence is the service’s own state machine — `startBot` refuses a stopped bot outright — ' +
      'and that is micro-trade’s test to own.',
  },
  {
    id: 'BJ-ADV-08-H4',
    what: 'a refused bot action leaves the bot rendered and states the refusal beside the controls',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
    ownedBy: { path: 'trade/src/bots.ts', grep: 'BotStateError' },
  },
  {
    id: 'BJ-ADV-08-H6',
    what: 'against a degraded service the bot controls are disabled while an action is in flight',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-ADV-22',
    what: 'degraded not down: the page paints inside its deadline with the slow read marked pending',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-ADV-23',
    what: 'every failure state renders the request id to quote to support',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },

  /* ── 6.20 Group T — accessibility ─────────────────────────────────────────────────────────── */
  {
    id: 'BJ-A11Y-01',
    what: 'axe on every route of this surface: zero serious or critical violations',
    asserts: 'presentation',
    tier: 'T2',
    gate: true,
    blocked:
      'axe-core is not installed anywhere in the estate, and doc 22 §1 records that as true of ' +
      'all fifteen bundles. Doc 22 §7.2 makes the axe sweep estate-wide by construction ("Any PR ' +
      'in ui — every surface’s T1 axe set"), so it belongs to the shared design system rather ' +
      'than to one repository. BJ-A11Y-08, -10 and -12 need no engine and are run.',
  },
  {
    id: 'BJ-A11Y-03',
    what: 'a degraded panel is still announced, and a failure is not colour-only',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-A11Y-08',
    what: 'every chart on this surface has a table view carrying the same numbers',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-A11Y-10',
    what: 'colour is never the only channel: every state badge carries a word as well',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-A11Y-12',
    what: 'one main landmark, a reachable skip link, and a heading order with no level skipped',
    asserts: 'presentation',
    tier: 'T1',
  },

  /* ── 5.1 the universal per-surface property ───────────────────────────────────────────────── */
  {
    id: 'BJ-TRADE-404',
    what: 'an address this surface does not own renders the not-found screen UNDER a 404',
    asserts: 'navigation',
    tier: 'T2',
  },
]

/**
 * Every id doc 22 assigns to this surface: §6.6 in full; §6.19's `BJ-ADV-06` (H1 H2), `BJ-ADV-07`
 * (H1 H4) and `BJ-ADV-08` (H1 H3 H4 H6) rows expanded over the hazards they declare; §6.19's two
 * page-level rows; the Group T rows naming a property this surface has; and §5.1. Doc 22 §5 keys
 * this surface `trade`.
 */
export const DOC22_IDS: readonly string[] = [
  'BJ-TRD-01',
  'BJ-TRD-02',
  'BJ-TRD-03',
  'BJ-TRD-04',
  'BJ-TRD-05',
  'BJ-TRD-06',
  'BJ-TRD-07',
  'BJ-TRD-08',
  'BJ-TRD-09',
  'BJ-TRD-10',
  'BJ-TRD-11',
  'BJ-TRD-12',
  'BJ-TRD-13',
  'BJ-TRD-14',
  'BJ-TRD-15',
  'BJ-TRD-16',
  'BJ-TRD-17',
  'BJ-TRD-18',
  'BJ-TRD-19',
  'BJ-TRD-20',
  'BJ-TRD-21',
  'BJ-TRD-22',
  'BJ-TRD-23',
  'BJ-TRD-24',
  'BJ-TRD-25',
  'BJ-TRD-26',
  'BJ-TRD-27',
  'BJ-TRD-28',
  'BJ-TRD-29',
  'BJ-TRD-30',
  'BJ-TRD-31',
  'BJ-TRD-32',
  'BJ-TRD-33',
  'BJ-TRD-34',
  'BJ-TRD-35',
  'BJ-TRD-36',
  'BJ-TRD-37',
  'BJ-TRD-38',
  'BJ-TRD-39',
  'BJ-TRD-40',
  'BJ-TRD-41',
  'BJ-TRD-42',
  'BJ-TRD-43',
  'BJ-TRD-44',
  'BJ-ADV-06-H1',
  'BJ-ADV-06-H2',
  'BJ-ADV-07-H1',
  'BJ-ADV-07-H4',
  'BJ-ADV-08-H1',
  'BJ-ADV-08-H3',
  'BJ-ADV-08-H4',
  'BJ-ADV-08-H6',
  'BJ-ADV-22',
  'BJ-ADV-23',
  'BJ-A11Y-01',
  'BJ-A11Y-03',
  'BJ-A11Y-08',
  'BJ-A11Y-10',
  'BJ-A11Y-12',
  'BJ-TRADE-404',
]
