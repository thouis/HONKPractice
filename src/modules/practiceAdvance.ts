import { debugLog, isDebugVisible } from './debugPanel'

export interface PracticeAdvanceState {
  cursorIdx: number
  loopOn: boolean
}

export interface PracticeAdvanceDeps {
  getOsmd:               () => import('opensheetmusicdisplay').OpenSheetMusicDisplay | null
  advanceCursor:         () => void
  resetCursor:           () => void
  scrollCursorIntoView:  () => void
  updateExpectedPitch:   () => void
  showPracticeDone:      () => void
}

export function isTieContinuation(n: any): boolean {
  const tie = n.NoteTie
  return !!(tie && tie.StartNote && tie.StartNote !== n && tie.StartNote.halfTone === n.halfTone)
}

export function practiceAdvanceStep(
  state: PracticeAdvanceState,
  deps: PracticeAdvanceDeps
): void {
  const osmd = deps.getOsmd()
  if (!osmd) return

  if (osmd.cursor.iterator.EndReached) {
    if (state.loopOn) { deps.resetCursor(); state.cursorIdx = 0; deps.updateExpectedPitch() }
    else deps.showPracticeDone()
    return
  }

  deps.advanceCursor()
  state.cursorIdx++
  // Skip rests and tie continuations automatically.
  const MAX_SKIP = 512
  let skipped = 0
  while (!osmd.cursor.iterator.EndReached && skipped < MAX_SKIP) {
    const notes = osmd.cursor.NotesUnderCursor()
    const pitched = (notes ?? []).filter((n: any) => !n.isRest?.())
    const skip = pitched.length === 0 || pitched.every(isTieContinuation)
    if (isDebugVisible()) {
      debugLog(`[practiceAdv] cursorIdx=${state.cursorIdx} pitched=${pitched.length} skip=${skip} ` +
        pitched.map((n: any) => `ht=${n.halfTone} tie=${!!n.NoteTie} cont=${isTieContinuation(n)}`).join(' '))
    }
    if (!skip) break
    deps.advanceCursor()
    state.cursorIdx++
    skipped++
  }
  // If we hit the end during rest-skipping, loop or signal done.
  if (osmd.cursor.iterator.EndReached) {
    if (state.loopOn) { deps.resetCursor(); state.cursorIdx = 0 }
    else deps.showPracticeDone()
  }
  deps.scrollCursorIntoView()
  deps.updateExpectedPitch()
}
