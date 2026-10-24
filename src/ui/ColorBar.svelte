<script lang="ts">
  import { palette, type PaletteId } from '../core/palettes'

  interface Props {
    paletteId: PaletteId
    /** Підписи меж (уже відформатовані). */
    maxLabel: string
    minLabel: string
    /** Смуги ізотерм: частки шкали 0…1 знизу вгору і колір CSS; пізніші — поверх. */
    bands?: readonly { lo: number; hi: number; color: string }[]
  }

  let { paletteId, maxLabel, minLabel, bands = [] }: Props = $props()

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
  <div class="strip">
    <canvas bind:this={canvas} width="1" height="256"></canvas>
    {#each bands as band, k (k)}
      <span
        class="band"
        style:bottom="{band.lo * 100}%"
        style:height="max(2px, {(band.hi - band.lo) * 100}%)"
        style:background={band.color}
      ></span>
    {/each}
  </div>
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
  .strip {
    position: relative;
    flex: 1;
    width: 24px;
    min-height: 0;
    border: 1px solid var(--border);
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }
  .band {
    position: absolute;
    left: 0;
    right: 0;
  }
  .label {
    font-size: 0.744rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
</style>
