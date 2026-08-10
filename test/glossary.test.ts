/**
 * A CONTROL THAT CAN SPEND MONEY EXPLAINS ITSELF.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * `src/lib/glossary.ts` makes a strong claim in its header: that a screen on this surface **cannot**
 * offer a control this app is unable to explain. Most of that claim is enforced by the type system —
 * the vocabulary maps are `Record<Union, GlossaryKey>` over the engine's own unions, so a new time-
 * in-force does not compile until somebody has written the sentence for it.
 *
 * The type system cannot enforce the other three halves of the promise, and this file does:
 *
 *   1. **The sentences are sentences.** A `plain` of `'TODO'` satisfies `Explanation` perfectly. So
 *      does an empty string. Both would ship a tooltip that opens on nothing, which teaches a reader
 *      that the tooltips here are not worth opening — and that is a worse outcome than no tooltip,
 *      because it is unrecoverable.
 *   2. **Nothing in the glossary states a per-market number.** The header forbids it: "the number
 *      comes from the MARKET on the wire, never from this file… a copy of one in a glossary is a lie
 *      waiting for a config change." A fee written into a sentence here is invisible when it goes
 *      wrong, because it will still read as a confident fact.
 *   3. **Every entry is reachable, and every `<Explain term>` in the app is an entry.** The second
 *      half is a compile error already. The FIRST half is not: an explanation nothing references is
 *      dead copy, it is never read by a reviewer looking at a screen, and it drifts.
 *
 * The last describe reads micro-trade and asserts that the vocabularies this glossary covers are
 * exactly the ones the engine has. That is the assertion that catches the real failure: not a term
 * spelled wrong, but a term the SERVICE gained while this bundle was not looking.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import {
  GLOSSARY,
  MARKET_STATUS_TERMS,
  ORDER_STATUS_TERMS,
  ORDER_TYPE_TERMS,
  STP_TERMS,
  TIF_TERMS,
  TRANSFER_DIRECTION_TERMS,
  TRANSFER_STATUS_TERMS,
  explanationFor,
  orderEventLabel,
  orderTypeLabel,
  stpLabel,
  tifLabel,
  type GlossaryKey,
} from '../src/lib/glossary.ts'

const here = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))

const entries = Object.entries(GLOSSARY) as ReadonlyArray<
  readonly [GlossaryKey, { term: string; plain: string }]
>

describe('the vocabulary is real copy, not placeholders', () => {
  it('has enough of it to be the glossary this suite means', () => {
    // Without a floor, every `for` below iterates an empty list and passes for ever. Deliberately
    // loose: this is a guard against the map being emptied or renamed, not a count to maintain.
    assert.ok(entries.length >= 40, `the glossary holds only ${entries.length} entries`)
  })

  for (const [key, entry] of entries) {
    it(`${key} is written`, () => {
      assert.ok(entry.term.trim().length >= 3, `${key} has no term`)
      assert.doesNotMatch(entry.term, /_/, `${key}'s term is a wire value, not a printed word`)

      // Long enough to be an explanation rather than a restatement of the label. The shortest real
      // one in the file — `balance_available`, "What you can spend or withdraw right now." — is 40
      // characters, so this floor admits it and refuses anything that is merely the term again.
      assert.ok(
        entry.plain.trim().length >= 35,
        `${key}'s explanation is ${entry.plain.trim().length} characters: "${entry.plain}"`,
      )
      assert.match(entry.plain, /[.!?]$/, `${key}'s explanation does not end in a full stop`)
      assert.doesNotMatch(entry.plain, /\bTODO\b|\bTBD\b|\bXXX\b/i, `${key} is a placeholder`)

      // A definition that begins by naming the thing it defines teaches nobody: "Post only: an
      // order that is post only." The house style is to say what it DOES first.
      assert.doesNotMatch(
        entry.plain.slice(0, entry.term.length + 2),
        new RegExp(`^${entry.term}\\b`, 'i'),
        `${key}'s explanation opens by repeating its own term`,
      )
    })
  }

  it('states no per-market number anywhere', () => {
    // Every one of these is a value that differs per market and per deployment: a fee, a tick, a
    // lot, a minimum notional, a rate window. `GET /v1/markets` and `GET /v1/capabilities` carry
    // the real ones, and the screens read them from there.
    for (const [key, entry] of entries) {
      assert.doesNotMatch(entry.plain, /[$£€]/, `${key} quotes a currency amount`)
      // `fee_bps` is the entry that teaches the UNIT, so it is the one place a figure in basis
      // points is not a copied market value. The exemption is pinned by its own test below, so it
      // cannot quietly widen to a second entry.
      if (key !== 'fee_bps') {
        assert.doesNotMatch(
          entry.plain,
          /\b\d+(?:\.\d+)?\s*(?:bps|basis points)\b/i,
          `${key} states a fee in basis points; fees come from the market on the wire`,
        )
      }
      assert.doesNotMatch(
        entry.plain,
        /\bper (?:second|minute|hour|day)\b/i,
        `${key} states a rate limit; the limit is the service's and is served by it`,
      )
    }
  })

  it('makes its one arithmetic example in the one place a unit has to be taught', () => {
    // `fee_bps` says "25 bps is 0.25%", which the rule above would forbid anywhere else and which
    // belongs here: it teaches the UNIT, and the unit is fixed. This test exists so that exemption
    // is stated rather than discovered by somebody wondering why the scan let it through.
    assert.match(GLOSSARY.fee_bps.plain, /0\.25%/)
    const withPercents = entries.filter(([, e]) => /\d%/.test(e.plain)).map(([k]) => k)
    assert.deepEqual(withPercents, ['fee_bps'])
    const withBps = entries
      .filter(([, e]) => /\b\d+(?:\.\d+)?\s*(?:bps|basis points)\b/i.test(e.plain))
      .map(([k]) => k)
    assert.deepEqual(withBps, ['fee_bps'])
  })

  it('never tells the reader to hover', () => {
    // This surface is used on touch devices, where there is no hover, and by keyboard, where there
    // is none either. Copy that names an interaction half the readers cannot perform is worse than
    // no copy: it tells them the information exists and is out of reach.
    for (const [key, entry] of entries) {
      assert.doesNotMatch(entry.plain, /\bhover\b/i, `${key} tells the reader to hover`)
      assert.doesNotMatch(entry.plain, /\bclick here\b/i, `${key} says "click here"`)
    }
  })
})

describe('every vocabulary the engine has is mapped to an explanation that exists', () => {
  const MAPS: ReadonlyArray<readonly [string, Record<string, GlossaryKey>]> = [
    ['ORDER_TYPE_TERMS', ORDER_TYPE_TERMS],
    ['TIF_TERMS', TIF_TERMS],
    ['STP_TERMS', STP_TERMS],
    ['ORDER_STATUS_TERMS', ORDER_STATUS_TERMS],
    ['MARKET_STATUS_TERMS', MARKET_STATUS_TERMS],
    ['TRANSFER_STATUS_TERMS', TRANSFER_STATUS_TERMS],
    ['TRANSFER_DIRECTION_TERMS', TRANSFER_DIRECTION_TERMS],
  ]

  for (const [name, map] of MAPS) {
    it(`${name} points at nothing missing`, () => {
      const keys = Object.keys(map)
      assert.ok(keys.length >= 2, `${name} is empty`)
      for (const value of keys) {
        const key = map[value] as GlossaryKey
        assert.ok(key in GLOSSARY, `${name}.${value} points at "${key}", which is not a glossary key`)
        assert.equal(explanationFor(map, value), GLOSSARY[key])
      }
    })
  }

  it('answers null for a value this release has never heard of', () => {
    // A deployment ahead of this bundle serves order types this bundle has no sentence for. The
    // control still works — the engine accepts it — and the tooltip is simply absent, which is
    // visibly different from an empty one.
    assert.equal(explanationFor(ORDER_TYPE_TERMS, 'stop_trailing'), null)
    assert.equal(explanationFor(TIF_TERMS, ''), null)
  })

  it('labels an unknown wire value as itself rather than as a blank cell', () => {
    assert.equal(orderTypeLabel('stop_trailing'), 'stop_trailing')
    assert.equal(tifLabel('gtx'), 'gtx')
    assert.equal(stpLabel('nothing'), 'nothing')
    assert.equal(orderEventLabel('amended'), 'amended')
  })

  it('labels the values it does know', () => {
    assert.equal(orderTypeLabel('stop_limit'), 'Stop limit')
    assert.equal(tifLabel('ioc'), 'Immediate or cancel')
    assert.equal(stpLabel('decrement_and_cancel'), 'Reduce both')
    assert.equal(orderEventLabel('reduced'), 'Reduced in size')
  })
})

/** Every `.ts`/`.tsx` under `src`, so the reachability scan cannot miss a page somebody added. */
function sources(dir = here('src')): readonly string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) found.push(...sources(path))
    else if (/\.tsx?$/.test(path)) found.push(path)
  }
  return found
}

