/**
 * The responses the scenarios are run against.
 *
 * Every shape is one `src/lib/trade.ts` declares, which was read out of `trade/src/` at the lines
 * that module cites. Typed against the client's own declarations so a drift between them is a type
 * error here rather than a scenario asserting a shape nothing produces.
 */
import type { Bot, Strategy } from '../src/lib/trade.ts'

export const BOT_ID = '11111111-2222-3333-4444-555555555555'
export const BACKTEST_ID = '66666666-7777-8888-9999-000000000000'
export const SERIES_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

export function strategy(over: Partial<Strategy> = {}): Strategy {
  return {
    id: 'sma_cross',
    name: 'Moving-average cross',
    family: 'trend',
    tagline: 'Buy when the fast average crosses the slow one.',
    weakness: 'It gives back most of a trend in a range-bound market.',
    params: [],
    ...over,
  }
}

export function bot(over: Partial<Bot> = {}): Bot {
  return {
    id: BOT_ID,
    userId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    name: 'First bot',
    mode: 'paper',
    status: 'draft',
    seriesId: SERIES_ID,
    strategyId: 'sma_cross',
    params: {},
    allocation: '100000',
    reservationEntryId: null,
    cash: '100000',
    position: '0',
    equity: '100000',
    highWaterMark: '100000',
    feeBps: 2000,
    feeOwed: '0',
    feePaid: '0',
    state: {},
    lastBarT: null,
    lastError: null,
    ...over,
  }
}

/** The estate's error envelope — nested, as `errorReply()` builds it in every service. */
export function error(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } }
}

/** The two `cf.*` keys a signed-in browser holds. `src/lib/api.ts` reads exactly these. */
export const SIGNED_IN = {
  'cf.accessToken': 'access-token-stub',
  'cf.refreshToken': 'refresh-token-stub',
}

/** `GET /auth/me` as `identity/src/server.ts:1184-1191` returns it: the profile is nested. */
export const ME = {
  user: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', handle: 'trader', roles: ['customer'] },
  session: { id: 'session-1' },
  organisations: [],
}
