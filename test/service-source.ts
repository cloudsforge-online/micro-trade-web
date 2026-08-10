/**
 * READING ANOTHER REPOSITORY'S SOURCE BY STRUCTURE, NEVER BY POSITION.
 *
 * `test/trade.test.ts` proves that every route this bundle calls is really registered by
 * micro-trade, and really authenticates the way this client believes. To do that it has to read a
 * file that a DIFFERENT repository owns and edits, and that is the whole difficulty: any anchor
 * naming a POSITION in that file is a promise this repository cannot keep.
 *
 * micro-org#235 is the bill for that promise. This suite and micro-mint-web's both cited
 * `path:line`, both services moved, and thirty tests went red with no frontend defect behind any of
 * them. One went red in the worst way available: mint-web sliced a handler body from a recorded
 * line, landed in the TAIL OF THE PREVIOUS HANDLER, and reported that `POST /v1/tokens` makes no
 * `authenticate()` call. The service does — it is the first statement of that handler in
 * `mint/src/server.ts`. The test accused the frontend of a defect that did not exist, which is a
 * good deal worse than a test that merely fails.
 *
 * ── A BYTE OFFSET IS THE SAME DEFECT IN A DIFFERENT UNIT ────────────────────────────────────────
 *
 * Replacing `lines[341]` with `source.slice(at, at + 900)` does not fix this; it re-anchors it.
 * "Nine hundred characters from a match" is not a function, it is a window that happens to contain
 * one today, and it fails in BOTH directions:
 *
 *   * it goes RED when the function grows past the window — micro-trade edits `ownedBot`, this
 *     repository turns red, and nothing here is wrong. That is micro-org#235 again;
 *   * it goes GREEN when the window overruns the function and the assertion is satisfied by the
 *     NEXT one. Measured against micro-trade as it stands: `ownedBot` is a little over four hundred
 *     characters and the window was nine hundred, so some five hundred characters of the comment
 *     and body of `backtestView` were being graded as if they were `ownedBot`. Delete the
 *     `authenticate` call from `ownedBot` and the assertion would still have passed on whatever the
 *     window ran into. Nothing failed, which is exactly the problem: a guard that cannot fail is
 *     worse than no guard, because it is believed.
 *
 * So this module locates things the only way that survives an edit made somewhere else: by parsing
 * the file, and bounding every slice on a construct that GROWS WITH WHAT IT CONTAINS. A route body
 * is the `define(…)` call — from its name to the parenthesis that closes it. A helper body is the
 * function — from its declaration to the brace that closes it. Neither is a count of anything.
 *
 * ── TWO ESTATE RULES THIS OBEYS, AND WHY EACH ONE IS LOAD-BEARING HERE ──────────────────────────
 *
 * **Comments are stripped before anything is matched.** Sources in this estate quote deleted code
 * in comments on purpose — this file does it three paragraphs up. A scan that reads raw text counts
 * a `define('GET', '/v1/…'` that somebody quoted in a comment as a REGISTERED ROUTE, and the
 * "this bundle knows about everything the service serves" check then fails naming a route that does
 * not exist. Comments are blanked to spaces (newlines kept, so both copies stay line-for-line with
 * the original and an offset computed on one is valid in the other).
 *
 * **Whitespace is flattened before anything is matched.** The registration is found with `\s*`
 * between its arguments rather than as a fixed line shape, and handler bodies are handed back with
 * runs of whitespace collapsed to one space. A formatter that wraps `define('POST', '/v1/bots',` on
 * to three lines, or breaks `await authenticate(ctx, deps)` across two, must not be able to make
 * this repository claim a route is unregistered or unauthenticated. That is the same false
 * accusation as micro-org#235 arriving by a different road.
 *
 * ── NOTHING HERE MAY FAIL QUIETLY ───────────────────────────────────────────────────────────────
 *
 * Every lookup either returns the construct or THROWS, naming what it looked for and the resolved
 * file it looked in. A matcher that finds nothing and hands back an empty string is worse than the
 * line numbers were: `assert.doesNotMatch('', /authenticate\(/)` passes, and it passes for ever.
 * The route-not-found error also reports what the file DID contain, so a reader can tell "micro-
 * trade dropped this route" from "the parser stopped understanding the file" without opening it.
 */

