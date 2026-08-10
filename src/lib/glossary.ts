/**
 * EVERY WORD ON THE TRADING SCREEN, EXPLAINED TO SOMEBODY WHO HAS NEVER TRADED.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * An exchange interface is dense with vocabulary that is completely opaque from outside it. "IOC",
 * "post only", "STP: decrement and cancel", "held", "min notional" — each of those is a control
 * that spends money, and none of them explains itself. The estate's rule for this product is
 * already written down for the backtester (`src/lib/format.ts`: a modelled number says so, on the
 * surface where it is shown); this file is the same rule applied to the exchange: **a control that
 * can spend money explains itself, next to itself, in words a non-trader can read.**
 *
 * So the copy lives here rather than inline in the pages, for three reasons that are all defects
 * this estate has already paid for somewhere:
 *
 *   1. **One definition per term.** The same word appears on the ladder, in the order form, in the
 *      order list and on the fills table. Written four times it becomes four subtly different
 *      claims, and the one on the screen the customer is looking at is the one that is wrong.
 *   2. **Coverage can be a TYPE rather than a promise.** The maps at the bottom are
 *      `Record<Union, GlossaryKey>` over the engine's own vocabularies, so adding a member to
 *      `TimeInForce` in `src/lib/exchange.ts` does not compile until somebody has written the
 *      sentence explaining it. "Remember to document the new order type" is not a mechanism.
 *   3. **A label is not an explanation.** `orderTypeLabel('stop_limit')` gives "Stop limit", which
 *      helps nobody. Both are here, side by side, so a screen cannot accidentally ship the first
 *      believing it shipped the second.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── House style for the sentences, because the failure mode is prose nobody reads ─────────────
 *
 *   * Second person, present tense, active. "You are asking to buy", not "the order shall be".
 *   * Say what it DOES first and what it is CALLED second.
 *   * Where a rule can cost money, say so plainly — `post_only` says your order is rejected rather
 *     than filled; `market_order` says you do not choose the price.
 *   * No metaphors about markets being "hungry" or "deep". They read as expertise and mean nothing.
 *   * Where the engine has a rule with a number in it, the number comes from the MARKET on the
 *     wire, never from this file. Nothing here states a fee, a tick or a limit, because those are
 *     per-market values and a copy of one in a glossary is a lie waiting for a config change.
 */
import type {
  MarketStatus,
  OrderEventKind,
  OrderStatus,
  PlacedOrderType,
  StpMode,
  TimeInForce,
  TransferDirection,
  TransferStatus,
} from './exchange.ts'

export interface Explanation {
  /** The term as it is printed on screen. */
  readonly term: string
  /** One or two sentences a person who has never traded can act on. */
  readonly plain: string
}

/**
 * The whole vocabulary of this surface.
 *
 * `satisfies` rather than an annotation, so `GlossaryKey` below is the union of the real keys and a
 * typo in `<Explain term="…">` is a compile error rather than a tooltip that silently renders
 * nothing.
 */
