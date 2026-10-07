import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Progress } from '../types'
import { TEXTS, pickLang } from './i18n'
import type { Lang } from './i18n'

const PANE = 'match3'
const LEVEL_COUNT = 5
const EMPTY: Progress = { level: 0, best: {} }
const progress = atom({ plugin: 'match-3', key: 'progress' } as const, EMPTY)
const launch = atom({ plugin: 'match-3', key: 'launch' } as const, { level: 0, nonce: 0 })

type Result = { type: 'result'; level: number; score: number; stars: number; won: boolean }

function isResult(data: unknown): data is Result {
  return typeof data === 'object' && data !== null && (data as Result).type === 'result'
}

// Older saves held only the best results; anything without a level starts over.
function normalize(value: unknown): Progress {
  const p = value as Partial<Progress> | undefined
  return typeof p?.level === 'number' && typeof p.best === 'object' && p.best !== null ? (p as Progress) : EMPTY
}

// The option wins; then Claude Code's own `language` setting; then the locale.
async function resolveLang($: EngineInterface, option: unknown): Promise<Lang> {
  let settings: { language?: unknown } = {}
  try {
    settings = (await $.settings.read()) as { language?: unknown }
  } catch {
    // No settings to read (a test, a host without them): the locale decides.
  }
  let intl: string | undefined
  try {
    intl = Intl.DateTimeFormat().resolvedOptions().locale
  } catch {
    intl = undefined
  }
  return pickLang(
    typeof option === 'string' ? option : undefined,
    typeof settings.language === 'string' ? settings.language : undefined,
    await $.env.get('LC_ALL'),
    await $.env.get('LC_MESSAGES'),
    await $.env.get('LANG'),
    intl,
  )
}

export const register: Register = (on, options) => {
  let lang: Lang = 'en'

  on('session.start', async ($, e, next) => {
    lang = await resolveLang($, options.language)
    await $.command.register({
      name: 'match3',
      description: TEXTS[lang].command,
      argumentHint: lang === 'de' ? '[neu]' : '[new]',
    })
    const saved = normalize(await $.store.get('progress'))
    await update($, progress, () => saved)
    await update($, launch, prev => ({ level: saved.level, nonce: (prev?.nonce ?? 0) + 1 }))

    return next(e)
  })

  on('command.run', { command: 'match3' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'new' || arg === 'neu') {
      const reset = { ...normalize(await read($, progress)), level: 0 }
      await update($, progress, () => reset)
      await $.store.set('progress', reset)
      await update($, launch, prev => ({ level: 0, nonce: prev.nonce + 1 }))
    }
    await $.ui.open({ id: PANE, title: 'Match-3', focus: true, holdToasts: true, rows: 22, columns: 72 })
    const { level } = normalize(await read($, progress))

    return { text: TEXTS[lang].opened(level + 1) }
  })

  on('ui.message', async ($, e, next) => {
    if (!isResult(e.data) || !e.data.won) return next(e)
    const r = e.data
    const all = normalize(await read($, progress))
    const prev = all.best[String(r.level)]
    const saved: Progress = {
      level: r.level + 1 < LEVEL_COUNT ? r.level + 1 : 0,
      best: {
        ...all.best,
        [String(r.level)]: { score: Math.max(prev?.score ?? 0, r.score), stars: Math.max(prev?.stars ?? 0, r.stars) },
      },
    }
    await update($, progress, () => saved)
    await update($, launch, l => ({ ...l, level: saved.level }))
    await $.store.set('progress', saved)
    $.ui.status(TEXTS[lang].status(r.level + 1, '★'.repeat(r.stars)))

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') {
      const { Text } = $.ui.resolve(e)
      return <Text>{TEXTS[lang].needsSurface}</Text>
    }
    const { Box, Client } = $.ui.resolve(e)
    const props = { launch: await read($, launch), lang }

    return (
      <Box flexDirection="column">
        <Client key="game" module="./game.tsx" props={props} width="100%" />
      </Box>
    )
  })
}