describe('no explanation is dead copy', () => {
  /*
   * THE FILE THAT DECLARES THE KEYS IS NOT ALLOWED TO COUNT AS A USE OF THEM.
   *
   * Scanning it made this whole describe vacuous: every key matched its own declaration, so all
   * fifty-odd "is reachable from a screen" assertions passed by construction and would have gone on
   * passing for an entry nothing anywhere renders. It was caught by mutation — renaming a key and
   * finding the suite still green — which is the only way a check that cannot fail is ever found.
   *
   * There are two honest ways to reach an entry, so both are counted and nothing else is. A screen
   * can name it (`<Explain term="…">`), or one of the seven vocabulary maps can point at it, which
   * is how a value that only ever arrives ON THE WIRE — `stop_limit`, `gtd`, `cancel_only` — is
   * explained at runtime. Those maps are themselves held to the engine's own unions further down, so
   * counting them is not the same as counting the declaration.
   */
  const scanned = sources().filter((path) => !path.endsWith('/lib/glossary.ts'))
  const all = scanned.map((path) => readFileSync(path, 'utf8')).join('\n')
  const mapped = new Set<string>(
    [
      MARKET_STATUS_TERMS,
      ORDER_STATUS_TERMS,
      ORDER_TYPE_TERMS,
      STP_TERMS,
      TIF_TERMS,
      TRANSFER_DIRECTION_TERMS,
      TRANSFER_STATUS_TERMS,
    ].flatMap((table) => Object.values(table) as string[]),
  )

  it('is scanning a bundle with pages in it, and not the glossary itself', () => {
    assert.ok(scanned.length >= 25, `only ${scanned.length} sources found`)
    assert.equal(scanned.length, sources().length - 1, 'the glossary was not excluded exactly once')
    assert.match(all, /<Explain term=/)
    assert.doesNotMatch(all, /export const GLOSSARY/, 'the declarations are still in the scan')
    assert.ok(mapped.size >= 20, `only ${mapped.size} keys are reachable through a vocabulary map`)
  })

  for (const [key] of entries) {
    it(`${key} is reachable from a screen`, () => {
      // Either named directly by `<Explain term="…">` / `GLOSSARY.…`, or pointed at by one of the
      // vocabulary maps — which is how every wire value's explanation is reached at runtime.
      const named = new RegExp(`\\b${key}\\b`).test(all) || mapped.has(key)
      assert.ok(
        named,
        `nothing in src names "${key}". An explanation no screen can show is copy no reviewer ` +
          'reads and no reader benefits from; delete it or wire it up.',
      )
    })
  }
})