export const GLOSSARY = {
  /* ── what the exchange is ─────────────────────────────────────────────────────────────────── */

  order_book: {
    term: 'Order book',
    plain:
      'The list of every offer to buy and every offer to sell that is currently waiting. You are ' +
      'not trading against this company: you are trading against other people, and the book is ' +
      'what they have left standing.',
  },
  price_time_priority: {
    term: 'Price-time priority',
    plain:
      'The rule that decides who gets filled first. The best price wins; when two people offer the ' +
      'same price, whoever put their order in first wins. Nothing else is considered — not the ' +
      'size of the order and not who placed it.',
  },
  maker: {
    term: 'Maker',
    plain:
      'You were already waiting on the book and somebody else traded with you. Makers usually pay ' +
      'the lower fee, because the order was there for other people to trade against.',
  },
  taker: {
    term: 'Taker',
    plain:
      'You traded against an order that was already waiting. Takers usually pay the higher fee, ' +
      'because they are the ones removing an offer from the book.',
  },
  bid: {
    term: 'Bid',
    plain: 'The highest price anybody is currently offering to BUY at. It is what you can sell into.',
  },
  ask: {
    term: 'Ask',
    plain: 'The lowest price anybody is currently offering to SELL at. It is what you can buy from.',
  },
  spread: {
    term: 'Spread',
    plain:
      'The gap between the best buy offer and the best sell offer. Buying and immediately selling ' +
      'again costs you the spread plus both fees, which is why doing that is not free.',
  },
  depth: {
    term: 'Depth',
    plain:
      'How much is waiting to be traded at each price. A thin book means a large order will walk ' +
      'through several prices and get a worse average than the one at the top.',
  },
  cumulative_depth: {
    term: 'Cumulative',
    plain:
      'Everything available at this price AND every better price added together. It answers "if I ' +
      'take everything down to here, how much do I get".',
  },
  published_size: {
    term: 'Published size',
    plain:
      'What the book shows at this price. An order can hide part of itself, so the real amount ' +
      'waiting can be larger than the number displayed — never smaller.',
  },
  last_price: {
    term: 'Last',
    plain: 'The price the most recent trade actually happened at. Not an offer — a completed trade.',
  },
  change_24h: {
    term: '24h change',
    plain:
      'How far the price has moved since the first trade in the last twenty-four hours, as a ' +
      'percentage. It describes the past day and predicts nothing.',
  },
  high_low_24h: {
    term: '24h high / low',
    plain: 'The highest and lowest prices anything traded at in the last twenty-four hours.',
  },
  base_volume: {
    term: 'Volume',
    plain:
      'How much of the asset changed hands in the last twenty-four hours, counted in the thing ' +
      'being bought and sold rather than in money.',
  },
  quote_volume: {
    term: 'Turnover',
    plain: 'The same twenty-four hours of trading, counted in money instead of in the asset.',
  },
  trade_count: {
    term: 'Trades',
    plain: 'How many separate trades happened in the last twenty-four hours.',
  },
  tape: {
    term: 'Recent trades',
    plain:
      'Trades that have already happened, newest first. The side shown is the side of whoever ' +
      'crossed the spread to make it happen, which is the usual way of reading which way the ' +
      'pressure was going.',
  },
  candle_interval: {
    term: 'Interval',
    plain:
      'How much time each bar of the chart covers. A 1m bar records the first, highest, lowest and ' +
      'last price traded within one minute.',
  },

  /* ── the rules of a market ────────────────────────────────────────────────────────────────── */

  base_asset: {
    term: 'Base asset',
    plain: 'The thing being bought and sold. In BTC-USD it is BTC, and quantities are counted in it.',
  },
  quote_asset: {
    term: 'Quote asset',
    plain: 'The thing it is priced in. In BTC-USD it is USD, and prices and costs are counted in it.',
  },
  minor_units: {
    term: 'Minor units',
    plain:
      'Every amount here is a whole number of the smallest unit of its asset — cents rather than ' +
      'dollars, satoshis rather than bitcoin. Nothing is ever stored as a decimal fraction, so ' +
      'nothing is ever rounded behind your back.',
  },
  notional: {
    term: 'Notional',
    plain: 'What an order is worth in money: the quantity multiplied by the price.',
  },
  lot_size: {
    term: 'Lot size',
    plain:
      'The smallest step a quantity can move in on this market. A quantity that is not a whole ' +
      'number of lots is refused rather than rounded, so what you typed is what you get.',
  },
  tick_size: {
    term: 'Tick size',
    plain:
      'The smallest step a price can move in on this market. A price between two ticks is refused ' +
      'rather than rounded.',
  },
  min_notional: {
    term: 'Minimum order value',
    plain:
      'The smallest amount of money an order on this market may be worth. It exists because an ' +
      'order too small to be worth its own fee only adds noise to the book.',
  },
  reference_price: {
    term: 'Reference price',
    plain:
      'The price the market measures a fat-finger check against — normally the last traded price. ' +
      'A market that has never traded has no reference and no band.',
  },
  price_band: {
    term: 'Price band',
    plain:
      'How far from the reference price an order is allowed to be. It is a typing-mistake guard: ' +
      'an order far outside the band is refused rather than filled at a price nobody meant.',
  },

  /* ── the four market states ───────────────────────────────────────────────────────────────── */

  market_active: {
    term: 'Trading',
    plain: 'The market is open. Orders can be placed, and they can trade.',
  },
  market_post_only: {
    term: 'Post only',
    plain:
      'The market is accepting orders that WAIT on the book, and refusing any order that would ' +
      'trade immediately. Usually a controlled reopening.',
  },
  market_cancel_only: {
    term: 'Cancel only',
    plain:
      'You can take your orders off the book but you cannot add new ones. Usually the step before ' +
      'or after a halt.',
  },
  market_halted: {
    term: 'Halted',
    plain:
      'Trading is stopped. Existing orders stay where they are and nothing new is accepted until ' +
      'an operator lifts it.',
  },

  /* ── order types ──────────────────────────────────────────────────────────────────────────── */

  limit_order: {
    term: 'Limit',
    plain:
      'You name the worst price you will accept. It trades at your price or better, or it waits on ' +
      'the book until it can. It may never trade at all — that is the trade-off for controlling ' +
      'the price.',
  },
  market_order: {
    term: 'Market',
    plain:
      'You name the amount and take whatever prices the book is offering right now. It trades ' +
      'almost certainly, and you do not choose what it costs. On a thin book that can be much ' +
      'worse than the price at the top.',
  },
  stop_limit_order: {
    term: 'Stop limit',
    plain:
      'Nothing happens until the market reaches your stop price. Then a normal limit order is ' +
      'placed for you. Used to get out of a position without watching the screen — but if the ' +
      'price gaps straight through your limit, it waits instead of filling.',
  },
  stop_market_order: {
    term: 'Stop market',
    plain:
      'Nothing happens until the market reaches your stop price. Then it buys or sells at whatever ' +
      'the book is offering. It will almost certainly trade, and you do not choose the price it ' +
      'gets — which in a fast move is the point and also the risk.',
  },
  stop_price: {
    term: 'Stop price',
    plain:
      'The price that wakes the order up. A sell stop sits BELOW the current price and a buy stop ' +
      'sits ABOVE it; the engine refuses the other way round, because such an order would fire ' +
      'immediately and is never what was meant.',
  },
  pending_trigger: {
    term: 'Waiting to trigger',
    plain:
      'A stop order that has not fired yet. It is not on the book, nobody can trade with it, and ' +
      'nobody else can see it — but the money for it is already set aside.',
  },

  /* ── time in force ────────────────────────────────────────────────────────────────────────── */

  time_in_force: {
    term: 'Time in force',
    plain: 'How long the order is allowed to keep trying before the exchange gives up on it.',
  },
  tif_gtc: {
    term: 'Good til cancelled',
    plain:
      'It waits on the book until it fills or until you cancel it. This is the ordinary choice for ' +
      'an order you want to leave standing.',
  },
  tif_ioc: {
    term: 'Immediate or cancel',
    plain:
      'Take whatever is available right now and cancel the rest. A partial fill is a normal ' +
      'outcome. Nothing is left waiting on the book.',
  },
  tif_fok: {
    term: 'Fill or kill',
    plain:
      'Fill the whole thing at once or do nothing at all. Use it when a half-filled position would ' +
      'be worse than no position.',
  },
  tif_gtd: {
    term: 'Good til time',
    plain:
      'It waits on the book like a normal order, but the exchange cancels it for you at the time ' +
      'you set. Useful for an order you do not want to outlive the reason you placed it.',
  },
  expires_at: {
    term: 'Expires',
    plain:
      'When the exchange will cancel this order on your behalf. The expiry is checked by the ' +
      'exchange, not by this page, so it happens whether or not your browser is open.',
  },

  /* ── the modifiers ────────────────────────────────────────────────────────────────────────── */

  post_only: {
    term: 'Post only',
    plain:
      'Refuse the order outright if it would trade immediately. It guarantees you are the one ' +
      'waiting on the book — usually to pay the lower fee — at the cost of being rejected rather ' +
      'than filled when the price has moved.',
  },
  reserve_order: {
    term: 'Visible size',
    plain:
      'Show only part of your order to everybody else and keep the rest hidden. The whole amount ' +
      'can still trade; the book only publishes the visible part, so a large order does not ' +
      'announce itself. Your queue position is unaffected.',
  },
  client_order_id: {
    term: 'Your reference',
    plain:
      'A label of your own, carried on the order and returned on every event about it. Purely for ' +
      'your own bookkeeping — the exchange does not interpret it.',
  },
  self_trade_prevention: {
    term: 'Self-trade prevention',
    plain:
      'What to do if this order would trade against another order of YOUR OWN. Trading with ' +
      'yourself costs you both fees and moves nothing, and it prints a trade that misrepresents ' +
      'the market, so the exchange never allows it — this setting only chooses which of the two ' +
      'orders gets out of the way.',
  },
  stp_cancel_taker: {
    term: 'Cancel the new order',
    plain:
      'Your existing order stays where it is and the one you are placing now is cancelled. The ' +
      'safe default: it never touches an order you already have working.',
  },
  stp_cancel_maker: {
    term: 'Cancel the resting order',
    plain:
      'The order you already had waiting is cancelled and the new one carries on. Use this when ' +
      'the new order is the one you actually want.',
  },
  stp_cancel_both: {
    term: 'Cancel both',
    plain: 'Neither order survives the collision. The most cautious choice, and the least useful.',
  },
  stp_decrement_and_cancel: {
    term: 'Reduce both',
    plain:
      'Take the overlapping amount off both orders and leave whatever is left of each still ' +
      'working. Nothing is cancelled outright unless it is used up.',
  },

  /* ── an order's life ──────────────────────────────────────────────────────────────────────── */

  status_open: {
    term: 'Open',
    plain: 'On the book and available to trade. Part of it may already have been filled.',
  },
  status_filled: {
    term: 'Filled',
    plain: 'Completely traded. Nothing is left of it and no money is still set aside for it.',
  },
  status_cancelled: {
    term: 'Cancelled',
    plain:
      'Taken off the book before it was fully traded, by you or by a rule you chose. Anything it ' +
      'did trade before that still stands.',
  },
  status_rejected: {
    term: 'Rejected',
    plain: 'Never accepted at all. Nothing traded and nothing was ever set aside.',
  },
  status_expired: {
    term: 'Expired',
    plain: 'The time you set ran out and the exchange cancelled the remainder for you.',
  },
  remaining: {
    term: 'Remaining',
    plain: 'How much of the order has still to trade. This is the part that is still on the book.',
  },
  filled_qty: {
    term: 'Filled',
    plain: 'How much of the order has traded so far, added up over every fill it has had.',
  },
  average_price: {
    term: 'Average price',
    plain:
      'What you actually paid or received per unit, over the whole order. It is computed from the ' +
      'totals, so a big fill counts for more than a small one.',
  },
  sequence: {
    term: 'Queue number',
    plain:
      'Where this order stands in the arrival order. It is what breaks the tie when two orders ask ' +
      'for the same price — the lower number was there first.',
  },
  order_events: {
    term: 'History',
    plain:
      'Everything that has happened to this order, in the order it happened, written down as it ' +
      'happened. It is the answer to "why did my order do that".',
  },
  cancel_all: {
    term: 'Cancel everything',
    plain:
      'Takes every one of your open orders off the book at once. It does not close any position ' +
      'you are already holding — it only stops anything new from happening.',
  },

  /* ── money ────────────────────────────────────────────────────────────────────────────────── */

  fee_bps: {
    term: 'Basis points',
    plain:
      'A hundredth of one per cent. Fees are quoted this way because a percentage of a percentage ' +
      'is easy to misread: 25 bps is 0.25%.',
  },
  maker_taker_fee: {
    term: 'Maker / taker fee',
    plain:
      'What each side of a trade pays. You pay the maker fee if your order was already waiting, ' +
      'and the taker fee if you traded against an order that was. The fee is always rounded DOWN, ' +
      'never up.',
  },
  fee_asset: {
    term: 'Fee asset',
    plain:
      'The fee is taken out of what you RECEIVE. A buyer receives the asset and pays the fee in ' +
      'it; a seller receives money and pays the fee in money.',
  },
  balance_available: {
    term: 'Available',
    plain: 'What you can spend or withdraw right now.',
  },
  balance_held: {
    term: 'Held',
    plain:
      'Money and assets set aside for orders you have working. Still yours, not spendable twice. ' +
      'Cancel the order and it comes straight back to available.',
  },
  balance_total: {
    term: 'Total',
    plain: 'Everything of yours the exchange is holding, whether or not it is currently spendable.',
  },
  escrow: {
    term: 'Set aside for this order',
    plain:
      'What is reserved while this order is working: the money, if you are buying, or the asset, ' +
      'if you are selling. It is released the moment the order finishes, whichever way it finishes.',
  },
  transfer_in: {
    term: 'Deposit',
    plain: 'Move money or assets from your wallet into the exchange so you can trade with them.',
  },
  transfer_out: {
    term: 'Withdrawal',
    plain:
      'Move money or assets back out of the exchange to your wallet. Only what is AVAILABLE can ' +
      'go — anything held for an open order has to be freed by cancelling first.',
  },
  transfer_pending: {
    term: 'Pending',
    plain: 'Accepted and not finished yet. Nobody has told us it failed.',
  },
  transfer_settled: {
    term: 'Settled',
    plain: 'Done. The money has moved and the balance you can see reflects it.',
  },
  transfer_refused: {
    term: 'Refused',
    plain: 'It did not happen and nothing moved. The reason is shown beside it.',
  },
  transfer_unresolved: {
    term: 'Unknown',
    plain:
      'We asked and did not get an answer. This is NOT a failure — it may yet complete, and it is ' +
      'retried automatically. Nothing is charged twice, because the retry carries the same ' +
      'reference as the original request.',
  },

  /* ── how this app talks to the exchange ───────────────────────────────────────────────────── */

  idempotency_key: {
    term: 'Duplicate protection',
    plain:
      'Every order this page sends carries a one-time reference. If the connection drops and the ' +
      'page retries, the exchange recognises the reference and returns the ORIGINAL order instead ' +
      'of placing a second one.',
  },
  rate_limit: {
    term: 'Rate limit',
    plain:
      'How many requests the exchange will accept from you in a short window. Cancelling is ' +
      'allowed far more often than ordering, deliberately: it must never be harder to get out ' +
      'than it was to get in.',
  },
} as const satisfies Record<string, Explanation>

