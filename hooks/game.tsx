import type { ClientKeyEvent, ClientModule, ClientPointerEvent, ClientSurface } from 'claude-code'

import type { GameProps } from '../types'
import {
  COLORS, GLYPHS, LEVELS, SWAP_FRAMES, adjacent, at, goalText, levelText, newGame, rc, starsOf, tick, trySwap, useHint,
} from './engine'
import type { Game, Gem } from './engine'
import { TEXTS } from './i18n'
import type { Lang } from './i18n'

type Ctx = {
  g: Game
  lang: Lang
  launchNonce: number
  down: number
  wide: boolean
  // Ticks left before a won level moves on by itself.
  advanceIn: number
  // The cursor shows only while the keyboard drives the game.
  isKeyboard: boolean
}
type S = { ctx: Ctx; v: number }
type Surface = ClientSurface<S>

// One board cell in character cells: wide and tall enough for a glyph with
// room around it, and for a special's three glyphs.
const CELL_W = 5
const CELL_H = 2
const HEADER_ROWS = 1
const SIDE_W = 34
const ADVANCE_TICKS = 35
const BG = ['#1f232b', '#272c36']
const ICE_BG = ['', '#2d5f80', '#4f97c4']
const LAST = LEVELS.length - 1

function redraw(surface: Surface) {
  const s = surface.state!
  surface.setState({ ctx: s.ctx, v: s.v + 1 })
}

function start(ctx: Ctx, lvl: number) {
  ctx.g = newGame(Math.max(0, Math.min(LAST, lvl)), ctx.lang)
  ctx.advanceIn = 0
}

function report(surface: Surface, ctx: Ctx) {
  const g = ctx.g
  if (g.reported || (g.phase !== 'won' && g.phase !== 'lost')) return
  g.reported = true
  if (g.phase === 'won' && g.lvl < LAST) ctx.advanceIn = ADVANCE_TICKS
  surface.post({ type: 'result', level: g.lvl, score: g.score, stars: starsOf(g), won: g.phase === 'won' })
}

// After a loss: the same level again. After a win: the next one.
function proceed(ctx: Ctx) {
  const g = ctx.g
  if (g.phase === 'won') start(ctx, g.lvl === LAST ? 0 : g.lvl + 1)
  else if (g.phase === 'lost') start(ctx, g.lvl)
}

function onTick(surface: Surface) {
  const ctx = surface.state?.ctx
  if (!ctx) return
  if (ctx.advanceIn > 0 && --ctx.advanceIn === 0) {
    proceed(ctx)
    redraw(surface)
    return
  }
  if (tick(ctx.g)) {
    report(surface, ctx)
    redraw(surface)
  }
}

function move(g: Game, i: number, dr: number, dc: number): number {
  const [r, c] = rc(g, i)
  const j = at(g, r + dr, c + dc)
  return j < 0 ? i : j
}

const DIRS: Record<string, [number, number]> = {
  up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1],
}

function onKey(surface: Surface, k: ClientKeyEvent) {
  const ctx = surface.state?.ctx
  if (!ctx) return
  const g = ctx.g
  const key = k.key.toLowerCase()
  ctx.isKeyboard = true
  const over = g.phase === 'won' || g.phase === 'lost'

  if (over && (key === 'return' || key === ' ' || key === 'n')) proceed(ctx)
  else if (key === 'r') start(ctx, g.lvl)
  else if (key === 'h') useHint(g)
  else if (DIRS[key]) {
    const [dr, dc] = DIRS[key]
    if (g.sel >= 0) {
      const target = move(g, g.sel, dr, dc)
      if (target !== g.sel) trySwap(g, g.sel, target)
      g.cursor = target
      g.sel = -1
    } else g.cursor = move(g, g.cursor, dr, dc)
  } else if (key === 'return' || key === ' ') {
    g.sel = g.sel === g.cursor ? -1 : g.cursor
  } else return
  redraw(surface)
}

export function cellAt(g: Game, p: ClientPointerEvent): number {
  const r = Math.floor((p.y - HEADER_ROWS) / CELL_H)
  const c = Math.floor(p.x / CELL_W)
  if (p.x < 0 || p.y < HEADER_ROWS || c >= g.C) return -1
  return at(g, r, c)
}

function onPointer(surface: Surface, p: ClientPointerEvent) {
  const ctx = surface.state?.ctx
  if (!ctx || p.button !== 'left') return
  const g = ctx.g
  const i = cellAt(g, p)
  ctx.isKeyboard = false
  if (p.type === 'down') {
    ctx.down = i
    return
  }
  if (p.type !== 'up') return
  const from = ctx.down
  ctx.down = -1
  if (i < 0) return
  if (from >= 0 && from !== i && adjacent(g, from, i)) {
    // Dragged a gem onto its neighbour.
    trySwap(g, from, i)
  } else if (g.sel >= 0 && adjacent(g, g.sel, i)) {
    trySwap(g, g.sel, i)
    g.sel = -1
  } else {
    g.sel = g.sel === i ? -1 : i
  }
  g.cursor = i
  redraw(surface)
}

