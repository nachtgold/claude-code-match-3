// `level` is the level the player is on (0-based); `best` the best result per won level.
export type Progress = { level: number; best: Record<string, { score: number; stars: number }> }
export type Launch = { level: number; nonce: number }
export type GameProps = { launch: Launch; lang: 'en' | 'de' }

declare module 'claude-code' {
  interface PluginState {
    'match-3': { progress: Progress; launch: Launch }
  }
}