export type GlossaryKey = keyof typeof GLOSSARY

/**
 * The engine's vocabularies, each mapped to the sentence that explains it.
 *
 * These are `Record<Union, GlossaryKey>` on purpose. `PlacedOrderType` and its siblings are read
 * off `trade/src/exchange.ts`; the day one of them gains a member, this file stops compiling until
 * somebody has written the explanation for it. That is the mechanism the header claims — a screen
 * cannot offer a control this app cannot explain.
 */
export const ORDER_TYPE_TERMS: Record<PlacedOrderType, GlossaryKey> = {
  limit: 'limit_order',
  market: 'market_order',
  stop_limit: 'stop_limit_order',
  stop_market: 'stop_market_order',
}

export const TIF_TERMS: Record<TimeInForce, GlossaryKey> = {
  gtc: 'tif_gtc',
  ioc: 'tif_ioc',
  fok: 'tif_fok',
  gtd: 'tif_gtd',
}

export const STP_TERMS: Record<StpMode, GlossaryKey> = {
  cancel_taker: 'stp_cancel_taker',
  cancel_maker: 'stp_cancel_maker',
  cancel_both: 'stp_cancel_both',
  decrement_and_cancel: 'stp_decrement_and_cancel',
}

export const ORDER_STATUS_TERMS: Record<OrderStatus, GlossaryKey> = {
  pending_trigger: 'pending_trigger',
  open: 'status_open',
  filled: 'status_filled',
  cancelled: 'status_cancelled',
  rejected: 'status_rejected',
  expired: 'status_expired',
}