// ---------- drawing ----------

type Align = 'center' | 'flex-start' | 'flex-end'
type Part = { ch: string; color?: string; bold?: boolean }
// A cell: its glyphs, its fill, and where the glyphs sit (a slide moves them).
type Look = { parts: Part[]; bg?: string; alignX?: Align; alignY?: Align }

const DARK = '#141414'
const MARK = { row: '↔', col: '↕', bomb: '✹' } as const

// Plain gems: the color's shape in its color. Specials: a tile filled with
// their color, the shape on both sides and the effect's mark in the middle,
// all dark on the fill, so color and shape both say which color it counts as.
function gemParts(gem: Gem | null): { parts: Part[]; fill?: string } {
  if (!gem) return { parts: [] }
  const color = COLORS[gem.c] ?? '#ffffff'
  const shape = GLYPHS[gem.c]
  if (gem.k === 'row' || gem.k === 'col' || gem.k === 'bomb') {
    return {
      parts: [{ ch: shape, color: DARK }, { ch: MARK[gem.k], color: DARK, bold: true }, { ch: shape, color: DARK }],
      fill: color,
    }
  }
  if (gem.k === 'rainbow') {
    return {
      parts: [{ ch: GLYPHS[0], color: COLORS[0] }, { ch: '✦', color: DARK, bold: true }, { ch: GLYPHS[3], color: COLORS[3] }],
      fill: '#f2f2f2',
    }
  }
  if (gem.k === 'treasure') return { parts: [{ ch: '$', color: '#ffcc33', bold: true }] }
  return { parts: [{ ch: shape, color }] }
}

// A swap slides in three frames: both gems lean towards each other, cross
// into the other cell, then settle in the middle.
function swapFrame(g: Game, i: number): { gem: Gem | null; alignX: Align; alignY: Align } | null {
  if ((g.phase !== 'swap' && g.phase !== 'unswap') || !g.swap) return null
  const [a, b] = g.swap
  if (i !== a && i !== b) return null
  const other = i === a ? b : a
  const frame = SWAP_FRAMES - g.timer
  const isSideways = rc(g, a)[0] === rc(g, b)[0]
  const toward: Align = other > i ? 'flex-end' : 'flex-start'
  const alignX = isSideways ? toward : 'center'
  const alignY = isSideways ? 'center' : toward
  if (frame <= 0) return { gem: g.cells[i].gem, alignX, alignY }
  if (frame === 1) return { gem: g.cells[other].gem, alignX, alignY }
  return { gem: g.cells[other].gem, alignX: 'center', alignY: 'center' }
}

// Each cell is a fixed CELL_W × CELL_H box with its glyphs in the middle: the
// box, not a glyph's own width, sets the spacing, so every surface lines up.
function cellLook(g: Game, i: number, showCursor: boolean): Look {
  const cell = g.cells[i]
  const [r, c] = rc(g, i)
  if (cell.hole) return { parts: [] }
  if (cell.stone > 0) {
    const ch = cell.stone > 1 ? '▓' : '░'
    return { parts: [{ ch: ch + ch + ch, color: '#b0b0b0', bold: true }], bg: '#4a4a4a' }
  }
  if (g.phase === 'flash' && g.flash.includes(i)) return { parts: [{ ch: '✧', color: DARK, bold: true }], bg: '#e8e8e8' }

  const slide = swapFrame(g, i)
  const { parts, fill } = gemParts(slide ? slide.gem : cell.gem)
  let bg = fill ?? (cell.ice ? ICE_BG[cell.ice] : BG[(r + c) % 2])
  if (!fill && cell.lock) bg = '#5a4526'

  // Hint, cursor and selection: a tint on plain cells, brackets on every cell
  // (a special's own fill would hide a tint).
  let mark: string | null = null
  if (g.hint && g.hint.includes(i)) { mark = '#5fd75f'; if (!fill) bg = '#2f6b3a' }
  if (showCursor && g.cursor === i && g.phase !== 'won' && g.phase !== 'lost') { mark = '#ffffff'; if (!fill) bg = '#56607a' }
  if (g.sel === i) { mark = '#ffd700'; if (!fill) bg = '#9a7d12' }
  const framed = mark && fill
    ? [{ ch: '[', color: DARK, bold: true }, ...parts, { ch: ']', color: DARK, bold: true }]
    : parts
  return { parts: framed, bg, alignX: slide?.alignX, alignY: slide?.alignY }
}

function stars(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(3 - n)
}

