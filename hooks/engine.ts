// Match-3 rules: board, matches, specials, combos, gravity, goals.
// Pure data in, data out, so the surface module and the tests share it.

import { TEXTS } from './i18n'
import type { Lang, Texts } from './i18n'

export type Kind = 'n' | 'row' | 'col' | 'bomb' | 'rainbow' | 'treasure'
export type Gem = { c: number; k: Kind; id: number }
export type Cell = { hole: boolean; stone: number; lock: boolean; ice: number; gem: Gem | null }

export type Goal =
  | { type: 'score'; target: number }
  | { type: 'ice' }
  | { type: 'stone' }
  | { type: 'collect'; colors: { c: number; n: number }[] }
  | { type: 'treasure'; n: number }

export type LevelDef = {
  moves: number
  layout: string[]
  goals: Goal[]
  // Score for 1, 2 and 3 stars; the first star also needs every goal met.
  stars: [number, number, number]
}

export type Phase = 'idle' | 'swap' | 'unswap' | 'flash' | 'fall' | 'won' | 'lost'

export type Game = {
  lvl: number
  lang: Lang
  R: number
  C: number
  cells: Cell[]
  moves: number
  score: number
  cascade: number
  collected: number[]
  treasures: number
  phase: Phase
  timer: number
  flash: number[]
  created: { i: number; gem: Gem }[]
  swap: [number, number] | null
  cursor: number
  sel: number
  hint: [number, number] | null
  idle: number
  msg: string
  msgTicks: number
  nextId: number
  reported: boolean
}

export const COLORS = ['#ff5f5f', '#ffd75f', '#5fd75f', '#5fafff', '#d787ff']
export const GLYPHS = ['●', '★', '▲', '◆', '■']

// Layout legend: . gem   # hole   i/I ice (1/2 layers)   s/S stone (1/2 hits)
//                L locked gem   T treasure
export const LEVELS: LevelDef[] = [
  {
    moves: 20,
    layout: ['........', '........', '........', '........', '........', '........', '........', '........'],
    goals: [{ type: 'score', target: 4000 }],
    stars: [4000, 6500, 9000],
  },
  {
    moves: 26,
    layout: [
      '.........',
      '.........',
      '..iiiii..',
      '.iiIIIii.',
      '.iiIIIii.',
      '.iiIIIii.',
      '..iiiii..',
      '.........',
      '.........',
    ],
    goals: [{ type: 'ice' }],
    stars: [0, 6000, 9500],
  },
  {
    moves: 28,
    layout: [
      '#.......#',
      '.........',
      '.s..s..s.',
      '.........',
      'sSs.s.sSs',
      '.........',
      '..s.S.s..',
      '.........',
      '#.......#',
    ],
    goals: [{ type: 'stone' }],
    stars: [0, 6500, 10000],
  },
  {
    moves: 24,
    layout: [
      '.........',
      '#.......#',
      '##.....##',
      '###...###',
      '###...###',
      '##.....##',
      '#.......#',
      '.........',
      '.........',
    ],
    goals: [{ type: 'collect', colors: [{ c: 0, n: 25 }, { c: 3, n: 25 }] }],
    stars: [0, 5500, 8500],
  },
  {
    moves: 30,
    layout: [
      '.T.....T.',
      '.........',
      '.........',
      'LL.LLL.LL',
      '.........',
      '..L...L..',
      '.........',
      '.........',
      '#.......#',
    ],
    goals: [{ type: 'treasure', n: 3 }],
    stars: [0, 6000, 9000],
  },
]

const tx = (g: Game): Texts => TEXTS[g.lang]

export const levelText = (lvl: number, lang: Lang) => TEXTS[lang].levels[lvl]

const rnd = (n: number) => Math.floor(Math.random() * n)

export const rc = (g: Game, i: number) => [Math.floor(i / g.C), i % g.C] as const
export const at = (g: Game, r: number, c: number) =>
  r >= 0 && r < g.R && c >= 0 && c < g.C ? r * g.C + c : -1

export function isSpecial(gem: Gem | null): boolean {
  return gem !== null && gem.k !== 'n' && gem.k !== 'treasure'
}

