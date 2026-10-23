<script lang="ts">
  import type { TemperatureBin } from '../core/objects'
  import { fromCelsius } from '../core/units'
  import { locale, tr } from '../i18n'
  import { niceTicks } from './chart'
  import { formatNumber, TEMPERATURE_SYMBOL } from './format'
  import { units } from './settings'

  interface Props {
    /** Назва прямокутника (R1…). */
    name: string
    bins: readonly TemperatureBin[]
    /** Палітра (768 байтів RGB): стовпець k з n залито k-ю n-ю частиною палітри, як в оригіналі. */
    rgb: Uint8Array
    onexport: () => void
  }

  let { name, bins, rgb, onexport }: Props = $props()

  const uid = $props.id()
  const HEIGHT = 180
  const PAD = { left: 52, right: 14, top: 18, bottom: 24 }

  let width = $state(480)
  const plotW = $derived(Math.max(10, width - PAD.left - PAD.right))
  const plotH = HEIGHT - PAD.top - PAD.bottom

  const total = $derived(bins.reduce((sum, b) => sum + b.count, 0))
  const peak = $derived(Math.max(1, ...bins.map((b) => b.count)))
  const yTicks = $derived(niceTicks(0, peak, 4).filter(Number.isInteger))
  const yMax = $derived(Math.max(peak, yTicks.at(-1) ?? 1))

  const slot = $derived(plotW / Math.max(1, bins.length))
  const barW = $derived(slot * 0.8)
  const edges = $derived(bins.length ? [...bins.map((b) => b.from), bins.at(-1)!.to] : [])
  const bx = (k: number) => PAD.left + slot * k + (slot - barW) / 2
  const py = (n: number) => PAD.top + plotH - (n / yMax) * plotH

  const color = (i: number) => `rgb(${rgb[3 * i]},${rgb[3 * i + 1]},${rgb[3 * i + 2]})`
  /** Три точки градієнта стовпця k: початок, середина й кінець його частини палітри. */
  const stops = (k: number) => {
    const lo = Math.round((k / bins.length) * 255)
    const hi = Math.round(((k + 1) / bins.length) * 255)
    return [lo, Math.round((lo + hi) / 2), hi].map(color)
  }

  let hovered = $state<number | null>(null)
  const temp = (c: number) => formatNumber(fromCelsius(c, $units.temperature), $locale, 1)
  const range = (b: TemperatureBin) => `${temp(b.from)}…${temp(b.to)}`
  const share = (b: TemperatureBin) => formatNumber(total ? (b.count / total) * 100 : 0, $locale, 1)
</script>

<section class="distribution">
  <div class="head">
    <h2>{$tr('distribution.title')} {name}</h2>
    <span class="readout muted" aria-live="polite">
      {#if hovered !== null && hovered < bins.length}
        {@const b = bins[hovered]!}
        {range(b)}
        {TEMPERATURE_SYMBOL[$units.temperature]}: <strong>{b.count}</strong> ({share(b)} %)
      {:else if bins.length === 0}
        {$tr('distribution.noData')}
      {:else}
        {total} {$tr('distribution.pixels')}
      {/if}
    </span>
    <button type="button" disabled={bins.length === 0} onclick={onexport}>{$tr('distribution.export')}</button
    >
  </div>
  <div class="chart" bind:clientWidth={width}>
    <svg
      {width}
      height={HEIGHT}
      role="img"
      aria-label="{$tr('distribution.title')} {name}"
      onpointerleave={() => (hovered = null)}
    >
      <defs>
        {#each bins.keys() as k (k)}
          <linearGradient id="{uid}-bar{k}">
            {#each stops(k) as c, s (s)}
              <stop offset={s / 2} stop-color={c} />
            {/each}
          </linearGradient>
        {/each}
      </defs>
      {#each yTicks as n (n)}
        <line class="grid" x1={PAD.left} x2={PAD.left + plotW} y1={py(n)} y2={py(n)} />
        <text class="tick" x={PAD.left - 6} y={py(n) + 4} text-anchor="end"
          >{formatNumber(n, $locale, 0)}</text
        >
      {/each}
      <text class="unit" x={4} y={PAD.top - 6}>{$tr('results.pixels')}</text>
      <rect class="frame" x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
      {#each bins as b, k (k)}
        <g class="bar" class:active={hovered === k} role="presentation" onpointerenter={() => (hovered = k)}>
          <!-- Прозора смуга на всю висоту — наведення працює і над низькими стовпцями -->
          <rect class="hit" x={PAD.left + slot * k} y={PAD.top} width={slot} height={plotH} />
          <rect
            x={bx(k)}
            y={py(b.count)}
            width={barW}
            height={PAD.top + plotH - py(b.count)}
            fill="url(#{uid}-bar{k})"
          />
          <text class="count" x={bx(k) + barW / 2} y={py(b.count) - 4} text-anchor="middle">{b.count}</text>
        </g>
      {/each}
      <!-- Підписи — на межах діапазонів: n + 1 чисел вміщаються і на вузькому графіку -->
      {#each edges as c, k (k)}
        <text
          class="tick"
          x={PAD.left + slot * k}
          y={HEIGHT - 6}
          text-anchor={k === 0 ? 'start' : k === bins.length ? 'end' : 'middle'}>{temp(c)}</text
        >
      {/each}
    </svg>
  </div>
</section>

<style>
  .distribution {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .readout {
    flex: 1;
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
  }
  .muted {
    color: var(--muted);
  }
  .chart {
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    overflow: hidden;
  }
  svg {
    display: block;
  }
  .grid {
    stroke: var(--border);
  }
  .frame {
    fill: none;
    stroke: var(--border);
  }
  .tick,
  .unit,
  .count {
    fill: var(--muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .count {
    fill: var(--fg);
  }
  .hit {
    fill: transparent;
  }
  .bar.active .hit {
    fill: var(--border);
    fill-opacity: 0.5;
  }
  .bar rect:not(.hit) {
    stroke: var(--fg);
    stroke-width: 0.75;
  }
</style>
