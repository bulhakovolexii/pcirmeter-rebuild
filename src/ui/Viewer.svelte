<script lang="ts">
  import { DEFAULT_PALETTE, PALETTE_IDS, palette, type PaletteId } from '../core/palettes'
  import { autoDisplayScale, frameExtremes, manualDisplayScale, renderFrame } from '../core/render'
  import { autoScale, measurementRange, temperatureModel } from '../core/temperature'
  import { locale, tr } from '../i18n'
  import ColorBar from './ColorBar.svelte'
  import type { OpenedFile } from './files'
  import { formatCelsius, formatNumber, formatSavedAt, temperatureStatus } from './format'

  interface Props {
    file: OpenedFile
  }

  let { file }: Props = $props()

  const MIN_ZOOM = 0.25
  const MAX_ZOOM = 64
  const ZOOM_STEP = 1.25

  const ir = $derived(file.thermogram.ir)
  const info = $derived(file.thermogram.info)
  const model = $derived(temperatureModel(ir))
  const auto = $derived(autoScale(ir, model))
  const range = $derived(measurementRange(ir.params.tempRange))
  const extremes = $derived(frameExtremes(ir))

  let paletteId = $state<PaletteId>(DEFAULT_PALETTE)
  let scaleMode = $state<'auto' | 'manual'>('auto')
  // Ручна шкала стартує з меж автошкали, округлених до 0,1 °C
  let manualMin = $state(0)
  let manualMax = $state(0)
  let showExtremes = $state(true)

  const manualValid = $derived(
    Number.isFinite(manualMin) && Number.isFinite(manualMax) && manualMin < manualMax,
  )
  const manual = $derived(scaleMode === 'manual' && manualValid)
  const scale = $derived(manual ? manualDisplayScale(ir, model, manualMin, manualMax) : autoDisplayScale(ir))
  const scaleLabels = $derived(manual ? { min: manualMin, max: manualMax } : auto)

  function setScaleMode(mode: 'auto' | 'manual') {
    if (mode === 'manual' && scaleMode === 'auto') {
      manualMin = Math.round(auto.min * 10) / 10
      manualMax = Math.round(auto.max * 10) / 10
    }
    scaleMode = mode
  }

  // Масштаб: CSS-пікселів на піксель кадру; зсув — положення лівого верхнього кута кадру у вікні
  let viewport: HTMLDivElement | undefined = $state()
  let viewWidth = $state(0)
  let viewHeight = $state(0)
  let zoom = $state(1)
  let panX = $state(0)
  let panY = $state(0)
  /** Поки користувач не змінив масштаб, кадр вписується у вікно при кожній зміні розміру. */
  let autoFit = $state(true)

  $effect(() => {
    if (!autoFit || viewWidth === 0 || viewHeight === 0) return
    const z = Math.min(viewWidth / ir.width, viewHeight / ir.height)
    zoom = z
    panX = (viewWidth - ir.width * z) / 2
    panY = (viewHeight - ir.height * z) / 2
  })

  function zoomTo(next: number, cx = viewWidth / 2, cy = viewHeight / 2) {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
    panX = cx - ((cx - panX) * z) / zoom
    panY = cy - ((cy - panY) * z) / zoom
    zoom = z
    autoFit = false
  }

  let canvas: HTMLCanvasElement | undefined = $state()

  $effect(() => {
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    const rgba = renderFrame(ir.ad, palette(paletteId), scale)
    ctx.putImageData(new ImageData(rgba, ir.width, ir.height), 0, 0)
  })

  // Колесо — непасивний обробник, щоб не прокручувати сторінку
  $effect(() => {
    const el = viewport
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      zoomTo(zoom * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), e.clientX - rect.left, e.clientY - rect.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  let drag: { x: number; y: number; panX: number; panY: number } | null = null
  let hover: { x: number; y: number } | null = $state(null)

  function updateHover(e: PointerEvent) {
    const rect = viewport!.getBoundingClientRect()
    const x = Math.floor((e.clientX - rect.left - panX) / zoom)
    const y = Math.floor((e.clientY - rect.top - panY) / zoom)
    hover = x >= 0 && y >= 0 && x < ir.width && y < ir.height ? { x, y } : null
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return
    drag = { x: e.clientX, y: e.clientY, panX, panY }
    viewport!.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: PointerEvent) {
    if (drag) {
      panX = drag.panX + e.clientX - drag.x
      panY = drag.panY + e.clientY - drag.y
      autoFit = false
    }
    updateHover(e)
  }

  function onPointerUp(e: PointerEvent) {
    drag = null
    if (viewport!.hasPointerCapture(e.pointerId)) viewport!.releasePointerCapture(e.pointerId)
  }

  function onKeyDown(e: KeyboardEvent) {
    const step = 40
    switch (e.key) {
      case '+':
      case '=':
        zoomTo(zoom * ZOOM_STEP)
        break
      case '-':
        zoomTo(zoom / ZOOM_STEP)
        break
      case '0':
        autoFit = true
        break
      case 'ArrowLeft':
        panX += step
        break
      case 'ArrowRight':
        panX -= step
        break
      case 'ArrowUp':
        panY += step
        break
      case 'ArrowDown':
        panY -= step
        break
      default:
        return
    }
    if (e.key.startsWith('Arrow')) autoFit = false
    e.preventDefault()
  }

  const cursor = $derived.by(() => {
    if (!hover) return null
    const ad = ir.ad[hover.y * ir.width + hover.x]!
    const t = model.toCelsius(ad)
    return { ...hover, t, status: temperatureStatus(t, range) }
  })

  const markers = $derived(
    (['max', 'min'] as const).map((kind) => {
      const p = extremes[kind]
      return {
        kind,
        cx: panX + (p.x + 0.5) * zoom,
        cy: panY + (p.y + 0.5) * zoom,
        label: `${kind === 'max' ? 'Max' : 'Min'} ${formatCelsius(model.toCelsius(p.ad), $locale)}`,
      }
    }),
  )

  const fmt = (t: number) => formatCelsius(t, $locale)
</script>

<div class="viewer">
  <aside class="controls">
    <label class="field">
      <span>{$tr('palette.title')}</span>
      <select bind:value={paletteId}>
        {#each PALETTE_IDS as id (id)}
          <option value={id}>{$tr(`palette.${id}`)}</option>
        {/each}
      </select>
    </label>

    <fieldset>
      <legend>{$tr('scale.title')}</legend>
      <div class="segmented">
        <label>
          <input
            type="radio"
            name="scale-{file.id}"
            checked={scaleMode === 'auto'}
            onchange={() => setScaleMode('auto')}
          />
          {$tr('scale.auto')}
        </label>
        <label>
          <input
            type="radio"
            name="scale-{file.id}"
            checked={scaleMode === 'manual'}
            onchange={() => setScaleMode('manual')}
          />
          {$tr('scale.manual')}
        </label>
      </div>
      {#if scaleMode === 'manual'}
        <div class="limits">
          <label class="field">
            <span>{$tr('scale.max')}</span>
            <input type="number" step="0.1" bind:value={manualMax} />
          </label>
          <label class="field">
            <span>{$tr('scale.min')}</span>
            <input type="number" step="0.1" bind:value={manualMin} />
          </label>
        </div>
        {#if !manualValid}
          <p class="warning" role="alert">{$tr('scale.invalid')}</p>
        {/if}
      {/if}
    </fieldset>

    <label class="check">
      <input type="checkbox" bind:checked={showExtremes} />
      {$tr('view.extremes')}
    </label>

    <section class="readout" aria-live="polite">
      <h2>{$tr('cursor.title')}</h2>
      {#if cursor}
        <p class="temp" class:flag={cursor.status !== 'ok'}>{fmt(cursor.t)}</p>
        {#if cursor.status === 'out-of-range'}
          <p class="warning">{$tr('cursor.outOfRange')}</p>
        {:else if cursor.status === 'no-calibration'}
          <p class="warning">{$tr('cursor.noCalibration')}</p>
        {/if}
        <p class="muted">{$tr('cursor.pixel')}: {cursor.x}, {cursor.y}</p>
      {:else}
        <p class="temp muted">—</p>
      {/if}
    </section>

    <section>
      <h2>{$tr('info.title')}</h2>
      <dl>
        <dt>{$tr('info.frame')}</dt>
        <dd>{ir.width} × {ir.height}</dd>
        <dt>{$tr('info.date')}</dt>
        <dd>{formatSavedAt(info.savedAt)}</dd>
        {#if info.model || info.producer}
          <dt>{$tr('info.camera')}</dt>
          <dd>{[info.producer, info.model].filter(Boolean).join(' ')}</dd>
        {/if}
        <dt>{$tr('info.range')}</dt>
        <dd>{formatNumber(range.min, $locale, 0)} … {formatNumber(range.max, $locale, 0)} °C</dd>
        <dt>{$tr('info.frameMax')}</dt>
        <dd>{fmt(model.toCelsius(extremes.max.ad))}</dd>
        <dt>{$tr('info.frameMin')}</dt>
        <dd>{fmt(model.toCelsius(extremes.min.ad))}</dd>
      </dl>
    </section>
  </aside>

  <section class="image-area">
    <div class="toolbar">
      <button type="button" onclick={() => zoomTo(zoom / ZOOM_STEP)} title={$tr('view.zoomOut')}>−</button>
      <span class="zoom">{Math.round(zoom * 100)} %</span>
      <button type="button" onclick={() => zoomTo(zoom * ZOOM_STEP)} title={$tr('view.zoomIn')}>+</button>
      <button type="button" onclick={() => (autoFit = true)}>{$tr('view.fit')}</button>
      <button type="button" onclick={() => zoomTo(1)}>{$tr('view.actual')}</button>
      <span class="muted hint">{$tr('view.hint')}</span>
    </div>
    <div class="stage">
      <!-- Полотно з власною клавіатурною взаємодією (+/−/0, стрілки): role="application" свідомо -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        class="viewport"
        bind:this={viewport}
        bind:clientWidth={viewWidth}
        bind:clientHeight={viewHeight}
        role="application"
        aria-label={$tr('view.image')}
        tabindex="0"
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerUp}
        onpointerleave={() => (hover = null)}
        onkeydown={onKeyDown}
      >
        <canvas
          bind:this={canvas}
          width={ir.width}
          height={ir.height}
          style:left="{panX}px"
          style:top="{panY}px"
          style:width="{ir.width * zoom}px"
          style:height="{ir.height * zoom}px"
        ></canvas>
        {#if showExtremes}
          <svg class="overlay" aria-hidden="true">
            {#each markers as m (m.kind)}
              <g class="marker {m.kind}" transform="translate({m.cx} {m.cy})">
                <circle r="7" />
                <path d="M -11 0 H -4 M 4 0 H 11 M 0 -11 V -4 M 0 4 V 11" />
                <text x="12" y="-8">{m.label}</text>
              </g>
            {/each}
          </svg>
        {/if}
      </div>
      <ColorBar {paletteId} maxLabel={fmt(scaleLabels.max)} minLabel={fmt(scaleLabels.min)} />
    </div>
  </section>
</div>

<style>
  .viewer {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 16px;
    height: 100%;
    min-height: 0;
  }
  .controls {
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
    min-height: 0;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.9rem;
  }
  fieldset {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 10px 10px;
    margin: 0;
  }
  legend {
    font-size: 0.9rem;
    padding: 0 4px;
  }
  .segmented {
    display: flex;
    gap: 16px;
  }
  .limits {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 8px;
  }
  .limits input {
    width: 100%;
    box-sizing: border-box;
  }
  .check {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 0.9rem;
  }
  .readout .temp {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .temp.flag {
    color: var(--warn);
  }
  .readout p {
    margin: 2px 0;
  }
  .warning {
    margin: 4px 0 0;
    color: var(--warn);
    font-size: 0.85rem;
  }
  .muted {
    color: var(--muted);
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
  .image-area {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    min-width: 0;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .toolbar button {
    min-width: 2rem;
  }
  .zoom {
    min-width: 4.5em;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .hint {
    margin-left: auto;
    font-size: 0.8rem;
  }
  .stage {
    flex: 1;
    display: flex;
    gap: 10px;
    min-height: 0;
  }
  .viewport {
    position: relative;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    background: var(--stage);
    border-radius: 6px;
    cursor: crosshair;
    touch-action: none;
    user-select: none;
  }
  .viewport:focus-visible {
    outline: 2px solid var(--accent);
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
  }
  .marker.max circle,
  .marker.max path {
    stroke: #fff;
  }
  .marker.min circle,
  .marker.min path {
    stroke: #0ff;
  }
  .marker text {
    fill: #fff;
    font-size: 12px;
    paint-order: stroke;
    stroke: #000;
    stroke-width: 3px;
  }

  @media (max-width: 720px) {
    .viewer {
      grid-template-columns: 1fr;
      grid-template-rows: auto auto;
      height: auto;
    }
    .image-area {
      order: -1;
    }
    .stage {
      height: 60vh;
      flex: none;
    }
    .hint {
      display: none;
    }
  }
</style>
