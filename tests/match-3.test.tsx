import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { analyze, expand, findMove, findRuns, goalsMet, newGame, tick, trySwap } from '../hooks/engine'
import type { Game, Kind } from '../hooks/engine'
import { pickLang } from '../hooks/i18n'

// A base 8×8 board with no three in a row: color (2r + c) mod 5.
const BASE = ['01234012', '23401234', '40123401', '12340123', '34012340', '01234012', '23401234', '40123401']

function board(rows: string[] = BASE): Game {
  const g = newGame(0, 'en')
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    g.cells[r * 8 + c].gem = { c: Number(ch), k: 'n', id: r * 8 + c + 1 }
  }))
  return g
}

function special(g: Game, i: number, k: Kind, c = 0) {
  g.cells[i].gem = { c, k, id: 1000 + i }
}

describe('matches and specials', () => {
  test('the base board has no match', () => {
    expect(findRuns(board())).toHaveLength(0)
  })

  test('4 in a row makes a row rocket', () => {
    const { clear, created } = analyze(board(['00004012', ...BASE.slice(1)]), [])
    expect(clear.size).toBe(4)
    expect(created.map(x => x.gem.k)).toEqual(['row'])
  })

  test('4 in a column makes a column rocket', () => {
    const rows = [...BASE]
    // Column 7 rows 0-3 become color 4: 2,4,1,3 → 4,4,4,4.
    for (let r = 0; r < 4; r++) rows[r] = rows[r].slice(0, 7) + '4'
    const g = board(rows)
    const { created } = analyze(g, [])
    expect(created.map(x => x.gem.k)).toEqual(['col'])
  })

  test('an L shape makes a bomb at the corner', () => {
    const g = board(['01234012', '03401234', '00023401', ...BASE.slice(3)])
    const { clear, created } = analyze(g, [])
    expect(clear.size).toBe(5)
    expect(created).toHaveLength(1)
    expect(created[0].gem.k).toBe('bomb')
    expect(created[0].i).toBe(16)
  })

  test('5 in a row makes a color bomb', () => {
    const { created } = analyze(board(['00000312', ...BASE.slice(1)]), [])
    expect(created.map(x => x.gem.k)).toEqual(['rainbow'])
  })

  test('a column rocket caught in a match fires down its column', () => {
    const g = board(['00034012', ...BASE.slice(1)])
    special(g, 1, 'col', 0)
    const { clear } = analyze(g, [])
    expect(clear.size).toBe(3)
    expect(expand(g, clear, new Set()).size).toBe(10)
  })
})

describe('combos', () => {
  test('color bomb + gem clears every gem of that color', () => {
    const g = board()
    special(g, 0, 'rainbow', -1)
    const color = g.cells[1].gem!.c
    expect(trySwap(g, 0, 1)).toBe(true)
    const all = g.cells.flatMap((cell, i) => (cell.gem?.c === color ? [i] : []))
    for (const i of all) expect(g.flash).toContain(i)
    expect(g.moves).toBe(19)
  })

  test('bomb + bomb blows up 5×5', () => {
    const g = board()
    special(g, 27, 'bomb', 1)
    special(g, 28, 'bomb', 2)
    trySwap(g, 27, 28)
    expect(g.flash.length).toBe(25)
  })

  test('rocket + rocket clears a cross', () => {
    const g = board()
    special(g, 27, 'row', 1)
    special(g, 28, 'col', 2)
    trySwap(g, 27, 28)
    expect(g.flash.length).toBe(15)
  })

  test('color bomb + color bomb clears the board', () => {
    const g = board()
    special(g, 27, 'rainbow', -1)
    special(g, 28, 'rainbow', -1)
    trySwap(g, 27, 28)
    expect(g.flash.length).toBe(64)
  })

  test('a swap with no match is undone', () => {
    const g = board()
    trySwap(g, 0, 1)
    expect(g.phase).toBe('unswap')
    expect(g.moves).toBe(20)
  })
})

describe('maps', () => {
  test('every map starts with a move and no match', () => {
    for (let lvl = 0; lvl < 5; lvl++) {
      const g = newGame(lvl)
      expect(findRuns(g)).toHaveLength(0)
      expect(goalsMet(g)).toBe(false)
    }
  })

  test('melting all ice wins the ice map goal', () => {
    const g = newGame(1)
    for (const cell of g.cells) cell.ice = 0
    expect(goalsMet(g)).toBe(true)
  })
})

// What the plugin's session.start needs beneath it, answered from memory.
async function startSession($: any, on: On, env: Record<string, string> = {}) {
  on('settings.read', () => ({ value: {} }) as never)
  mock.env(on, env)
  mock.store(on)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', (_$, e) => e as never)
  await $.session.start({ source: 'startup', cwd: '/tmp' })
}

const PANE = {
  title: 'Match-3',
  isFocused: true,
  bodyColumns: 80,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
}

test('the pane starts at level 1 in English', async ($, on) => {
  await startSession($, on, { LANG: 'en_US.UTF-8' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'match-3', surface, component: 'Pane', props: PANE, requestId: 'match3' })
    await ui.resize({ columns: 80, rows: 30 })
    expect(await ui.find({ in: 'game', text: /Level 1\/5: Meadow/ })).toBeDefined()
    expect(await ui.find({ in: 'game', text: /Moves/ })).toBeDefined()
    await ui.press({ key: 'hint' })
    await ui.advance(500)
    await ui.press({ key: 'restart' })
    expect(await ui.find({ in: 'game', text: /Score/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the pane speaks German under a German locale', async ($, on) => {
  await startSession($, on, { LANG: 'de_DE.UTF-8' })
  const ui = await $.ui.mount({ plugin: 'match-3', surface: 'desktop', component: 'Pane', props: PANE, requestId: 'match3' })
  await ui.resize({ columns: 80, rows: 30 })
  expect(await ui.find({ in: 'game', text: /Level 1\/5: Blumenwiese/ })).toBeDefined()
  expect(await ui.find({ in: 'game', text: /Züge/ })).toBeDefined()
  await ui.unmount()
})

test('the language falls back to the locale', () => {
  expect(pickLang('auto', undefined, '', 'de_DE.UTF-8')).toBe('de')
  expect(pickLang('auto', 'german')).toBe('de')
  expect(pickLang(undefined, undefined, 'C', 'en_US.UTF-8')).toBe('en')
  expect(pickLang()).toBe('en')
})

test('a bot plays every map to the end without getting stuck', () => {
  for (let lvl = 0; lvl < 5; lvl++) {
    for (let round = 0; round < 5; round++) {
      const g = newGame(lvl)
      let ticks = 0
      while (g.phase !== 'won' && g.phase !== 'lost' && ticks < 50000) {
        if (g.phase === 'idle') {
          const m = findMove(g)
          expect(m).not.toBeNull()
          trySwap(g, m![0], m![1])
        }
        tick(g)
        ticks++
      }
      expect(['won', 'lost']).toContain(g.phase)
      expect(g.moves).toBeGreaterThanOrEqual(0)
      for (const cell of g.cells) if (!cell.hole && cell.stone === 0) expect(cell.gem).not.toBeNull()
    }
  }
})
