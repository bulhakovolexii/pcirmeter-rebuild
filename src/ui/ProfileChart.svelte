<script lang="ts">
  import { fromCelsius } from '../core/units'
  import { locale, tr } from '../i18n'
  import { niceTicks, tickDigits } from './chart'
  import { formatNumber, formatTemperature, TEMPERATURE_SYMBOL } from './format'
  import type { ProfilePoint } from './results'
  import { units } from './settings'

  interface Props {
    /** Назва лінії (L1…). */
    name: string
    points: readonly ProfilePoint[]
    /** Номер точки під курсором (з 0) — підсвічується і на зображенні. */
    hoverIndex: number | null
    onhover: (index: number | null) => void
    onexport: () => void
  }

  let { name, points, hoverIndex, onhover, onexport }: Props = $props()

  const HEIGHT = 180
  const PAD = { left: 52, right: 14, top: 10, bottom: 24 }

  let width = $state(480)
  const plotW = $derived(Math.max(10, width - PAD.left - PAD.right))
  const plotH = HEIGHT - PAD.top - PAD.bottom

  // Значення в одиницях показу
  const values = $derived(points.map((p) => fromCelsius(p.t, $units.temperature)))
  const extremes = $derived.by(() => {
    let max = -1
    let min = -1
    values.forEach((v, k) => {
      if (Number.isNaN(v)) return
      if (max < 0 || v > values[max]!) max = k
      if (min < 0 || v < values[min]!) min = k
    })
    return { max, min }
  })
  const yRange = $derived.by(() => {
    if (extremes.max < 0) return { lo: 0, hi: 1 }
    const hi = values[extremes.max]!
    const lo = values[extremes.min]!
    const pad = hi > lo ? (hi - lo) * 0.08 : 0.5
    return { lo: lo - pad, hi: hi + pad }
  })
  const yTicks = $derived(niceTicks(yRange.lo, yRange.hi, 5))
  const yDigits = $derived(tickDigits(yTicks))
  const xTicks = $derived(
    niceTicks(1, Math.max(1, points.length), Math.max(2, Math.floor(plotW / 60))).filter(Number.isInteger),
  )

  const px = (k: number) => PAD.left + (points.length > 1 ? (k / (points.length - 1)) * plotW : plotW / 2)
  const py = (v: number) => PAD.top + ((yRange.hi - v) / (yRange.hi - yRange.lo)) * plotH

  // Лінія з розривами на пікселях поза калібруванням
  const path = $derived.by(() => {
    let d = ''
    let pen = false
    values.forEach((v, k) => {
      if (Number.isNaN(v)) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${px(k).toFixed(1)} ${py(v).toFixed(1)} `
      pen = true
    })
    return d
  })

  function onPointerMove(e: PointerEvent) {
    if (points.length === 0) return
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    const x = e.clientX - rect.left - PAD.left
    const k = points.length > 1 ? Math.round((x / plotW) * (points.length - 1)) : 0
    onhover(Math.min(points.length - 1, Math.max(0, k)))
  }

  const hovered = $derived(hoverIndex !== null && hoverIndex < points.length ? hoverIndex : null)
  const fmt = (c: number) => formatTemperature(c, $locale, $units.temperature)
</script>

<section class="profile">
  <div class="head">
    <h2>{$tr('profile.title')} {name}</h2>
    <span class="readout muted" aria-live="polite">
      {#if hovered !== null}
        {@const p = points[hovered]!}
        № {hovered + 1} ({p.x}, {p.y}): <strong>{fmt(p.t)}</strong>
      {:else}
        {points.length} {$tr('profile.points')}
      {/if}
    </span>
    <button type="button" disabled={points.length === 0} onclick={onexport}>{$tr('profile.export')}</button>
  </div>
  <div class="chart" bind:clientWidth={width}>
    <svg
      {width}
      height={HEIGHT}
      role="img"
      aria-label="{$tr('profile.title')} {name}"
      onpointermove={onPointerMove}
      onpointerleave={() => onhover(null)}
    >
      {#each yTicks as v (v)}
        <line class="grid" x1={PAD.left} x2={PAD.left + plotW} y1={py(v)} y2={py(v)} />
        <text class="tick" x={PAD.left - 6} y={py(v) + 4} text-anchor="end"
          >{formatNumber(v, $locale, yDigits)}</text
        >
      {/each}
      {#each xTicks as n (n)}
        <text class="tick" x={px(n - 1)} y={HEIGHT - 6} text-anchor="middle">{n}</text>
      {/each}
      <text class="unit" x={4} y={PAD.top + 4}>{TEMPERATURE_SYMBOL[$units.temperature]}</text>
      <rect class="frame" x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
      <path class="line" d={path} />
      {#if extremes.max >= 0}
        <circle class="max" cx={px(extremes.max)} cy={py(values[extremes.max]!)} r="3.5">
          <title>Max {fmt(points[extremes.max]!.t)}</title>
        </circle>
        <circle class="min" cx={px(extremes.min)} cy={py(values[extremes.min]!)} r="3.5">
          <title>Min {fmt(points[extremes.min]!.t)}</title>
        </circle>
      {/if}
      {#if hovered !== null}
        <line class="cursor" x1={px(hovered)} x2={px(hovered)} y1={PAD.top} y2={PAD.top + plotH} />
        {#if !Number.isNaN(values[hovered]!)}
          <circle class="dot" cx={px(hovered)} cy={py(values[hovered]!)} r="4" />
        {/if}
      {/if}
    </svg>
  </div>
</section>

<style>
  .profile {
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
    border-radius: 6px;
    background: var(--surface);
    overflow: hidden;
  }
  svg {
    display: block;
    cursor: crosshair;
    touch-action: none;
  }
  .grid {
    stroke: var(--border);
  }
  .frame {
    fill: none;
    stroke: var(--border);
  }
  .tick,
  .unit {
    fill: var(--muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .line {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .max {
    fill: #e5484d;
  }
  .min {
    fill: #0b9ad6;
  }
  .cursor {
    stroke: var(--fg);
    stroke-dasharray: 3 3;
  }
  .dot {
    fill: var(--surface);
    stroke: var(--fg);
    stroke-width: 1.5;
  }
</style>
