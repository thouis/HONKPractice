// Keyed/valved instruments: samples only, no position-hint system.
import type { InstrumentDef } from '../../types'

const noHints = {
  fingerings: {} as Record<number, []>,
  restFingering: [{ pos: 0, label: '', preferred: true }] as const,
  distance: () => 0,
  penalty: () => 0,
  showPartial: false,
} satisfies Pick<InstrumentDef, 'fingerings' | 'restFingering' | 'distance' | 'penalty' | 'showPartial'>

function def(id: string, name: string, folder: string, notes: string[]): InstrumentDef {
  const sampleMap: Record<string, string> = {}
  for (const n of notes) sampleMap[n] = `${n}.mp3`
  return { id, name, samplePath: `samples/${folder}/`, sampleMap, ...noHints }
}

export const trumpetDef    = def('trumpet',      'Trumpet',       'trumpet',      ['A3','C4','Eb4','Gb4','A4','C5','Eb5','Gb5','A5'])
export const frenchHornDef = def('french_horn',  'French Horn',   'french_horn',  ['A2','C3','Eb3','Gb3','A3','C4','Eb4','Gb4','A4'])
export const tubaDef       = def('tuba',         'Tuba',          'tuba',         ['A1','C2','Eb2','Gb2','A2','C3','Eb3'])
export const fluteDef      = def('flute',        'Flute',         'flute',        ['C4','Eb4','Gb4','A4','C5','Eb5','Gb5','A5','C6'])
export const clarinetDef   = def('clarinet',     'Clarinet',      'clarinet',     ['Eb3','Gb3','A3','C4','Eb4','Gb4','A4','C5','Eb5','Gb5'])
export const altoSaxDef    = def('alto_sax',     'Alto Sax',      'alto_sax',     ['Eb3','Gb3','A3','C4','Eb4','Gb4','A4','C5'])
export const tenorSaxDef   = def('tenor_sax',    'Tenor Sax',     'tenor_sax',    ['A2','C3','Eb3','Gb3','A3','C4','Eb4'])
export const bariSaxDef    = def('baritone_sax', 'Baritone Sax',  'baritone_sax', ['Eb2','Gb2','A2','C3','Eb3','Gb3','A3'])
