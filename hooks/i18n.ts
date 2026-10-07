// Every text the game shows, in English and German.

export type Lang = 'en' | 'de'

const en = {
  levels: [
    { name: 'Meadow', blurb: 'Open field: score points, build combos.' },
    { name: 'Ice Cellar', blurb: 'Break all the ice: matches on ice melt it.' },
    { name: 'Quarry', blurb: 'Smash every stone: match next to it or blast it.' },
    { name: 'Hourglass', blurb: 'Narrow waist: collect 25 red and 25 blue.' },
    { name: 'Treasure Vault', blurb: 'Bring 3 treasures ($) to the bottom. Chains block.' },
  ],
  colors: ['Red', 'Yellow', 'Green', 'Blue', 'Purple'],
  cantMove: 'That one can’t move.',
  noMatch: 'No match – swapped back.',
  shuffled: 'No moves left – reshuffled!',
  treasure: (n: number, of: number) => `Treasure saved! (${n}/${of})`,
  madeRainbow: '5 in a row: color bomb!',
  madeBomb: 'L/T shape: bomb!',
  madeRocket: '4 in a row: rocket!',
  cascade: (n: number) => `Cascade ×${n}!`,
  won: 'Level cleared!',
  wonBonus: (n: number) => `Level cleared! Moves bonus +${n}`,
  lost: 'Out of moves – level failed.',
  hintUsed: 'Hint (−50 points)',
  comboAll: 'MEGA! Double color bomb clears everything!',
  comboColor: (color: string) => `Color bomb: all ${color} gone!`,
  comboBombs: 'Color bomb + bomb: bomb shower!',
  comboRockets: 'Color bomb + rocket: rocket storm!',
  comboCross: 'Rocket cross!',
  comboBigBlast: 'Double bomb: 5×5 blast!',
  comboBigCross: 'Bomb + rocket: giant cross!',
  goalScore: (n: number, of: number) => `Score ${n}/${of}`,
  goalIce: (n: number) => `Ice left: ${n}`,
  goalStone: (n: number) => `Stones left: ${n}`,
  goalTreasure: (n: number, of: number) => `$ Treasures ${n}/${of}`,
  level: 'Level',
  moves: 'Moves',
  score: 'Score',
  goal: 'Goal',
  nextLevel: (n: number) => `On to level ${n} …`,
  allCleared: (n: number) => `All ${n} levels cleared!`,
  next: 'Next',
  again: 'Play again',
  retry: 'Retry',
  hint: 'Hint',
  restart: 'Restart',
  help: [
    'Click two neighbours or drag',
    'Arrows + Enter · h hint · r restart',
    '4 ↔↕ rocket · L/T ✹ bomb',
    '5 ✦ color bomb · 2 specials = combo',
  ],
  command: 'Play Match-3 (resumes your level; "/match3 new" starts at level 1)',
  opened: (n: number) => `Match-3 opened: level ${n}.`,
  status: (n: number, stars: string) => `Match-3: level ${n} cleared ${stars}`,
  needsSurface: 'Match-3 needs the terminal or the Desktop app.',
}

const de: typeof en = {
  levels: [
    { name: 'Blumenwiese', blurb: 'Freies Feld: sammle Punkte, baue Kombos.' },
    { name: 'Eiskeller', blurb: 'Brich alles Eis: Treffer auf Eisfeldern tauen es.' },
    { name: 'Steinbruch', blurb: 'Zertrümmere alle Steine: Treffer daneben oder Explosionen.' },
    { name: 'Sanduhr', blurb: 'Enge Taille: sammle 25 Rote und 25 Blaue.' },
    { name: 'Schatzkammer', blurb: 'Bring 3 Schätze ($) nach unten. Ketten blockieren.' },
  ],
  colors: ['Rot', 'Gelb', 'Grün', 'Blau', 'Lila'],
  cantMove: 'Das lässt sich nicht bewegen.',
  noMatch: 'Kein Treffer – Tausch zurück.',
  shuffled: 'Keine Züge mehr – neu gemischt!',
  treasure: (n, of) => `Schatz geborgen! (${n}/${of})`,
  madeRainbow: '5er-Kette: Farbbombe entsteht!',
  madeBomb: 'L/T-Form: Bombe entsteht!',
  madeRocket: '4er-Kette: Rakete entsteht!',
  cascade: n => `Kaskade ×${n}!`,
  won: 'Geschafft!',
  wonBonus: n => `Geschafft! Restzug-Bonus +${n}`,
  lost: 'Keine Züge mehr – leider verloren.',
  hintUsed: 'Tipp (−50 Punkte)',
  comboAll: 'MEGA! Doppel-Farbbombe räumt alles ab!',
  comboColor: color => `Farbbombe: alle ${color} weg!`,
  comboBombs: 'Farbbombe + Bombe: Bombenregen!',
  comboRockets: 'Farbbombe + Rakete: Raketenhagel!',
  comboCross: 'Raketen-Kreuz!',
  comboBigBlast: 'Doppelbombe: 5×5 Explosion!',
  comboBigCross: 'Bombe + Rakete: Riesenkreuz!',
  goalScore: (n, of) => `Punkte ${n}/${of}`,
  goalIce: n => `Eis übrig: ${n}`,
  goalStone: n => `Steine übrig: ${n}`,
  goalTreasure: (n, of) => `$ Schätze ${n}/${of}`,
  level: 'Level',
  moves: 'Züge',
  score: 'Punkte',
  goal: 'Ziel',
  nextLevel: n => `Weiter zu Level ${n} …`,
  allCleared: n => `Alle ${n} Level geschafft!`,
  next: 'Weiter',
  again: 'Von vorn',
  retry: 'Nochmal',
  hint: 'Tipp',
  restart: 'Neu starten',
  help: [
    'Klick zwei Nachbarn oder ziehen',
    'Pfeile + Enter · h Tipp · r neu',
    '4er ↔↕ Rakete · L/T ✹ Bombe',
    '5er ✦ Farbbombe · 2 Specials = Kombo',
  ],
  command: 'Match-3 spielen (setzt beim aktuellen Level fort; "/match3 neu" beginnt bei Level 1)',
  opened: n => `Match-3 geöffnet: Level ${n}.`,
  status: (n, stars) => `Match-3: Level ${n} geschafft ${stars}`,
  needsSurface: 'Match-3 braucht das Terminal oder die Desktop-App.',
}

export const TEXTS: Record<Lang, typeof en> = { en, de }

export type Texts = typeof en

// German for a German language or locale, English for everything else.
export function pickLang(...hints: (string | undefined)[]): Lang {
  for (const hint of hints) {
    const value = (hint ?? '').trim().toLowerCase()
    if (!value || value === 'auto' || value === 'c' || value === 'posix' || value.startsWith('c.')) continue
    return /^(de|german|deutsch)/.test(value) ? 'de' : 'en'
  }
  return 'en'
}