export function movable(g: Game, i: number): boolean {
  const cell = g.cells[i]
  return !!cell && !cell.hole && cell.stone === 0 && !cell.lock && cell.gem !== null
}

function colorAt(g: Game, i: number): number {
  if (i < 0) return -1
  const cell = g.cells[i]
  if (cell.hole || cell.stone > 0 || !cell.gem) return -1
  const { k, c } = cell.gem
  return k === 'rainbow' || k === 'treasure' ? -1 : c
}

function gem(g: Game, c: number, k: Kind = 'n'): Gem {
  return { c, k, id: g.nextId++ }
}

// ---------- setup ----------

export function newGame(lvl: number, lang: Lang = 'en'): Game {
  const def = LEVELS[lvl]
  const R = def.layout.length
  const C = def.layout[0].length
  const g: Game = {
    lvl, lang, R, C, cells: [], moves: def.moves, score: 0, cascade: 1,
    collected: [0, 0, 0, 0, 0], treasures: 0, phase: 'idle', timer: 0,
    flash: [], created: [], swap: null, cursor: Math.floor(R / 2) * C + Math.floor(C / 2),
    sel: -1, hint: null, idle: 0, msg: TEXTS[lang].levels[lvl].blurb, msgTicks: 60, nextId: 1, reported: false,
  }
  for (const row of def.layout) {
    for (const ch of row) {
      g.cells.push({
        hole: ch === '#',
        stone: ch === 's' ? 1 : ch === 'S' ? 2 : 0,
        lock: ch === 'L',
        ice: ch === 'i' ? 1 : ch === 'I' ? 2 : 0,
        gem: ch === 'T' ? { c: -1, k: 'treasure', id: 0 } : null,
      })
    }
  }
  for (const cell of g.cells) if (cell.gem) cell.gem.id = g.nextId++
  fillFresh(g)
  return g
}

// Colors every empty gem cell so the start has no match but at least one move.
function fillFresh(g: Game) {
  const empties = g.cells.flatMap((cell, i) =>
    !cell.hole && cell.stone === 0 && (!cell.gem || cell.gem.k === 'n') ? [i] : [])
  for (let tries = 0; tries < 300; tries++) {
    for (const i of empties) g.cells[i].gem = null
    for (const i of empties) {
      const [r, c] = rc(g, i)
      const banned = new Set<number>()
      const l1 = colorAt(g, at(g, r, c - 1))
      if (l1 >= 0 && l1 === colorAt(g, at(g, r, c - 2))) banned.add(l1)
      const u1 = colorAt(g, at(g, r - 1, c))
      if (u1 >= 0 && u1 === colorAt(g, at(g, r - 2, c))) banned.add(u1)
      const options = [0, 1, 2, 3, 4].filter(x => !banned.has(x))
      g.cells[i].gem = gem(g, options[rnd(options.length)])
    }
    if (findRuns(g).length === 0 && findMove(g)) return
  }
}

// ---------- matching ----------

type Run = { cells: number[]; dir: 'h' | 'v' }

export function findRuns(g: Game): Run[] {
  const runs: Run[] = []
  const scan = (outer: number, inner: number, idx: (o: number, n: number) => number, dir: 'h' | 'v') => {
    for (let o = 0; o < outer; o++) {
      let n = 0
      while (n < inner) {
        const c = colorAt(g, idx(o, n))
        let m = n + 1
        while (c >= 0 && m < inner && colorAt(g, idx(o, m)) === c) m++
        if (c >= 0 && m - n >= 3) {
          const cells: number[] = []
          for (let k = n; k < m; k++) cells.push(idx(o, k))
          runs.push({ cells, dir })
        }
        n = m
      }
    }
  }
  scan(g.R, g.C, (r, c) => r * g.C + c, 'h')
  scan(g.C, g.R, (c, r) => r * g.C + c, 'v')
  return runs
}

function hasMatchAt(g: Game, i: number): boolean {
  const c = colorAt(g, i)
  if (c < 0) return false
  const [r, col] = rc(g, i)
  const count = (dr: number, dc: number) => {
    let n = 0
    let rr = r + dr
    let cc = col + dc
    while (colorAt(g, at(g, rr, cc)) === c) { n++; rr += dr; cc += dc }
    return n
  }
  return count(0, -1) + count(0, 1) >= 2 || count(-1, 0) + count(1, 0) >= 2
}

