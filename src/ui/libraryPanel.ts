import { listScores, addScore, deleteScore, type LibraryEntry } from '../modules/library'
import { notify } from './notify'
import { readMusicXml } from '../modules/scoreLoader'
import {
  isFSAccessSupported, pickFolder, restoreFolder,
  listFolderScores, readFolderScore, type FolderEntry,
} from '../modules/fsFolder'

type LoadCallback = (xml: string, title: string) => Promise<void>

let panel: HTMLElement | null = null
let overlay: HTMLElement | null = null
let onLoad: LoadCallback = async () => {}
let currentFolder: FileSystemDirectoryHandle | null = null

// ── Public API ──────────────────────────────────────────────────────────────

export async function initLibraryPanel(loadCb: LoadCallback): Promise<void> {
  onLoad = loadCb
  currentFolder = await restoreFolder()
}

export function openLibraryPanel(): void {
  if (!overlay) buildPanel()
  refresh()
  overlay!.style.display = 'flex'
}

// ── Build DOM (once) ─────────────────────────────────────────────────────────

function buildPanel(): void {
  overlay = document.createElement('div')
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:none;' +
    'align-items:center;justify-content:center;z-index:100;'
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })

  panel = document.createElement('div')
  panel.style.cssText =
    'background:#1e1e2e;color:#cdd6f4;border-radius:8px;padding:20px;' +
    'width:min(560px,92vw);max-height:80vh;display:flex;flex-direction:column;gap:12px;' +
    'box-shadow:0 8px 32px rgba(0,0,0,0.6);'

  const header = document.createElement('div')
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;'
  const heading = document.createElement('h2')
  heading.textContent = 'Score Library'
  heading.style.cssText = 'margin:0;font-size:1.1rem;'
  const closeBtn = document.createElement('button')
  closeBtn.textContent = '✕'
  closeBtn.style.cssText = 'background:none;border:none;color:#cdd6f4;font-size:1.2rem;cursor:pointer;'
  closeBtn.onclick = close
  header.append(heading, closeBtn)

  panel.append(header, buildRemoteSection(), buildImportedSection(), buildFolderSection())
  overlay.appendChild(panel)
  document.body.appendChild(overlay)
}

function buildImportedSection(): HTMLElement {
  const section = document.createElement('div')
  section.id = 'lib-imported'
  section.style.cssText = 'display:flex;flex-direction:column;gap:8px;'

  const row = document.createElement('div')
  row.style.cssText = 'display:flex;align-items:center;gap:8px;'
  const label = document.createElement('span')
  label.style.cssText = 'font-weight:bold;font-size:0.85rem;text-transform:uppercase;' +
    'letter-spacing:0.05em;color:#89b4fa;flex:1;'
  label.textContent = 'Imported Scores'

  const importBtn = document.createElement('button')
  importBtn.textContent = '+ Import files'
  importBtn.className = 'btn'
  importBtn.style.fontSize = '0.8rem'
  importBtn.onclick = handleImport
  row.append(label, importBtn)

  const list = document.createElement('div')
  list.id = 'lib-imported-list'
  list.style.cssText = 'display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto;'

  section.append(row, list)
  return section
}

function buildFolderSection(): HTMLElement {
  const section = document.createElement('div')
  section.id = 'lib-folder'
  section.style.cssText = 'display:flex;flex-direction:column;gap:8px;'

  const row = document.createElement('div')
  row.style.cssText = 'display:flex;align-items:center;gap:8px;'
  const label = document.createElement('span')
  label.style.cssText = 'font-weight:bold;font-size:0.85rem;text-transform:uppercase;' +
    'letter-spacing:0.05em;color:#89b4fa;flex:1;'
  label.textContent = 'Local Folder'

  if (isFSAccessSupported()) {
    const pickBtn = document.createElement('button')
    pickBtn.textContent = 'Select folder…'
    pickBtn.className = 'btn'
    pickBtn.style.fontSize = '0.8rem'
    pickBtn.onclick = handlePickFolder
    row.append(label, pickBtn)
  } else {
    const note = document.createElement('span')
    note.style.cssText = 'font-size:0.75rem;color:#6c7086;'
    note.textContent = '(not supported in this browser)'
    row.append(label, note)
  }

  const folderName = document.createElement('div')
  folderName.id = 'lib-folder-name'
  folderName.style.cssText = 'font-size:0.8rem;color:#6c7086;font-style:italic;'

  const list = document.createElement('div')
  list.id = 'lib-folder-list'
  list.style.cssText = 'display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto;'

  section.append(row, folderName, list)
  return section
}

function buildRemoteSection(): HTMLElement {
  const section = document.createElement('div')
  section.style.cssText = 'display:flex;flex-direction:column;gap:8px;'

  const label = document.createElement('span')
  label.style.cssText = 'font-weight:bold;font-size:0.85rem;text-transform:uppercase;' +
    'letter-spacing:0.05em;color:#89b4fa;'
  label.textContent = 'Online Library'

  const list = document.createElement('div')
  list.id = 'lib-remote-list'
  list.style.cssText = 'display:flex;flex-direction:column;gap:4px;max-height:220px;overflow-y:auto;'
  list.innerHTML = '<span style="font-size:0.8rem;color:#6c7086;font-style:italic;">Loading…</span>'

  section.append(label, list)
  return section
}

// ── Refresh content ──────────────────────────────────────────────────────────

async function refresh(): Promise<void> {
  refreshRemote()
  await refreshImported()
  await refreshFolder()
}

interface RemoteEntry { title: string; file: string }
interface RemoteGroup { group: string; entries: RemoteEntry[] }
type LibraryData = RemoteGroup[] | RemoteEntry[]

let libraryData: LibraryData | null = null

