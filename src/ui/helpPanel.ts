let overlay: HTMLElement | null = null

const SECTIONS: { heading: string; items: [string, string][] }[] = [
  {
    heading: 'Transport',
    items: [
      ['⏮', 'Rewind to start'],
      ['▶ / ⏸', 'Play / pause'],
      ['⏹', 'Stop and rewind'],
      ['Tempo slider', 'Adjust playback speed (30–150% of written tempo)'],
      ['Click on score', 'Jump to that measure'],
    ],
  },
  {
    heading: 'Sound',
    items: [
      ['Met: OFF/ON', 'Toggle metronome click'],
      ['Instrument dropdown', 'Choose which instrument\'s samples play back'],
      ['⚙ Settings', 'Adjust music volume, metronome volume, and pitch sensitivity'],
    ],
  },
  {
    heading: 'Microphone',
    items: [
      ['Mic: OFF', 'Microphone off'],
      ['Mic: Show', 'Show real-time intonation meter while playing along (headphones recommended)'],
      ['Mic: Listen', 'Practice mode — cursor waits until you play each note correctly; playback is muted'],
      ['± ¢ field', 'Intonation tolerance in cents for Listen mode (smaller = stricter)'],
    ],
  },
  {
    heading: 'Score display',
    items: [
      ['Hints: OFF/pos/pos+∂', 'Trombone slide-position labels: off, positions only, or positions with partials'],
      ['Voice: All/Low/Mid/High', 'Which voice to highlight for intonation and hints in chords'],
      ['Part button', 'Choose which part to display in multi-instrument scores'],
    ],
  },
  {
    heading: 'Loop',
    items: [
      ['Select', 'Click two measures on the score to set a loop range'],
      ['Loop: OFF/ON', 'Toggle looping over the selected range'],
      ['Bar inputs', 'Manually enter loop start and end bar numbers'],
      ['Rest: ON/OFF', 'Insert a bar of silence between repeats'],
    ],
  },
  {
    heading: 'Library & files',
    items: [
      ['Library', 'Browse and load built-in scores'],
      ['Load File', 'Open a MusicXML (.xml) or compressed MusicXML (.mxl) file from your device'],
    ],
  },
  {
    heading: 'Keyboard shortcuts',
    items: [
      ['Space', 'Play / pause'],
      ['Escape', 'Stop and rewind'],
      ['D', 'Toggle debug panel'],
    ],
  },
]

export function openHelpPanel(): void {
  if (!overlay) buildPanel()
  overlay!.style.display = 'flex'
}

function buildPanel(): void {
  overlay = document.createElement('div')
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:none;' +
    'align-items:center;justify-content:center;z-index:100;'
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })

  const panel = document.createElement('div')
  panel.style.cssText =
    'background:#1e1e2e;color:#cdd6f4;border-radius:8px;padding:20px;' +
    'width:min(520px,94vw);max-height:85vh;overflow-y:auto;' +
    'box-shadow:0 8px 32px rgba(0,0,0,0.6);display:flex;flex-direction:column;gap:16px;'

  const header = document.createElement('div')
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;'
  const heading = document.createElement('h2')
  heading.textContent = 'Help'
  heading.style.cssText = 'margin:0;font-size:1.1rem;color:#89b4fa;'
  const closeBtn = document.createElement('button')
  closeBtn.textContent = '✕'
  closeBtn.style.cssText = 'background:none;border:none;color:#cdd6f4;font-size:1.2rem;cursor:pointer;'
  closeBtn.onclick = close
  header.append(heading, closeBtn)
  panel.appendChild(header)

  for (const section of SECTIONS) {
    const sec = document.createElement('div')

    const h3 = document.createElement('div')
    h3.textContent = section.heading
    h3.style.cssText =
      'font-size:0.78rem;text-transform:uppercase;letter-spacing:0.08em;' +
      'color:#89b4fa;margin-bottom:6px;font-weight:600;'
    sec.appendChild(h3)

    const table = document.createElement('table')
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.85rem;'
    for (const [label, desc] of section.items) {
      const tr = document.createElement('tr')
      const tdLabel = document.createElement('td')
      tdLabel.textContent = label
      tdLabel.style.cssText =
        'padding:3px 12px 3px 0;white-space:nowrap;color:#cba6f7;vertical-align:top;' +
        'font-family:monospace;font-size:0.82rem;'
      const tdDesc = document.createElement('td')
      tdDesc.textContent = desc
      tdDesc.style.cssText = 'padding:3px 0;color:#a6adc8;'
      tr.append(tdLabel, tdDesc)
      table.appendChild(tr)
    }
    sec.appendChild(table)
    panel.appendChild(sec)
  }

  overlay.appendChild(panel)
  document.body.appendChild(overlay)
}

function close(): void {
  if (overlay) overlay.style.display = 'none'
}
