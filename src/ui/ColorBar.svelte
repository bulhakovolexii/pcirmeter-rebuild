<script lang="ts">
  import { palette, type PaletteId } from '../core/palettes'

  interface Props {
    paletteId: PaletteId
    /** Підписи меж (уже відформатовані). */
    maxLabel: string
    minLabel: string
  }

  let { paletteId, maxLabel, minLabel }: Props = $props()

  let canvas: HTMLCanvasElement | undefined = $state()

  // Смуга 1×256: зверху — індекс 255 (гаряче), як у кольоровій шкалі оригіналу
  $effect(() => {
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    const rgb = palette(paletteId)
    const img = ctx.createImageData(1, 256)
    for (let row = 0; row < 256; row++) {
      const c = 3 * (255 - row)
      img.data.set([rgb[c]!, rgb[c + 1]!, rgb[c + 2]!, 255], 4 * row)
    }
    ctx.putImageData(img, 0, 0)
  })
</script>

<div class="bar">
  <span class="label">{maxLabel}</span>
  <canvas bind:this={canvas} width="1" height="256"></canvas>
  <span class="label">{minLabel}</span>
</div>

<style>
  .bar {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    height: 100%;
    min-height: 0;
  }
  canvas {
    flex: 1;
    width: 24px;
    min-height: 0;
    border: 1px solid var(--border);
    image-rendering: pixelated;
  }
  .label {
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
</style>
