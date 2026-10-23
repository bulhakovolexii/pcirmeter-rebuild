/** Растеризація рисунків ODT-звіту в браузері (DOM — тому окремо від `report.ts`, який тестується в Node). */

import type { Svg } from '../report/figures'

/** Растеризує SVG у PNG (`scale` пікселів на пункт) через `<img>` і canvas; тло — біле. */
export async function rasterizeSvg({ svg, width, height }: Svg, scale: number): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const g = canvas.getContext('2d')
    if (!g) throw new Error('canvas 2d недоступний')
    g.fillStyle = '#fff'
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('canvas.toBlob повернув null')
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}