function swapGems(g: Game, a: number, b: number) {
  const t = g.cells[a].gem
  g.cells[a].gem = g.cells[b].gem
  g.cells[b].gem = t
}

function isCombo(g: Game, a: number, b: number): boolean {
  const ga = g.cells[a].gem
  const gb = g.cells[b].gem
  if (!ga || !gb || ga.k === 'treasure' || gb.k === 'treasure') return false
  return (isSpecial(ga) && isSpecial(gb)) || ga.k === 'rainbow' || gb.k === 'rainbow'
}

export function findMove(g: Game): [number, number] | null {
  for (let i = 0; i < g.cells.length; i++) {
    if (!movable(g, i)) continue
    const [r, c] = rc(g, i)
    for (const j of [at(g, r, c + 1), at(g, r + 1, c)]) {
      if (j < 0 || !movable(g, j)) continue
      if (isCombo(g, i, j)) return [i, j]
      swapGems(g, i, j)
      const ok = hasMatchAt(g, i) || hasMatchAt(g, j)
      swapGems(g, i, j)
      if (ok) return [i, j]
    }
  }
  return null
}

// Groups touching runs into shapes and decides which special each one makes:
// 5 in a line → rainbow, L/T → bomb, 4 in a line → row/column rocket.
export function analyze(g: Game, prefer: number[]) {
  const runs = findRuns(g)
  const parent = runs.map((_, k) => k)
  const find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k])))
  const owner = new Map<number, number>()
  runs.forEach((run, k) => {
    for (const i of run.cells) {
      const other = owner.get(i)
      if (other === undefined) owner.set(i, k)
      else parent[find(k)] = find(other)
    }
  })
  const groups = new Map<number, Run[]>()
  runs.forEach((run, k) => {
    const root = find(k)
    groups.set(root, [...(groups.get(root) ?? []), run])
  })

  const clear = new Set<number>()
  const created: { i: number; gem: Gem }[] = []
  for (const group of groups.values()) {
    const cells = new Set(group.flatMap(run => run.cells))
    for (const i of cells) clear.add(i)
    const color = colorAt(g, group[0].cells[0])
    const longest = group.reduce((a, b) => (b.cells.length > a.cells.length ? b : a))
    const hasH = group.some(run => run.dir === 'h')
    const hasV = group.some(run => run.dir === 'v')
    let kind: Kind | null = null
    if (longest.cells.length >= 5) kind = 'rainbow'
    else if (hasH && hasV) kind = 'bomb'
    else if (longest.cells.length === 4) kind = longest.dir === 'h' ? 'row' : 'col'
    if (!kind) continue
    let pos = prefer.find(p => cells.has(p))
    if (pos === undefined && kind === 'bomb') {
      const hCells = new Set(group.filter(run => run.dir === 'h').flatMap(run => run.cells))
      pos = group.filter(run => run.dir === 'v').flatMap(run => run.cells).find(i => hCells.has(i))
    }
    if (pos === undefined) pos = longest.cells[Math.floor(longest.cells.length / 2)]
    created.push({ i: pos, gem: gem(g, kind === 'rainbow' ? -1 : color, kind) })
  }
  return { clear, created }
}

// ---------- clearing ----------

function mostCommonColor(g: Game): number {
  const counts = [0, 0, 0, 0, 0]
  for (const cell of g.cells) if (cell.gem && cell.gem.k !== 'rainbow' && cell.gem.c >= 0) counts[cell.gem.c]++
  return counts.indexOf(Math.max(...counts))
}

function allOfColor(g: Game, c: number): number[] {
  return g.cells.flatMap((cell, i) => (cell.gem && cell.gem.c === c && cell.gem.k !== 'treasure' ? [i] : []))
}

function area(g: Game, i: number, radius: number): number[] {
  const [r, c] = rc(g, i)
  const out: number[] = []
  for (let dr = -radius; dr <= radius; dr++)
    for (let dc = -radius; dc <= radius; dc++) {
      const j = at(g, r + dr, c + dc)
      if (j >= 0) out.push(j)
    }
  return out
}

