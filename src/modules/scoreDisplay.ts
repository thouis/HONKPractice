// Dynamic import to code-split the large OSMD bundle
let osmdInstance: import('opensheetmusicdisplay').OpenSheetMusicDisplay | null = null

export async function initDisplay(container: HTMLElement): Promise<void> {
  const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay')
  osmdInstance = new OpenSheetMusicDisplay(container, {
    autoResize: true,
    followCursor: true,
    drawingParameters: 'default',
  })
}

export async function loadAndRender(xml: string): Promise<void> {
  if (!osmdInstance) throw new Error('Display not initialized')
  await osmdInstance.load(xml)
  osmdInstance.render()
  osmdInstance.enableOrDisableCursors(true)
  osmdInstance.cursor.show()
  osmdInstance.cursor.reset()
}

export function getOsmd() {
  return osmdInstance
}

export function resetCursor(): void {
  osmdInstance?.cursor.reset()
}

export function advanceCursor(): void {
  const cursor = osmdInstance?.cursor
  if (!cursor || cursor.iterator.EndReached) return
  cursor.next()
}
