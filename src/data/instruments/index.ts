import { tromboneDef } from './trombone'
import type { InstrumentDef } from '../../types'

export const INSTRUMENTS: Record<string, InstrumentDef> = {
  trombone: tromboneDef,
}

export const DEFAULT_INSTRUMENT = 'trombone'