export const MARKET_STATUS_TERMS: Record<MarketStatus, GlossaryKey> = {
  active: 'market_active',
  post_only: 'market_post_only',
  cancel_only: 'market_cancel_only',
  halted: 'market_halted',
}

export const TRANSFER_STATUS_TERMS: Record<TransferStatus, GlossaryKey> = {
  pending: 'transfer_pending',
  settled: 'transfer_settled',
  refused: 'transfer_refused',
  unresolved: 'transfer_unresolved',
}

export const TRANSFER_DIRECTION_TERMS: Record<TransferDirection, GlossaryKey> = {
  deposit: 'transfer_in',
  withdrawal: 'transfer_out',
}

/* ══════════════════════════════ labels ══════════════════════════════ */

/**
 * A wire value as a word, falling back to the value itself.
 *
 * The fallback is the whole reason this is a function rather than an index. `GET /v1/capabilities`
 * serves the engine's live vocabularies so that "a deployment that gains a new order type gains the
 * control for it without a second release" (`trade/src/server.ts`), which means this bundle can
 * legitimately be handed a value its types have never seen. Printing `stop_trailing` is honest;
 * printing an empty cell is not.
 */
function labelled<K extends string>(table: Record<K, string>, value: string): string {
  return (table as Record<string, string | undefined>)[value] ?? value
}