const rowOf = (g: Game, i: number) => Array.from({ length: g.C }, (_, c) => rc(g, i)[0] * g.C + c)
const colOf = (g: Game, i: number) => Array.from({ length: g.R }, (_, r) => r * g.C + rc(g, i)[1])

// Grows a clear set through every special it touches: chain reactions.
export function expand(g: Game, initial: Iterable<number>, triggered: Set<number>): Set<number> {
  const out = new Set<number>()
  const queue = [...initial]
  while (queue.length) {
    const i = queue.pop()!
    if (out.has(i) || g.cells[i].hole) continue
    out.add(i)
    const cell = g.cells[i]
    const gm = cell.gem
    if (!gm || cell.lock || !isSpecial(gm) || triggered.has(i)) continue
    triggered.add(i)
    if (gm.k === 'row') queue.push(...rowOf(g, i))
    else if (gm.k === 'col') queue.push(...colOf(g, i))
    else if (gm.k === 'bomb') queue.push(...area(g, i, 1))
    else if (gm.k === 'rainbow') queue.push(...allOfColor(g, mostCommonColor(g)))
  }
  return out
}

// Two specials swapped together (or a rainbow with anything): the big effects.
export function comboClear(g: Game, a: number, b: number): { cells: Set<number>; msg: string } {
  const ga = g.cells[a].gem!
  const gb = g.cells[b].gem!
  const triggered = new Set([a, b])
  const rocket = (x: Gem) => x.k === 'row' || x.k === 'col'
  let start: number[] = [a, b]
  let msg = ''

  if (ga.k === 'rainbow' && gb.k === 'rainbow') {
    start = g.cells.map((_, i) => i)
    msg = tx(g).comboAll
  } else if (ga.k === 'rainbow' || gb.k === 'rainbow') {
    const other = ga.k === 'rainbow' ? gb : ga
    const targets = allOfColor(g, other.c)
    if (other.k === 'n') {
      msg = tx(g).comboColor(tx(g).colors[other.c])
    } else {
      for (const i of targets) {
        if (g.cells[i].lock) continue
        const k: Kind = other.k === 'bomb' ? 'bomb' : rnd(2) ? 'row' : 'col'
        g.cells[i].gem = { ...g.cells[i].gem!, k }
      }
      // The swapped special itself fires as converted, the rainbow is spent.
      triggered.delete(ga.k === 'rainbow' ? b : a)
      msg = other.k === 'bomb' ? tx(g).comboBombs : tx(g).comboRockets
    }
    start = [a, b, ...targets]
  } else if (rocket(ga) && rocket(gb)) {
    start = [...rowOf(g, b), ...colOf(g, b)]
    msg = tx(g).comboCross
  } else if (ga.k === 'bomb' && gb.k === 'bomb') {
    start = area(g, b, 2)
    msg = tx(g).comboBigBlast
  } else {
    const [r, c] = rc(g, b)
    for (let d = -1; d <= 1; d++) {
      if (r + d >= 0 && r + d < g.R) start.push(...rowOf(g, at(g, r + d, 0)))
      if (c + d >= 0 && c + d < g.C) start.push(...colOf(g, at(g, 0, c + d)))
    }
    msg = tx(g).comboBigCross
  }
  return { cells: expand(g, start, triggered), msg }
}

function applyClear(g: Game) {
  const stoneHits = new Set<number>()
  for (const i of g.flash) {
    const cell = g.cells[i]
    if (cell.stone > 0) { stoneHits.add(i); continue }
    if (cell.lock) { cell.lock = false; g.score += 30; continue }
    if (cell.gem && cell.gem.k !== 'treasure') {
      if (cell.gem.c >= 0) g.collected[cell.gem.c]++
      g.score += 20 * g.cascade
      cell.gem = null
      const [r, c] = rc(g, i)
      for (const j of [at(g, r - 1, c), at(g, r + 1, c), at(g, r, c - 1), at(g, r, c + 1)])
        if (j >= 0 && g.cells[j].stone > 0) stoneHits.add(j)
    }
    if (cell.ice > 0) { cell.ice--; g.score += 40 }
  }
  for (const i of stoneHits) { g.cells[i].stone--; g.score += 60 }
  for (const { i, gem: made } of g.created) {
    g.cells[i].gem = made
    g.cells[i].lock = false
    g.score += made.k === 'rainbow' ? 400 : made.k === 'bomb' ? 200 : 120
  }
  g.flash = []
  g.created = []
}