function Board(surface: Surface, g: Game, showCursor: boolean) {
  const { Box, Text } = surface.elements
  const rows = []
  for (let r = 0; r < g.R; r++) {
    const cells = []
    for (let c = 0; c < g.C; c++) {
      const look = cellLook(g, r * g.C + c, showCursor)
      cells.push(
        <Box
          width={CELL_W}
          height={CELL_H}
          flexShrink={0}
          flexDirection="column"
          justifyContent={look.alignY ?? 'center'}
          alignItems={look.alignX ?? 'center'}
          overflow="hidden"
          backgroundColor={look.bg}
        >
          <Box flexDirection="row">
            {look.parts.map(p => <Text color={p.color} bold={p.bold}>{p.ch}</Text>)}
          </Box>
        </Box>,
      )
    }
    rows.push(<Box flexDirection="row" height={CELL_H}>{cells}</Box>)
  }
  return (
    // No border: surfaces disagree on whether one takes a cell, and the
    // pointer maths needs the board's first cell at a known place.
    <Box flexDirection="column" width={g.C * CELL_W} flexShrink={0}>
      {rows}
    </Box>
  )
}

function Side(surface: Surface, ctx: Ctx) {
  const { Box, Text, Button } = surface.elements
  const g = ctx.g
  const t = TEXTS[ctx.lang]
  const def = LEVELS[g.lvl]
  const won = g.phase === 'won'
  const lost = g.phase === 'lost'
  return (
    <Box flexDirection="column" paddingLeft={ctx.wide ? 2 : 0} width={SIDE_W}>
      <Text>
        <Text bold>{t.moves} </Text>
        <Text color={g.moves <= 5 ? '#ff5f5f' : '#ffffff'} bold>{String(g.moves)}</Text>
        <Text bold>   {t.score} </Text>
        <Text color="#ffd75f" bold>{String(g.score)}</Text>
      </Text>
      <Text color="#ffd75f">{stars(starsOf(g))}  <Text dimColor>({def.stars[1]} / {def.stars[2]})</Text></Text>
      <Text bold>{t.goal}</Text>
      {goalText(g).map(x => (
        <Text color={x.done ? '#5fd75f' : x.color}>{x.done ? ' ✔ ' : ' • '}{x.text}</Text>
      ))}
      <Text> </Text>
      <Text color={won ? '#5fd75f' : lost ? '#ff5f5f' : '#e5c07b'} wrap="wrap">{g.msg || ' '}</Text>
      {won && g.lvl < LAST && <Text color="#5fd75f">{t.nextLevel(g.lvl + 2)}</Text>}
      {won && g.lvl === LAST && <Text color="#5fd75f" bold>{t.allCleared(LEVELS.length)}</Text>}
      <Box flexDirection="row" gap={1}>
        {won && (
          <Button key="next" variant="primary" label={g.lvl < LAST ? t.next : t.again} onPress={() => { proceed(ctx); redraw(surface) }} />
        )}
        {lost && <Button key="retry" variant="primary" label={t.retry} onPress={() => { proceed(ctx); redraw(surface) }} />}
        {!won && !lost && <Button key="hint" label={t.hint} onPress={() => { useHint(g); redraw(surface) }} />}
        {!won && !lost && <Button key="restart" label={t.restart} onPress={() => { start(ctx, g.lvl); redraw(surface) }} />}
      </Box>
      <Text> </Text>
      <Text dimColor>{t.help[0]}</Text>
      <Text dimColor>{t.help[1]}</Text>
      <Text> </Text>
      <Text dimColor>{t.help[2]}</Text>
      <Text dimColor>{t.help[3]}</Text>
    </Box>
  )
}

const Match3: ClientModule<GameProps, S> = (props, surface) => {
  let s = surface.state
  if (!s) {
    const lang = props.lang ?? 'en'
    const ctx: Ctx = { g: newGame(props.launch?.level ?? 0, lang), lang, launchNonce: props.launch?.nonce ?? 0, down: -1, wide: true, advanceIn: 0, isKeyboard: false }
    s = { ctx, v: 0 }
    surface.setState(s)
    surface.every(90, () => onTick(surface))
    surface.onKey(k => onKey(surface, k))
    surface.onPointer(p => onPointer(surface, p))
  }
  const ctx = s.ctx
  // An instance kept from an earlier version of this module may hold no game.
  if (!ctx.g) start(ctx, props.launch?.level ?? 0)
  if (props.lang && props.lang !== ctx.lang) {
    // A language change reaches the running game's texts at once.
    ctx.lang = props.lang
    ctx.g.lang = props.lang
  }
  if (props.launch && props.launch.nonce !== ctx.launchNonce) {
    ctx.launchNonce = props.launch.nonce
    start(ctx, props.launch.level)
  }

  const { Box, Text } = surface.elements
  const g = ctx.g
  ctx.wide = surface.columns === 0 || surface.columns >= g.C * CELL_W + SIDE_W
  return (
    <Box flexDirection="column">
      <Text bold color="#d787ff" wrap="truncate-end">
        {TEXTS[ctx.lang].level} {g.lvl + 1}/{LEVELS.length}: {levelText(g.lvl, ctx.lang).name}  <Text dimColor>{levelText(g.lvl, ctx.lang).blurb}</Text>
      </Text>
      <Box flexDirection={ctx.wide ? 'row' : 'column'}>
        {Board(surface, g, ctx.isKeyboard)}
        {Side(surface, ctx)}
      </Box>
    </Box>
  )
}

export default Match3
