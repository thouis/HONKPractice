#!/usr/bin/env node

import fs from 'fs';

// MIDI note to name conversion
function getMidiNoteName(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const notes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  return notes[midi % 12] + octave;
}

// Extract data from trombonePositions.ts by parsing the TypeScript source
const source = fs.readFileSync('./src/data/trombonePositions.ts', 'utf8');

// Parse the data - extract MIDI→position mappings
const positionChart = {}; // partial → position → note info

// Match pattern like: 41: [{ pos: 1, partial: 2, preferred: true }],   // F2
const lines = source.split('\n');
for (const line of lines) {
  const match = line.match(/^\s*(\d+):\s*\[\{\s*pos:\s*(\d+),\s*partial:\s*(\d+),\s*preferred:\s*(\w+)\s*\}\]/);
  if (match) {
    const midi = parseInt(match[1]);
    const pos = parseInt(match[2]);
    const partial = parseInt(match[3]);
    const preferred = match[4] === 'true';
    
    // Extract note name from comment
    const commentMatch = line.match(/\/\/\s*([A-G](?:b|#|♭|#)?\d)/);
    const note = commentMatch ? commentMatch[1] : getMidiNoteName(midi);
    
    if (!positionChart[partial]) positionChart[partial] = {};
    positionChart[partial][pos] = { note, preferred };
  }
}

// Print header
console.log('\nTROMBONE POSITION CHART');
console.log('Partials (rows) ↓  ×  Positions (columns) →\n');

// Determine which partials we have
const partials = Object.keys(positionChart)
  .map(p => parseInt(p))
  .sort((a, b) => a - b);

// Build and print table
const header = '       │' + Array.from({length: 7}, (_, i) => `  Pos${i+1}  `).join('│') + '│';
console.log(header);
console.log('───────┼' + Array.from({length: 7}).map(() => '─────────').join('┼') + '┤');

for (const partial of partials) {
  const partialData = positionChart[partial] || {};
  const row = `Part ${String(partial).padEnd(2)} │`;
  
  const cells = Array.from({length: 7}, (_, i) => {
    const pos = i + 1;
    const cell = partialData[pos];
    if (!cell) return '   -   ';
    
    // Mark preferred positions with * suffix for alternates
    const mark = cell.preferred ? ' ' : '*';
    const padded = (cell.note + mark).padStart(6).padEnd(7);
    return padded;
  });
  
  console.log(row + cells.join('│') + '│');
}

console.log('───────┴' + Array.from({length: 7}).map(() => '─────────').join('┴') + '┘');
console.log('\n* = alternate (non-preferred) position');
console.log('- = not available at this partial/position\n');