/**
 * THE ENGINE'S VOCABULARY, READ FROM THE ENGINE.
 *
 * Skipped without a sibling checkout — `pnpm test` must pass for somebody who has cloned only this
 * repository, and CI checks micro-trade out. `test/trade.test.ts` carries the full reasoning.
 */
const TRADE_SRC = [
  process.env['CLOUDSFORGE_TRADE_DIR'],
  here('../trade/src'),
  here('.trade/src'),
]
  .filter((v): v is string => Boolean(v))
  .map((p) => p.replace(/\/server\.ts$/, ''))
  .find((p) => existsSync(`${p}/matching.ts`))

/**
 * A `export type Name = 'a' | 'b'` union's members, however the formatter wrapped it.
 *
 * Bounded by the end of the DECLARATION, never by a blank line: micro-trade declares
 * `TransferDirection` and `TransferStatus` on consecutive lines with nothing between them, and a
 * scan that ran to the next blank line read the second union's members as the first's. That is the
 * micro-org#235 failure in miniature — a boundary that happens to hold today and reports a defect
 * in this repository when somebody else's formatter moves a line.
 *
 * A wrapped union continues on lines beginning `|`, so the declaration ends at the first line that
 * does not. Nothing here counts characters or lines.
 */
function unionMembers(source: string, name: string): readonly string[] {
  const at = source.search(new RegExp(`export type ${name}\\s*=`))
  assert.notEqual(at, -1, `the service no longer declares ${name}`)
  const lines = source.slice(at).split('\n')
  const body: string[] = [lines[0] as string]
  for (const line of lines.slice(1)) {
    if (!line.trimStart().startsWith('|')) break
    body.push(line)
  }
  const members = [...body.join('\n').matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string).sort()
  assert.ok(members.length > 0, `${name} parsed to no members at all, so this check is vacuous`)
  return members
}

