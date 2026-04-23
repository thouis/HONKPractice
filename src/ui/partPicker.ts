import { matchPartCandidates } from '../data/partMapping'

export interface PartEntry {
  index: number
  name: string
  clef?: 'bass' | 'treble'
}

export interface PartSelection {
  indices: number[]
  instrumentId: string | null
}

// Shows a modal part picker.
// Unambiguous parts (e.g. "Trombone") appear as a single row.
// Ambiguous parts (e.g. "Bb instrument") expand into one row per candidate instrument.
// savedIndices pre-highlights the current selection (best-effort).
export function pickPart(
  parts: PartEntry[],
  savedIndices: number[] | null,
): Promise<PartSelection> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;' +
      'align-items:center;justify-content:center;z-index:200;'

    const panel = document.createElement('div')
    panel.style.cssText =
      'background:#1e1e2e;color:#cdd6f4;border-radius:8px;padding:20px;' +
      'width:min(440px,88vw);max-height:80vh;display:flex;flex-direction:column;gap:12px;' +
      'box-shadow:0 8px 32px rgba(0,0,0,0.6);'

    const header = document.createElement('div')
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;'
    const heading = document.createElement('h2')
    heading.textContent = 'Select Part'
    heading.style.cssText = 'margin:0;font-size:1.1rem;'
    const closeBtn = document.createElement('button')
    closeBtn.textContent = '✕'
    closeBtn.style.cssText = 'background:none;border:none;color:#cdd6f4;font-size:1.2rem;cursor:pointer;'
    header.append(heading, closeBtn)

    const list = document.createElement('div')
    list.style.cssText = 'display:flex;flex-direction:column;gap:4px;overflow-y:auto;max-height:55vh;'

    const allIndices = parts.map(p => p.index)
    const isSavedAll = savedIndices === null || savedIndices.length === parts.length

    function close(indices: number[], instrumentId: string | null): void {
      overlay.remove()
      resolve({ indices, instrumentId })
    }

    const fallback: PartSelection = { indices: savedIndices ?? allIndices, instrumentId: null }
    closeBtn.onclick = () => { overlay.remove(); resolve(fallback) }
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(fallback) } })

    // "All parts" row
    list.appendChild(makeRow('All parts', null, isSavedAll, () => close(allIndices, null)))

    for (const part of parts) {
      const isSaved = !isSavedAll && (savedIndices?.includes(part.index) ?? false)
      const candidates = matchPartCandidates(part.name, part.clef)

      if (candidates.length === 1) {
        // Unambiguous: show "Part Name" with instrument as subtitle if different
        const c = candidates[0]
        const subtitle = c.displayName !== part.name ? c.displayName : null
        list.appendChild(makeRow(part.name, subtitle, isSaved, () => close([part.index], c.instrumentId)))
      } else {
        // Ambiguous: one row per candidate, labelled "Part Name (Instrument)"
        for (const c of candidates) {
          const highlighted = isSaved && c.isDefault
          list.appendChild(makeRow(
            `${part.name} (${c.displayName})`,
            null,
            highlighted,
            () => close([part.index], c.instrumentId),
          ))
        }
      }
    }

    panel.append(header, list)
    overlay.appendChild(panel)
    document.body.appendChild(overlay)
  })
}

function makeRow(
  label: string,
  subtitle: string | null,
  highlighted: boolean,
  onClick: () => void,
): HTMLElement {
  const row = document.createElement('div')
  row.style.cssText =
    'padding:7px 12px;border-radius:4px;cursor:pointer;' +
    `background:${highlighted ? 'rgba(137,180,250,0.2)' : 'rgba(255,255,255,0.05)'};` +
    'border:1px solid ' + (highlighted ? 'rgba(137,180,250,0.5)' : 'transparent') + ';'
  row.onmouseenter = () => { row.style.background = 'rgba(137,180,250,0.15)' }
  row.onmouseleave = () => {
    row.style.background = highlighted ? 'rgba(137,180,250,0.2)' : 'rgba(255,255,255,0.05)'
  }
  row.onclick = onClick

  const nameEl = document.createElement('div')
  nameEl.textContent = label
  nameEl.style.fontSize = '0.9rem'
  row.appendChild(nameEl)

  if (subtitle) {
    const sub = document.createElement('div')
    sub.textContent = subtitle
    sub.style.cssText = 'font-size:0.75rem;color:#6c7086;margin-top:1px;'
    row.appendChild(sub)
  }

  return row
}