/** One `define('METHOD', '/path', handler)` registration, located structurally. */
export interface Registration {
  readonly method: string
  readonly path: string
  /**
   * WHICH REGISTRAR DECLARED IT — `define` or `exchangeRoute`.
   *
   * Not decoration. micro-trade wraps every order-book route in `exchangeRoute`, which checks
   * `deps.exchangeEnabled` and throws `ExchangeDisabledError` before the handler runs, and its own
   * comment says why it is done at declaration: "Eighteen copies of one `if` is eighteen chances to
   * forget it, and the one that gets forgotten will be a mutating route — a placement or a
   * withdrawal — because those are the ones written last."
   *
   * This repository depends on that. `OrderBookGate` shows a whole surface or refuses it on the
   * strength of one capability read, and the promise underneath is that no exchange route can be
   * reached on a deployment with the flag off. If micro-trade ever registers an order-book route
   * with a bare `define`, that promise is broken in the service and this bundle would keep making
   * it — so `test/trade.test.ts` asserts the registrar per route, and the registrar is only
   * knowable if the parser records which one it saw.
   */
  readonly registrar: string
  /**
   * The whole `define(…)` or `exchangeRoute(…)` call: comments removed, whitespace flattened to
   * single spaces.
   *
   * Bounded by the parenthesis that CLOSES the call, so it is exactly the registration and its
   * handler however large either grows — it cannot run into the next route, and it cannot run off
   * the end of the route array into the helpers below it.
   */
  readonly body: string
}

export interface ServiceSource {
  /** The resolved path this was read from, for error messages that a reader can act on. */
  readonly file: string
  /** Every route registration in the file, in source order, comments excluded. */
  readonly registrations: readonly Registration[]
  /** The whole file with comments removed and whitespace flattened, for file-wide assertions. */
  readonly code: string
  /** The body of one registration. Throws, loudly, if the service does not register it. */
  routeBody(method: string, path: string): string
  /** One whole registration. Throws, loudly, if the service does not register it. */
  route(method: string, path: string): Registration
  /** The body of one top-level function. Throws, loudly, if the service no longer declares it. */
  functionBody(name: string): string
  /**
   * The body of one top-level `const name = … => { … }` or `const name = function (…) { … }`.
   *
   * `functionBody` only matches a `function` DECLARATION, and micro-trade declares several of the
   * helpers this suite reasons about as consts — `exchangeRoute`, `reader`, `writer`. Asking
   * `functionBody('exchangeRoute')` for one of those throws "no longer declares a function called
   * exchangeRoute", which reads as "the service deleted it" and is not what happened. Two matchers
   * rather than one that guesses, so the error message stays true.
   */
  declarationBody(name: string): string
}

/**
 * The one ambiguity a character scanner has to resolve: `/` is division after a value and the start
 * of a regular expression after an operator. Guessing wrong swallows the rest of the file as a
 * regex body, so the decision is made on the last significant character — the standard heuristic,
 * and more than enough for sources a formatter has already normalised. micro-mint's route table
 * really does contain `!/^[A-Z0-9]{2,12}$/.test(symbol)`, so this is not hypothetical.
 */
const REGEX_MAY_START_AFTER = '(,=:[!&|?{};+-*%~^<>'

/**
 * Two same-length copies of the source:
 *
 *   `code`     — comments blanked to spaces. What gets MATCHED against, per the estate rule.
 *   `skeleton` — comments blanked AND the contents of strings, template literals and regular
 *                expressions blanked too. What gets BRACKET-MATCHED against, so that a `)` inside
 *                `'GET /v1/series/:id/bars'` or inside a template can never be mistaken for the one
 *                that closes a call.
 *
 * Newlines are preserved in both, so all three strings are the same length and an index found in
 * one is meaningful in the others.
 */