describe('the glossary covers exactly what micro-trade serves', { skip: !TRADE_SRC }, () => {
  const read = (file: string) => readFileSync(`${TRADE_SRC}/${file}`, 'utf8')

  it('found the service to read', () => {
    assert.ok(TRADE_SRC)
    assert.match(read('matching.ts'), /export type TimeInForce/)
  })

  const CASES: ReadonlyArray<readonly [string, string, Record<string, GlossaryKey>]> = [
    ['matching.ts', 'TimeInForce', TIF_TERMS],
    ['matching.ts', 'StpMode', STP_TERMS],
    ['markets.ts', 'MarketStatus', MARKET_STATUS_TERMS],
    ['orders.ts', 'OrderStatus', ORDER_STATUS_TERMS],
    ['transfers.ts', 'TransferStatus', TRANSFER_STATUS_TERMS],
    ['transfers.ts', 'TransferDirection', TRANSFER_DIRECTION_TERMS],
  ]

  for (const [file, name, map] of CASES) {
    it(`${name} is explained, member for member`, () => {
      assert.deepEqual(
        Object.keys(map).sort(),
        unionMembers(read(file), name),
        `micro-trade's ${name} and this bundle's glossary disagree. The engine is the authority: ` +
          'add the missing explanation rather than the missing member.',
      )
    })
  }

  it('every order type the engine will ACCEPT has an explanation', () => {
    // `PlacedOrderType` is `OrderType | 'stop_limit' | 'stop_market'`, so the members are spread
    // across two declarations. `PLACED_ORDER_TYPES` is the frozen list the validator tests against,
    // which makes it the honest source for "what can be placed".
    const source = read('exchange.ts')
    const at = source.indexOf('PLACED_ORDER_TYPES')
    assert.notEqual(at, -1, 'the service no longer exports PLACED_ORDER_TYPES')
    const close = source.indexOf('])', at)
    const listed = [...source.slice(at, close).matchAll(/'([a-z_]+)'/g)]
      .map((m) => m[1] as string)
      .sort()
    assert.deepEqual(Object.keys(ORDER_TYPE_TERMS).sort(), listed)
  })

  it('every order event the engine can write has a sentence', () => {
    // Not a `Record` in the glossary — the events are labelled, not explained individually — so this
    // is the only thing holding the two lists together.
    const members = unionMembers(read('orders.ts'), 'OrderEventKind')
    for (const kind of members) {
      assert.notEqual(
        orderEventLabel(kind),
        kind,
        `micro-trade writes a "${kind}" event and this bundle would print the raw word for it`,
      )
    }
    assert.ok(members.includes('reduced'), 'the engine no longer records self-trade reductions')
  })
})
