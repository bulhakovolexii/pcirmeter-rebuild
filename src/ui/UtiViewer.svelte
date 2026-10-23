<script lang="ts">
  // Store перекладу імпортовано як `t`: ім'я `tr` у шаблоні з <tr> Svelte сприймає як компонент
  import { UTI_RANGE } from '../core/uti'
  import { fromCelsius } from '../core/units'
  import { locale, tr as t } from '../i18n'
  import type { OpenedUti } from './files'
  import { formatNumber, formatSavedAt, formatTemperature, TEMPERATURE_SYMBOL } from './format'
  import { registerReportSource } from './report'
  import { clampSidebarWidth, SIDEBAR, sidebarWidth, units } from './settings'
  import Splitter from './Splitter.svelte'
  import { utiSavedAt, utiValues } from './uti'

  interface Props {
    file: OpenedUti
  }

  let { file }: Props = $props()

  const uti = $derived(file.uti)
  const values = $derived(utiValues(uti))
  const savedAt = $derived(utiSavedAt(file.name))
  let showMarkers = $state(true)

  const fmt = (c: number) => formatTemperature(c, $locale, $units.temperature)

  let canvas: HTMLCanvasElement | undefined = $state()
  $effect(() => {
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.putImageData(new ImageData(new Uint8ClampedArray(uti.screen), uti.width, uti.height), 0, 0)
  })

  // Знімок вписується в область; маркери — у пікселях екрана поверх нього
  let areaWidth = $state(0)
  let areaHeight = $state(0)
  const k = $derived(Math.max(0.1, Math.min(areaWidth / uti.width, areaHeight / uti.height)))
  const offX = $derived((areaWidth - uti.width * k) / 2)
  const offY = $derived((areaHeight - uti.height * k) / 2)

  $effect(() => registerReportSource(file.id, () => ({ name: file.name, uti: file.uti, showMarkers })))

  let viewerEl: HTMLDivElement | undefined = $state()
  let dragFrom = 0
  const setSidebarWidth = (width: number) => sidebarWidth.set(clampSidebarWidth(width, viewerEl?.clientWidth))
</script>