function scan(text: string): { code: string; skeleton: string } {
  const code = text.split('')
  const skeleton = text.split('')
  const n = text.length

  const blank = (from: number, to: number, alsoCode: boolean): void => {
    for (let k = from; k < to && k < n; k++) {
      if (text[k] === '\n') continue
      skeleton[k] = ' '
      if (alsoCode) code[k] = ' '
    }
  }

  let i = 0
  /** The last non-whitespace character of real code, for the regex-or-division decision above. */
  let prev = ''
  let inTemplate = false
  /** The brace depth at each open `${`, so the matching `}` returns to template scanning. */
  const substitutions: number[] = []
  let depth = 0

  while (i < n) {
    if (inTemplate) {
      const start = i
      let closed = false
      while (i < n) {
        const c = text[i]
        if (c === '\\') {
          i += 2
          continue
        }
        if (c === '`') {
          blank(start, i, false)
          i += 1
          inTemplate = false
          prev = '`'
          closed = true
          break
        }
        if (c === '$' && text[i + 1] === '{') {
          blank(start, i, false)
          substitutions.push(depth)
          i += 2
          inTemplate = false
          prev = '{'
          closed = true
          break
        }
        i += 1
      }
      if (!closed) {
        blank(start, n, false)
        break
      }
      continue
    }

    const c = text[i] as string
    const d = text[i + 1]

    if (c === '/' && d === '/') {
      const nl = text.indexOf('\n', i)
      const end = nl === -1 ? n : nl
      blank(i, end, true)
      i = end
      continue
    }
    if (c === '/' && d === '*') {
      const close = text.indexOf('*/', i + 2)
      const end = close === -1 ? n : close + 2
      blank(i, end, true)
      i = end
      continue
    }
    if (c === "'" || c === '"') {
      const start = i + 1
      i = start
      while (i < n && text[i] !== c) {
        if (text[i] === '\\') i += 1
        i += 1
      }
      blank(start, i, false)
      i += 1
      prev = c
      continue
    }
    if (c === '`') {
      i += 1
      inTemplate = true
      continue
    }
    if (c === '/' && (prev === '' || REGEX_MAY_START_AFTER.includes(prev))) {
      const start = i + 1
      i = start
      let inClass = false
      while (i < n) {
        const r = text[i]
        if (r === '\\') {
          i += 2
          continue
        }
        if (r === '\n') break
        if (r === '[') inClass = true
        else if (r === ']') inClass = false
        else if (r === '/' && !inClass) break
        i += 1
      }
      blank(start, i, false)
      i += 1
      while (i < n && /[a-z]/.test(text[i] as string)) i += 1
      // A regular expression is a VALUE, so a `/` after it is division, not another regex.
      prev = ')'
      continue
    }

    if (c === '{') {
      depth += 1
    } else if (c === '}') {
      const open = substitutions[substitutions.length - 1]
      if (open !== undefined && depth === open) {
        substitutions.pop()
        i += 1
        inTemplate = true
        continue
      }
      depth -= 1
    }
    if (!/\s/.test(c)) prev = c
    i += 1
  }

  return { code: code.join(''), skeleton: skeleton.join('') }
}

/**
 * Whitespace flattened, so that where a formatter chose to break a line cannot change an answer.
 *
 * Runs of whitespace collapse to one space, and then the three things prettier does when it decides
 * a call no longer fits on one line are undone: it indents the arguments, it puts the closer on its
 * own line, and it adds a trailing comma. So
 *
 *     const principal = await authenticate(
 *       ctx,
 *       deps,
 *     )
 *
 * flattens to `const principal = await authenticate(ctx, deps)` and still answers to the needle
 * this suite asserts with. Without that, micro-trade could turn this repository red by reformatting
 * — and it would do it in the shape micro-org#235 is about, by reporting that a handler which
 * plainly authenticates does not. The space AFTER a comma is deliberately kept, because that is how
 * the needles are written and how the source reads on one line.
 */
