// File System Access API — persistent local folder support.
// Falls back gracefully on unsupported browsers (Firefox, Safari/iOS).

import { readMusicXml } from './scoreLoader'
import { saveMeta, loadMeta } from './library'

const HANDLE_KEY = 'folderHandle'

export function isFSAccessSupported(): boolean {
  return typeof (window as any).showDirectoryPicker === 'function'
}

export async function pickFolder(): Promise<FileSystemDirectoryHandle> {
  const handle: FileSystemDirectoryHandle =
    await (window as any).showDirectoryPicker({ mode: 'read' })
  await saveMeta(HANDLE_KEY, handle)
  return handle
}

// Restore previously-picked folder. Returns null if none stored or permission denied.
export async function restoreFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFSAccessSupported()) return null
  const handle = await loadMeta<FileSystemDirectoryHandle>(HANDLE_KEY)
  if (!handle) return null
  try {
    const perm = await (handle as any).queryPermission({ mode: 'read' })
    if (perm === 'granted') return handle
    const req = await (handle as any).requestPermission({ mode: 'read' })
    return req === 'granted' ? handle : null
  } catch {
    return null
  }
}

export interface FolderEntry {
  name: string
  title: string   // derived from filename (strip extension)
  handle: FileSystemFileHandle
}

export async function listFolderScores(dir: FileSystemDirectoryHandle): Promise<FolderEntry[]> {
  const entries: FolderEntry[] = []
  for await (const [name, handle] of (dir as any).entries()) {
    if (handle.kind !== 'file') continue
    if (!name.endsWith('.xml') && !name.endsWith('.mxl') && !name.endsWith('.XML') && !name.endsWith('.MXL')) continue
    const title = name.replace(/\.(xml|mxl|XML|MXL)$/, '')
    entries.push({ name, title, handle: handle as FileSystemFileHandle })
  }
  return entries.sort((a, b) => a.title.localeCompare(b.title))
}

export async function readFolderScore(entry: FolderEntry): Promise<string> {
  const file: File = await entry.handle.getFile()
  return readMusicXml(file)
}
