import { unzipSync } from 'fflate'

export async function openFilePicker(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xml,.mxl'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) { reject(new Error('No file selected')); return }
      try {
        resolve(await readMusicXml(file))
      } catch (e) {
        reject(e)
      }
    }
    input.click()
  })
}

export async function readMusicXml(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  if (file.name.endsWith('.mxl')) {
    return extractMxl(new Uint8Array(buf))
  }
  return new TextDecoder().decode(buf)
}

function extractMxl(data: Uint8Array): string {
  const entries = unzipSync(data)

  // Find rootfile path from META-INF/container.xml
  const containerData = entries['META-INF/container.xml']
  if (!containerData) throw new Error('Invalid .mxl: missing META-INF/container.xml')

  const containerXml = new TextDecoder().decode(containerData)
  const match = containerXml.match(/full-path="([^"]+)"/)
  if (!match) throw new Error('Invalid .mxl: cannot find rootfile path')

  const rootfilePath = match[1]
  const rootfileData = entries[rootfilePath]
  if (!rootfileData) throw new Error(`Invalid .mxl: rootfile "${rootfilePath}" not found in archive`)

  return new TextDecoder().decode(rootfileData)
}