const flatten = (text: string): string =>
  text
    .replace(/\s+/g, ' ')
    .replace(/,(\s*[)\]}])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .replace(/\s+([)\]}])/g, '$1')
    .trim()

/**
 * The index just PAST the bracket that closes the one at `open`.
 *
 * This is the structural boundary the whole module rests on, so it does not fall back to a
 * plausible answer: an unbalanced file throws rather than returning the end of the buffer, because
 * "the slice ran to the end of the file" is the failure that produced micro-org#235's false
 * accusation, and it must be reported as a broken read rather than served as a body.
 */
function closerOf(skeleton: string, open: number, file: string): number {
  const opener = skeleton[open] as string
  const closer = opener === '(' ? ')' : opener === '{' ? '}' : ']'
  let depth = 0
  for (let i = open; i < skeleton.length; i++) {
    const c = skeleton[i]
    if (c === opener) depth += 1
    else if (c === closer) {
      depth -= 1
      if (depth === 0) return i + 1
    }
  }
  throw new Error(
    `${file}: the '${opener}' at offset ${open} is never closed. The file did not parse, so no ` +
      `assertion made against it means anything — do not read this as a service defect.`,
  )
}

/**
 * A registration, wherever it sits, whichever registrar declared it.
 *
 * `\s*` rather than a fixed line shape on purpose: the arguments are allowed to be wrapped across
 * lines by a formatter without this repository concluding that micro-trade dropped a route. The
 * registrar token is confirmed against the skeleton so that the word appearing INSIDE a string can
 * never be read as a registration.
 *
 * TWO REGISTRARS, ALTERNATED RATHER THAN GENERALISED. It is tempting to match `\w+\s*\('([A-Z]+)'`
 * and take whatever is in front, which would need no edit when micro-trade adds a third. That is
 * the wrong trade: this parser's whole job is to fail LOUDLY when the file stops looking the way
 * this repository believes, and a pattern that matches any identifier would silently promote
 * `describe('GET', …)` — or a future `deprecatedRoute(…)` that answers 410 — to a live route. An
 * unrecognised registrar should make `every route this bundle names is really registered` go red
 * with a route missing, which sends a reader to the service. Naming the two is one line of
 * maintenance for that.
 */
const REGISTRARS = ['define', 'exchangeRoute'] as const
const REGISTRATION = new RegExp(
  String.raw`\b(${REGISTRARS.join('|')})\s*\(\s*'([A-Z]+)'\s*,\s*'([^']*)'`,
  'g',
)