const ORDER_TYPE_LABELS: Record<PlacedOrderType, string> = {
  limit: 'Limit',
  market: 'Market',
  stop_limit: 'Stop limit',
  stop_market: 'Stop market',
}

const TIF_LABELS: Record<TimeInForce, string> = {
  gtc: 'Good til cancelled',
  ioc: 'Immediate or cancel',
  fok: 'Fill or kill',
  gtd: 'Good til time',
}

const STP_LABELS: Record<StpMode, string> = {
  cancel_taker: 'Cancel the new order',
  cancel_maker: 'Cancel the resting order',
  cancel_both: 'Cancel both',
  decrement_and_cancel: 'Reduce both',
}

/**
 * The order event trail, as sentences.
 *
 * These are full clauses rather than nouns because the timeline reads as a sequence of things that
 * happened to one order, and "Cancelled" after "Accepted" is a story while "cancel" is a database
 * column. `reduced` is the one that needs the words most: it is what self-trade prevention in
 * `decrement_and_cancel` mode does to a RESTING order, and a customer who sees their size shrink
 * with no fill against it has no other way to find out why.
 */
const ORDER_EVENT_LABELS: Record<OrderEventKind, string> = {
  accepted: 'Accepted onto the book',
  triggered: 'Its trigger fired',
  filled: 'Traded',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  expired: 'Expired',
  reduced: 'Reduced in size',
}

export const orderTypeLabel = (value: string): string => labelled(ORDER_TYPE_LABELS, value)
export const tifLabel = (value: string): string => labelled(TIF_LABELS, value)
export const stpLabel = (value: string): string => labelled(STP_LABELS, value)
export const orderEventLabel = (value: string): string => labelled(ORDER_EVENT_LABELS, value)

/**
 * The explanation for a wire value, or `null` when this bundle has never heard of it.
 *
 * `null` rather than a placeholder: a control this app cannot explain still works — the engine
 * accepts it — and hiding it would remove a feature nobody could then file a bug against. The
 * tooltip is simply absent, which is visibly different from an empty one.
 */
export function explanationFor<K extends string>(
  table: Record<K, GlossaryKey>,
  value: string,
): Explanation | null {
  const key = (table as Record<string, GlossaryKey | undefined>)[value]
  return key === undefined ? null : GLOSSARY[key]
}