// ---------- gravity ----------

function columnSegments(g: Game, c: number): number[][] {
  const segs: number[][] = []
  let cur: number[] = []
  for (let r = 0; r < g.R; r++) {
    const i = r * g.C + c
    const cell = g.cells[i]
    if (cell.hole) continue
    if (cell.stone > 0 || cell.lock) {
      if (cur.length) segs.push(cur)
      cur = []
    } else cur.push(i)
  }
  if (cur.length) segs.push(cur)
  return segs
}

function treasureGoal(g: Game): number {
  const goal = LEVELS[g.lvl].goals.find(x => x.type === 'treasure')
  return goal && goal.type === 'treasure' ? goal.n : 0
}

// One step of falling: every gem above a gap moves down one cell, tops refill.
function fallStep(g: Game): boolean {
  let moved = false
  const needed = treasureGoal(g)
  for (let c = 0; c < g.C; c++) {
    columnSegments(g, c).forEach((seg, s) => {
      for (let j = seg.length - 1; j > 0; j--) {
        if (!g.cells[seg[j]].gem && g.cells[seg[j - 1]].gem) {
          g.cells[seg[j]].gem = g.cells[seg[j - 1]].gem
          g.cells[seg[j - 1]].gem = null
          moved = true
        }
      }
      if (!g.cells[seg[0]].gem) {
        const onBoard = g.cells.filter(cell => cell.gem?.k === 'treasure').length
        const wantTreasure = s === 0 && needed - g.treasures - onBoard > 0 && onBoard < 2 && Math.random() < 0.25
        g.cells[seg[0]].gem = wantTreasure ? gem(g, -1, 'treasure') : gem(g, rnd(5))
        moved = true
      }
    })
    // A treasure in the column's lowest cell is collected.
    for (let r = g.R - 1; r >= 0; r--) {
      const cell = g.cells[r * g.C + c]
      if (cell.hole) continue
      if (cell.gem?.k === 'treasure') {
        cell.gem = null
        g.treasures++
        g.score += 500
        say(g, tx(g).treasure(g.treasures, needed))
        moved = true
      }
      break
    }
  }
  return moved
}

function shuffle(g: Game) {
  const idx = g.cells.flatMap((cell, i) => (movable(g, i) && cell.gem!.k === 'n' ? [i] : []))
  for (let tries = 0; tries < 300; tries++) {
    for (const i of idx) g.cells[i].gem!.c = rnd(5)
    if (findRuns(g).length === 0 && findMove(g)) break
  }
  say(g, tx(g).shuffled)
}

// ---------- goals ----------

export function goalText(g: Game): { text: string; done: boolean; color?: string }[] {
  return LEVELS[g.lvl].goals.flatMap(goal => {
    switch (goal.type) {
      case 'score':
        return [{ text: tx(g).goalScore(g.score, goal.target), done: g.score >= goal.target }]
      case 'ice': {
        const n = g.cells.reduce((s, cell) => s + cell.ice, 0)
        return [{ text: tx(g).goalIce(n), done: n === 0, color: '#8fd3ff' }]
      }
      case 'stone': {
        const n = g.cells.filter(cell => cell.stone > 0).length
        return [{ text: tx(g).goalStone(n), done: n === 0, color: '#bbbbbb' }]
      }
      case 'collect':
        return goal.colors.map(({ c, n }) => ({
          text: `${GLYPHS[c]} ${tx(g).colors[c]} ${Math.min(g.collected[c], n)}/${n}`,
          done: g.collected[c] >= n,
          color: COLORS[c],
        }))
      case 'treasure':
        return [{ text: tx(g).goalTreasure(g.treasures, goal.n), done: g.treasures >= goal.n, color: '#ffcc33' }]
    }
  })
}

export function goalsMet(g: Game): boolean {
  return goalText(g).every(x => x.done)
}

export function starsOf(g: Game): number {
  if (!goalsMet(g)) return 0
  const [, two, three] = LEVELS[g.lvl].stars
  return g.score >= three ? 3 : g.score >= two ? 2 : 1
}

