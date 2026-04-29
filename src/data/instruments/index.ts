import { tromboneDef } from './trombone'
import { trumpetDef } from './trumpet'
import { frenchHornDef, tubaDef, fluteDef,
         clarinetDef, altoSaxDef, tenorSaxDef, bariSaxDef } from './keyed'
import type { InstrumentDef } from '../../types'

export const INSTRUMENTS: Record<string, InstrumentDef> = {
  trombone:     tromboneDef,
  trumpet:      trumpetDef,
  french_horn:  frenchHornDef,
  tuba:         tubaDef,
  flute:        fluteDef,
  clarinet:     clarinetDef,
  alto_sax:     altoSaxDef,
  tenor_sax:    tenorSaxDef,
  baritone_sax: bariSaxDef,
}

export const DEFAULT_INSTRUMENT = 'trombone'
