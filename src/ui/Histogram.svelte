<script lang="ts">
  import { tr } from '../i18n'

  interface Props {
    /** 256 стовпців за індексом палітри (`paletteHistogram`). */
    bins: Uint32Array
    /** Палітра (768 байтів RGB). */
    rgb: Uint8Array
    /** Смуги ізотерм: частки ширини шкали 0…1 і колір CSS. */
    bands: readonly { lo: number; hi: number; color: string }[]
    minLabel: string
    maxLabel: string
  }

  let { bins, rgb, bands, minLabel, maxLabel }: Props = $props()

  // Висота — за найбільшим внутрішнім стовпцем: крайні збирають усі пікселі поза шкалою й можуть бути
  // набагато вищими (тоді обрізаються верхом графіка)
  const peak = $derived(Math.max(1, ...bins.subarray(1, 255)))
  const bars = $derived(
    Array.from(bins, (n, i) => ({
      i,
      h: Math.min(100, (n / peak) * 100),
      color: `rgb(${rgb[3 * i]},${rgb[3 * i + 1]},${rgb[3 * i + 2]})`,
    })).filter((b) => b.h > 0),
  )
</script>

<figure class="histogram">
  <svg viewBox="0 0 256 100" preserveAspectRatio="none" role="img" aria-label={$tr('histogram.title')}>
    {#each bars as b (b.i)}
      <rect x={b.i} y={100 - b.h} width="1" height={b.h} fill={b.color} />
    {/each}
    {#each bands as band, k (k)}
      <rect
        class="band"
        x={band.lo * 256}
        y="0"
        width={Math.max(0.5, (band.hi - band.lo) * 256)}
        height="100"
        fill={band.color}
      />
    {/each}
  </svg>
  <figcaption>
    <span>{minLabel}</span>
    <span>{maxLabel}</span>
  </figcaption>
</figure>

<style>
  .histogram {
    margin: 8px 0 0;
  }
  svg {
    display: block;
    width: 100%;
    height: 72px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    box-sizing: border-box;
  }
  .band {
    opacity: 0.35;
  }
  figcaption {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
</style>
