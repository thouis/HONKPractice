let overlay: HTMLElement | null = null

const SECTIONS: { heading: string; items: [string, string][] }[] = [
  {
    heading: 'Playback',
    items: [
      ['⏮  ▶/⏸  ⏹', 'Rewind — play/pause — stop'],
      ['Tempo slider', 'BPM; resets to score tempo on load'],
      ['Click score', 'Jump to that measure'],
      ['Met', 'Metronome on/off'],
      ['Instrument', 'Choose playback sound'],
    ],
  },
  {
    heading: 'Microphone',
    items: [
      ['Mic: Show', 'Intonation meter — green/yellow/red as you play along'],
      ['Mic: Listen', 'Cursor waits until each note is played in tune; playback muted'],
      ['± ¢', 'Intonation tolerance for Listen mode'],
    ],
  },
  {
    heading: 'Score & loop',
    items: [
      ['Hints', 'Position/fingering labels above notes (cycle off → pos → pos+partial)'],
      ['Voice', 'Which note in a chord to track for intonation'],
      ['Part', 'Switch parts in a multi-instrument score'],
      ['Select', 'Click two bars to set a loop range'],
      ['Loop', 'Toggle looping; bar inputs set range manually'],
      ['Rest', 'Add a silent bar between repeats'],
    ],
  },
  {
    heading: 'Keyboard',
    items: [
      ['Space', 'Play / pause'],
      ['Esc', 'Stop'],
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
