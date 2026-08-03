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