// ---------- turn flow ----------

export function say(g: Game, msg: string, ticks = 25) {
  g.msg = msg
  g.msgTicks = ticks
}

export function adjacent(g: Game, a: number, b: number): boolean {
  const [ra, ca] = rc(g, a)
  const [rb, cb] = rc(g, b)
  return Math.abs(ra - rb) + Math.abs(ca - cb) === 1
}

// The player swaps a and b; answers whether the swap was taken.
export function trySwap(g: Game, a: number, b: number): boolean {
  if (g.phase !== 'idle' || a < 0 || b < 0 || !adjacent(g, a, b)) return false
  if (!movable(g, a) || !movable(g, b)) {
    say(g, tx(g).cantMove, 12)
    return false
  }
  g.hint = null
  g.idle = 0
  g.sel = -1
  g.cascade = 1
  if (isCombo(g, a, b)) {
    swapGems(g, a, b)
    g.moves--
    const { cells, msg } = comboClear(g, a, b)
    say(g, msg)
    g.flash = [...cells]
    g.created = []
    g.phase = 'flash'
    g.timer = 4
    return true
  }
  swapGems(g, a, b)
  g.swap = [a, b]
  if (hasMatchAt(g, a) || hasMatchAt(g, b)) {
    g.moves--
    g.phase = 'swap'
    g.timer = 1
  } else {
    g.phase = 'unswap'
    g.timer = 3
  }
  return true
}

function resolve(g: Game, prefer: number[]): boolean {
  const { clear, created } = analyze(g, prefer)
  if (clear.size === 0) return false
  const cells = expand(g, clear, new Set())
  g.flash = [...cells]
  g.created = created
  const best = created.reduce<Kind | null>((k, x) =>
    x.gem.k === 'rainbow' || k === 'rainbow' ? 'rainbow' : x.gem.k === 'bomb' || k === 'bomb' ? 'bomb' : x.gem.k, null)
  if (best === 'rainbow') say(g, tx(g).madeRainbow)
  else if (best === 'bomb') say(g, tx(g).madeBomb)
  else if (best) say(g, tx(g).madeRocket)
  else if (g.cascade >= 3) say(g, tx(g).cascade(g.cascade), 15)
  g.phase = 'flash'
  g.timer = 3
  return true
}

function endOfMove(g: Game) {
  g.cascade = 1
  const isScoreLevel = LEVELS[g.lvl].goals.some(x => x.type === 'score')
  if (goalsMet(g) && (!isScoreLevel || g.moves <= 0)) {
    const bonus = g.moves * 150
    g.score += bonus
    g.phase = 'won'
    say(g, bonus ? tx(g).wonBonus(bonus) : tx(g).won, 1e9)
    return
  }
  if (g.moves <= 0) {
    g.phase = 'lost'
    say(g, tx(g).lost, 1e9)
    return
  }
  if (!findMove(g)) shuffle(g)
  g.phase = 'idle'
}

// One animation tick; answers whether anything visible changed.
export function tick(g: Game): boolean {
  let changed = false
  if (g.msgTicks > 0 && --g.msgTicks === 0) {
    g.msg = ''
    changed = true
  }
  switch (g.phase) {
    case 'idle':
      if (++g.idle === 90 && !g.hint) {
        g.hint = findMove(g)
        return true
      }
      return changed
    case 'won':
    case 'lost':
      return changed
    case 'swap':
      if (--g.timer > 0) return true
      resolve(g, g.swap ?? [])
      g.swap = null
      return true
    case 'unswap':
      if (--g.timer > 0) return true
      if (g.swap) swapGems(g, g.swap[0], g.swap[1])
      g.swap = null
      g.phase = 'idle'
      say(g, tx(g).noMatch, 12)
      return true
    case 'flash':
      if (--g.timer > 0) return true
      applyClear(g)
      g.phase = 'fall'
      return true
    case 'fall':
      if (fallStep(g)) return true
      g.cascade++
      if (!resolve(g, [])) endOfMove(g)
      return true
  }
}

export function useHint(g: Game) {
  if (g.phase !== 'idle') return
  g.hint = findMove(g)
  g.score = Math.max(0, g.score - 50)
  say(g, tx(g).hintUsed, 15)
}