export function readServiceSource(file: string, text: string): ServiceSource {
  const { code, skeleton } = scan(text)

  const registrations: Registration[] = []
  for (const match of code.matchAll(REGISTRATION)) {
    const at = match.index
    const registrar = match[1] as string
    if (skeleton.slice(at, at + registrar.length) !== registrar) continue
    const open = code.indexOf('(', at)
    const end = closerOf(skeleton, open, file)
    registrations.push({
      method: match[2] as string,
      path: match[3] as string,
      registrar,
      body: flatten(code.slice(at, end)),
    })
  }

  const describeWhatWasFound = (): string =>
    registrations.length === 0
      ? 'The file registers NO routes at all, which means this matcher stopped understanding it — ' +
        'read that as a defect here, not in the service.'
      : `The file registers ${registrations.length}: ` +
        registrations.map((r) => `${r.method} ${r.path}`).join(', ')

  const route = (method: string, path: string): Registration => {
    const found = registrations.find((r) => r.method === method && r.path === path)
    if (!found) {
      // Loud, and specific about which of the two possible worlds this is. Returning '' here would
      // make `assert.doesNotMatch(body, /authenticate\(/)` pass for ever.
      throw new Error(
        `${method} ${path} is not registered in ${file}. ${describeWhatWasFound()}`,
      )
    }
    return found
  }

  const routeBody = (method: string, path: string): string => route(method, path).body

  const functionBody = (name: string): string => {
    const declaration = new RegExp(
      `(?:^|[\\n;}])\\s*(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`,
    )
    const found = declaration.exec(code)
    if (!found) {
      throw new Error(
        `${file} no longer declares a function called ${name}. Every assertion this suite makes ` +
          'about that helper is now unverifiable; re-read the service rather than deleting them.',
      )
    }
    const start = code.indexOf('function', found.index)
    const params = code.indexOf('(', start)
    let cursor = closerOf(skeleton, params, file)

    // Skip the RETURN TYPE, which may itself contain braces: micro-trade's `ownedBot` is declared
    // `): Promise<{ principal: Principal; bot: BotRecord }> {`, and brace-matching the first `{`
    // after the parameters would return the object type rather than the function. The body is the
    // first braced region that is not immediately continued by type syntax.
    for (;;) {
      const brace = skeleton.indexOf('{', cursor)
      if (brace === -1) {
        throw new Error(`${file}: the declaration of ${name} has no body.`)
      }
      const end = closerOf(skeleton, brace, file)
      const after = skeleton.slice(end).trimStart().charAt(0)
      if (after === '' || !'>|&,;)]=.'.includes(after)) {
        return flatten(code.slice(start, end))
      }
      cursor = end
    }
  }

  /**
   * A top-level `const name = …`, bounded by the end of its own initialiser.
   *
   * ── Why this cannot brace-match like `functionBody` does ─────────────────────────────────────
   *
   * The helpers this is for are CONCISE arrows. micro-trade's `exchangeRoute` is
   * `const exchangeRoute = (…): Route => define(method, path, async (ctx, deps) => { … })` — an
   * expression, whose outermost bracket is a parenthesis belonging to a call, not a brace belonging
   * to a body. Brace-matching the first `{` after the name returns the arrow's INNER handler and
   * stops before the `)` that closes the call, so an assertion about the whole helper would be
   * graded against a fragment of it.
   *
   * So the boundary is the end of the STATEMENT, found structurally: a newline at bracket depth
   * zero, where the last significant character does not continue the expression. `=>`, an operator
   * or an open bracket means the initialiser runs on; anything else means it finished. Depth is the
   * structural part and is what makes this survive an edit — the helper may grow to fifty lines and
   * gain any number of nested calls without moving its own end.
   *
   * The one shape this deliberately does not accept is a declaration indented inside something
   * else. A `const` nested in a function is a different symbol that happens to share a name, and
   * grading an assertion against it is the mistake micro-org#235 is about.
   */
  const declarationBody = (name: string): string => {
    const declaration = new RegExp(
      `(?:^|\\n)(?:export\\s+)?(?:const|let)\\s+${name}\\s*(?::|=)`,
    )
    const found = declaration.exec(code)
    if (!found) {
      throw new Error(
        `${file} no longer declares a top-level const called ${name}. Every assertion this suite ` +
          'makes about that helper is now unverifiable; re-read the service rather than deleting ' +
          'them. (If it became a `function`, use functionBody instead.)',
      )
    }
    const start = code.indexOf(name, found.index)
    const CONTINUES = '=>,.:?|&+-*/%<([{'
    let depth = 0
    let significant = ''
    for (let i = start; i < skeleton.length; i++) {
      const c = skeleton[i] as string
      if ('([{'.includes(c)) depth += 1
      else if (')]}'.includes(c)) depth -= 1
      else if (c === '\n') {
        if (depth === 0 && significant !== '' && !CONTINUES.includes(significant)) {
          return flatten(code.slice(start, i))
        }
        continue
      }
      if (!/\s/.test(c)) significant = c
    }
    throw new Error(
      `${file}: the declaration of ${name} never ends. The file did not parse, so no assertion ` +
        'made against it means anything — do not read this as a service defect.',
    )
  }

  return {
    file,
    registrations,
    code: flatten(code),
    route,
    routeBody,
    functionBody,
    declarationBody,
  }
}