<div class="viewer" bind:this={viewerEl} style:--sidebar-width="{$sidebarWidth}px">
  <aside class="controls">
    <section>
      <h2>{$t('info.title')}</h2>
      <dl>
        <dt>{$t('info.camera')}</dt>
        <dd>UNI-T UTi89 PRO</dd>
        <dt>{$t('uti.sensor')}</dt>
        <dd>80 × 60</dd>
        <dt>{$t('uti.screen')}</dt>
        <dd>{uti.width} × {uti.height}</dd>
        {#if savedAt}
          <dt>{$t('info.date')}</dt>
          <dd>{formatSavedAt(savedAt)}</dd>
        {/if}
        <dt>{$t('info.range')}</dt>
        <dd>
          {formatNumber(fromCelsius(UTI_RANGE.min, $units.temperature), $locale, 0)} …
          {formatNumber(fromCelsius(UTI_RANGE.max, $units.temperature), $locale, 0)}
          {TEMPERATURE_SYMBOL[$units.temperature]}
        </dd>
      </dl>
    </section>

    <section class="limits" role="note">
      <h2>{$t('uti.limitedTitle')}</h2>
      <p>{$t('uti.limited')}</p>
    </section>

    <label class="check">
      <input type="checkbox" bind:checked={showMarkers} />
      {$t('uti.markers')}
    </label>
  </aside>

  <Splitter
    label={$t('view.sidebarWidth')}
    valuenow={$sidebarWidth}
    valuemin={SIDEBAR.min}
    valuemax={SIDEBAR.max}
    onstart={() => (dragFrom = $sidebarWidth)}
    ondrag={(dx) => setSidebarWidth(dragFrom + dx)}
    onstep={(n) => setSidebarWidth($sidebarWidth + 16 * n)}
    onreset={() => setSidebarWidth(SIDEBAR.default)}
  />

  <section class="image-area">
    <div
      class="stage"
      role="img"
      aria-label={$t('uti.screenAlt')}
      bind:clientWidth={areaWidth}
      bind:clientHeight={areaHeight}
    >
      <canvas
        bind:this={canvas}
        width={uti.width}
        height={uti.height}
        style:left="{offX}px"
        style:top="{offY}px"
        style:width="{uti.width * k}px"
        style:height="{uti.height * k}px"
      ></canvas>
      {#if showMarkers}
        <svg class="overlay" aria-hidden="true">
          {#each values as v (v.kind)}
            {@const cx = offX + (v.point.x + 0.5) * k}
            {@const cy = offY + (v.point.y + 0.5) * k}
            {@const right = cx + 12 + 90 < areaWidth}
            <g class="marker {v.kind}" transform="translate({cx} {cy})">
              {#if v.kind === 'center'}
                <path d="M -9 0 H -3 M 3 0 H 9 M 0 -9 V -3 M 0 3 V 9" />
              {:else}
                <circle r="7" />
                <path d="M -11 0 H -4 M 4 0 H 11 M 0 -11 V -4 M 0 4 V 11" />
              {/if}
              <!-- Центр — підпис під маркером: max часто поруч із центром, підписи не накладаються -->
              <text
                x={right ? 12 : -12}
                y={v.kind === 'center' ? 20 : -8}
                text-anchor={right ? 'start' : 'end'}>{$t(`uti.${v.kind}`)} {fmt(v.point.celsius)}</text
              >
            </g>
          {/each}
        </svg>
      {/if}
    </div>

    <section class="results">
      <h2>{$t('uti.values')}</h2>
      <table>
        <thead>
          <tr>
            <th>{$t('results.object')}</th>
            <th>{$t('uti.value')}</th>
            <th>{$t('uti.point')}</th>
          </tr>
        </thead>
        <tbody>
          {#each values as v (v.kind)}
            <tr>
              <td>{$t(`uti.${v.kind}`)}</td>
              <td class="num" class:flag={v.outOfRange}>
                {fmt(v.point.celsius)}
                {#if v.outOfRange}<span class="reason">({$t('cursor.outOfRange')})</span>{/if}
              </td>
              <td class="num">{v.point.x}, {v.point.y}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  </section>
</div>

<style>
  .viewer {
    display: grid;
    grid-template-columns: min(var(--sidebar-width, 240px), 50%) auto 1fr;
    column-gap: 2px;
    height: 100%;
    min-height: 0;
  }
  .controls {
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
    min-height: 0;
    padding-right: 8px;
    scrollbar-gutter: stable;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
    margin: 0;
    font-size: 0.85rem;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .limits {
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-left: 4px solid var(--gold);
    border-radius: 8px;
    background: var(--surface);
  }
  .limits p {
    margin: 0;
    font-size: 0.85rem;
  }
  .check {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 0.9rem;
  }
  .image-area {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    min-width: 0;
  }
  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--stage);
    border-radius: 8px;
  }
  canvas {
    position: absolute;
    image-rendering: pixelated;
  }
  .overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .marker circle,
  .marker path {
    fill: none;
    stroke-width: 2;
    filter: drop-shadow(0 0 1px #000);
  }
  .marker.max circle,
  .marker.max path {
    stroke: #fff;
  }
  .marker.min circle,
  .marker.min path {
    stroke: #0ff;
  }
  .marker.center path {
    stroke: #a6ff4d;
  }
  .marker text {
    fill: #fff;
    font-size: 12px;
    paint-order: stroke;
    stroke: #000;
    stroke-width: 3px;
  }
  .results {
    flex-shrink: 0;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }
  table {
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  th,
  td {
    padding: 3px 14px 3px 0;
    text-align: left;
  }
  th {
    color: var(--muted);
    font-weight: 600;
    border-bottom: 1px solid var(--border);
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
  .flag {
    color: var(--warn);
  }
  .reason {
    font-size: 0.8rem;
  }
</style>