function toGroups(data: LibraryData): RemoteGroup[] {
  if (data.length === 0) return []
  if ('group' in data[0]) return data as RemoteGroup[]
  return [{ group: '', entries: data as RemoteEntry[] }]
}

async function refreshRemote(): Promise<void> {
  const list = document.getElementById('lib-remote-list')
  if (!list) return
  if (!libraryData) {
    try {
      const base = (import.meta as any).env?.BASE_URL ?? '/'
      const res = await fetch(base + 'library.json')
      libraryData = await res.json()
    } catch {
      list.innerHTML = '<span style="font-size:0.8rem;color:#f38ba8;">Could not load chart list.</span>'
      return
    }
  }
  list.innerHTML = ''
  for (const group of toGroups(libraryData!)) {
    if (group.group) {
      const header = document.createElement('div')
      header.textContent = group.group
      header.style.cssText =
        'font-weight:bold;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.06em;' +
        'color:#89b4fa;margin-top:6px;padding:2px 0;'
      list.appendChild(header)
    }
    for (const entry of group.entries) {
      list.appendChild(scoreRowBase(entry.title, async () => {
        close()
        try {
          const base = (import.meta as any).env?.BASE_URL ?? '/'
          const res = await fetch(base + entry.file)
          const xml = await res.text()
          await onLoad(xml, entry.title)
        } catch (e) {
          notify('Failed to load ' + entry.title + ': ' + (e as Error).message, 'error')
        }
      }))
    }
  }
}

async function refreshImported(): Promise<void> {
  const list = document.getElementById('lib-imported-list')
  if (!list) return
  list.innerHTML = ''
  const scores = await listScores()
  if (scores.length === 0) {
    list.innerHTML = '<span style="font-size:0.8rem;color:#6c7086;font-style:italic;">No imported scores yet.</span>'
    return
  }
  scores
    .sort((a, b) => a.title.localeCompare(b.title))
    .forEach(entry => list.appendChild(importedRow(entry)))
}

async function refreshFolder(): Promise<void> {
  const nameEl = document.getElementById('lib-folder-name')
  const list   = document.getElementById('lib-folder-list')
  if (!list || !nameEl) return
  list.innerHTML = ''

  if (!currentFolder) {
    nameEl.textContent = 'No folder selected'
    return
  }

  nameEl.textContent = currentFolder.name
  let entries: FolderEntry[]
  try {
    entries = await listFolderScores(currentFolder)
  } catch {
    nameEl.textContent = currentFolder.name + ' (permission needed — re-select folder)'
    return
  }

  if (entries.length === 0) {
    list.innerHTML = '<span style="font-size:0.8rem;color:#6c7086;font-style:italic;">No .xml/.mxl files found.</span>'
    return
  }
  entries.forEach(entry => list.appendChild(folderRow(entry)))
}

// ── Row builders ──────────────────────────────────────────────────────────────

function scoreRowBase(title: string, onClickLoad: () => void): HTMLElement {
  const row = document.createElement('div')
  row.style.cssText =
    'display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:4px;' +
    'background:rgba(255,255,255,0.05);'

  const titleEl = document.createElement('span')
  titleEl.textContent = title
  titleEl.style.cssText = 'flex:1;font-size:0.88rem;cursor:pointer;overflow:hidden;' +
    'text-overflow:ellipsis;white-space:nowrap;'
  titleEl.title = title
  titleEl.onclick = onClickLoad

  row.appendChild(titleEl)
  return row
}

function importedRow(entry: LibraryEntry): HTMLElement {
  const row = scoreRowBase(entry.title, async () => {
    close()
    try {
      await onLoad(entry.xml, entry.title)
    } catch (e) {
      notify('Failed to load ' + entry.title + ': ' + (e as Error).message, 'error')
    }
  })

  const delBtn = document.createElement('button')
  delBtn.textContent = '🗑'
  delBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:0.85rem;' +
    'color:#f38ba8;padding:0 2px;flex-shrink:0;'
  delBtn.title = 'Remove from library'
  delBtn.onclick = async (e) => {
    e.stopPropagation()
    if (!confirm(`Remove "${entry.title}" from library?`)) return
    await deleteScore(entry.id)
    await refreshImported()
  }

  row.appendChild(delBtn)
  return row
}

function folderRow(entry: FolderEntry): HTMLElement {
  return scoreRowBase(entry.title, async () => {
    close()
    try {
      const xml = await readFolderScore(entry)
      await onLoad(xml, entry.title)
    } catch (e) {
      notify('Failed to read file: ' + (e as Error).message, 'error')
    }
  })
}

// ── Handlers ────────────────────────────────────────────────────────────────

async function handleImport(): Promise<void> {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.xml,.mxl'
  input.multiple = true
  input.onchange = async () => {
    const files = Array.from(input.files ?? [])
    for (const file of files) {
      try {
        const xml = await readMusicXml(file)
        const titleMatch = xml.match(/<work-title>([^<]+)<\/work-title>/)
          ?? xml.match(/<movement-title>([^<]+)<\/movement-title>/)
        const title = titleMatch?.[1] ?? file.name.replace(/\.(xml|mxl)$/i, '')
        await addScore(title, xml)
      } catch (e) {
        notify('Failed to import ' + file.name + ': ' + (e as Error).message, 'error')
      }
    }
    await refreshImported()
  }
  input.click()
}

async function handlePickFolder(): Promise<void> {
  try {
    currentFolder = await pickFolder()
    await refreshFolder()
  } catch (e) {
    if ((e as Error).name !== 'AbortError') {
      notify('Could not open folder: ' + (e as Error).message, 'error')
    }
  }
}

function close(): void {
  if (overlay) overlay.style.display = 'none'
}
