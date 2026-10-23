<script lang="ts">
  import { locale, tr } from '../i18n'
  import { formatNumber } from './format'
  import { clampHistogramHeight, HISTOGRAM, histogramHeight } from './settings'
  import Splitter from './Splitter.svelte'

  interface Props {
    /** 256 стовпців за індексом палітри (`paletteHistogram`). */
    bins: Uint32Array
    /** Палітра (768 байтів RGB). */
    rgb: Uint8Array
    /** Смуги ізотерм: частки ширини шкали 0…1 і колір CSS. */
    bands: readonly { lo: number; hi: number; color: string }[]
    minLabel: string
    maxLabel: string
    /** Температури стовпця для підказки; `null` — стовпець порожній за побудовою (вузька шкала). */
    binLabel: (index: number) => string | null
  }

  let { bins, rgb, bands, minLabel, maxLabel, binLabel }: Props = $props()

  // Висота — за найбільшим внутрішнім стовпцем: крайні збирають усі пікселі поза шкалою й можуть бути
  // набагато вищими (тоді обрізаються верхом графіка)
  const peak = $derived(Math.max(1, ...bins.subarray(1, 255)))
  const total = $derived(bins.reduce((a, n) => a + n, 0))
  const bars = $derived(
    Array.from(bins, (n, i) => ({
      i,
      h: Math.min(100, (n / peak) * 100),
      color: `rgb(${rgb[3 * i]},${rgb[3 * i + 1]},${rgb[3 * i + 2]})`,
    })).filter((b) => b.h > 0),
  )

  let hovered = $state<number | null>(null)
  const label = $derived(hovered === null ? null : binLabel(hovered))

  function move(e: PointerEvent) {
    const box = (e.currentTarget as Element).getBoundingClientRect()
    const i = Math.floor(((e.clientX - box.left) / Math.max(1, box.width)) * 256)
    hovered = Math.min(255, Math.max(0, i))
  }

  let dragFrom = 0
  const setHeight = (h: number) => histogramHeight.set(clampHistogramHeight(h))
</script>

<figure class="histogram">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="plot" onpointermove={move} onpointerleave={() => (hovered = null)}>
    <svg
      viewBox="0 0 256 100"
      preserveAspectRatio="none"
      role="img"
      aria-label={$tr('histogram.title')}
      style:height="{$histogramHeight}px"
    >
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
      {#if hovered !== null && label !== null}
        <line class="cursor" x1={hovered + 0.5} x2={hovered + 0.5} y1="0" y2="100" />
      {/if}
    </svg>
    {#if hovered !== null && label !== null}
      {@const n = bins[hovered]!}
      <div
        class="tip"
        class:start={hovered < 64}
        class:end={hovered >= 192}
        style:left="{((hovered + 0.5) / 256) * 100}%"
        role="status"
      >
        <span>{label}</span>
        <span
          ><strong>{n}</strong>
          {$tr('histogram.pixels')} ({formatNumber(total ? (n / total) * 100 : 0, $locale, 1)} %)</span
        >
      </div>
    {/if}
  </div>
  <div class="resize">
    <Splitter
      label={$tr('histogram.height')}
      orientation="horizontal"
      valuenow={$histogramHeight}
      valuemin={HISTOGRAM.min}
      valuemax={HISTOGRAM.max}
      onstart={() => (dragFrom = $histogramHeight)}
      ondrag={(dy) => setHeight(dragFrom + dy)}
      onstep={(n) => setHeight($histogramHeight + 8 * n)}
      onreset={() => setHeight(HISTOGRAM.default)}
    />
  </div>
  <figcaption>
    <span>{minLabel}</span>
    <span>{maxLabel}</span>
  </figcaption>
</figure>

<style>
  .histogram {
    margin: 8px 0 0;
  }
  .plot {
    position: relative;
  }
  svg {
    display: block;
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    box-sizing: border-box;
  }
  .band {
    opacity: 0.35;
  }
  .cursor {
    stroke: var(--fg);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  /* Підказка над графіком; біля країв прив'язана до краю, щоб не виходити за панель */
  .tip {
    position: absolute;
    bottom: calc(100% + 4px);
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    padding: 3px 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    box-shadow: 0 2px 6px rgb(0 0 0 / 0.15);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    pointer-events: none;
    z-index: 2;
  }
  .tip.start {
    transform: translateX(-8px);
  }
  .tip.end {
    transform: translateX(calc(-100% + 8px));
  }
  /* Межа зміни висоти накладається на нижній край графіка, не додаючи відступу */
  .resize {
    margin: -6px 0;
    position: relative;
    z-index: 1;
  }
  figcaption {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
</style>
