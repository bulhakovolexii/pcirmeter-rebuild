<script lang="ts">
  import { untrack } from 'svelte'
  import { DEFAULT_PALETTE, PALETTE_IDS, palette, type PaletteId } from '../core/palettes'
  import { isValidIsotherm, paintIsotherms } from '../core/isotherms'
  import {
    autoDisplayScale,
    frameExtremes,
    manualDisplayScale,
    paletteHistogram,
    renderFrame,
  } from '../core/render'
  import {
    autoScale,
    frameTemperatures,
    measurementRange,
    objectParams,
    temperatureModel,
    type ObjectParams,
  } from '../core/temperature'
  import { fromCelsius, toCelsius } from '../core/units'
  import { locale, tr } from '../i18n'
  import { audioType, decodeUserText } from './attachments'
  import ColorBar from './ColorBar.svelte'
  import DistributionChart from './DistributionChart.svelte'
  import type { OpenedFile } from './files'
  import {
    formatNumber,
    formatSavedAt,
    formatTemperature,
    TEMPERATURE_SYMBOL,
    temperatureStatus,
  } from './format'
  import HelpTip from './HelpTip.svelte'
  import Histogram from './Histogram.svelte'
  import IsothermPanel from './IsothermPanel.svelte'
  import { defaultIsotherms, isothermBand, toIsotherm, type IsothermState } from './isotherms'
  import type { Units } from './params'
  import ParamsPanel from './ParamsPanel.svelte'
  import { NO_ALIGNMENT, type Alignment } from './photo'
  import PhotoPanel from './PhotoPanel.svelte'
  import ProfileChart from './ProfileChart.svelte'
  import ResultsTable from './ResultsTable.svelte'
  import {
    areaDistribution,
    distributionCsv,
    lineProfile,
    measureObjects,
    profileCsv,
    resultsCsv,
  } from './results'
  import {
    clampPhotoSplit,
    clampSidebarWidth,
    PHOTO_SPLIT,
    photoSplit,
    SIDEBAR,
    sidebarWidth,
    units,
  } from './settings'
  import Splitter from './Splitter.svelte'
  import {
    dragShape,
    drawingHandle,
    framePixel,
    hitTest,
    isDegenerate,
    newShape,
    nextName,
    type Handle,
    type Hit,
    type MeasureObject,
    type ShapeKind,
  } from './tools'
  import { fitView, ZOOM_STEP, zoomAt } from './view'

  interface Props {
    file: OpenedFile
  }

  let { file }: Props = $props()

  const ir = $derived(file.thermogram.ir)
  const info = $derived(file.thermogram.info)

  // Вкладення (docs/spec/features.md §2.6)
  const photo = $derived(file.thermogram.visibleJpeg)
  let showPhoto = $state(true)
  /** Суміщення й синхронізація живуть тут, щоб не губитися, коли панель фото сховано. */
  let alignment = $state<Alignment>(NO_ALIGNMENT)
  let syncPhoto = $state(true)
  const note = $derived(file.thermogram.userText ? decodeUserText(file.thermogram.userText) : '')
  const audio = $derived(file.thermogram.audio)
  const audioMime = $derived(audio ? audioType(audio) : '')
  let audioUrl = $state<string | undefined>()
  $effect(() => {
    if (!audio) return
    const u = URL.createObjectURL(new Blob([audio as Uint8Array<ArrayBuffer>], { type: audioMime }))
    audioUrl = u
    return () => URL.revokeObjectURL(u)
  })

  // Параметри кадру: модель отримує лише змінені користувачем значення, решта — з файлу
  const fileParams = $derived(objectParams(ir.params))
  let overrides = $state<Partial<ObjectParams>>({})
  const params = $derived({ ...fileParams, ...overrides })
  const model = $derived(temperatureModel(ir, overrides))

  const auto = $derived(autoScale(ir, model))
  const range = $derived(measurementRange(ir.params.tempRange))
  const extremes = $derived(frameExtremes(ir))

  let paletteId = $state<PaletteId>(DEFAULT_PALETTE)
  let scaleMode = $state<'auto' | 'manual'>('auto')
  // Межі ручної шкали — у °C (не залежать від одиниць і параметрів); поля — в одиницях показу
  let manualLimits = $state({ min: 0, max: 0 })
  let scaleInput = $state<{ min: number | null; max: number | null }>({ min: 0, max: 0 })
  let showExtremes = $state(true)

  const showTemp = (celsius: number, u: Units) => Math.round(fromCelsius(celsius, u.temperature) * 10) / 10

  const manualValid = $derived(
    Number.isFinite(scaleInput.min) && Number.isFinite(scaleInput.max) && manualLimits.min < manualLimits.max,
  )
  const manual = $derived(scaleMode === 'manual' && manualValid)
  const scale = $derived(
    manual ? manualDisplayScale(ir, model, manualLimits.min, manualLimits.max) : autoDisplayScale(ir),
  )
  const scaleLabels = $derived(manual ? manualLimits : auto)

  function setScaleMode(mode: 'auto' | 'manual') {
    // Ручна шкала стартує з меж автошкали, округлених до 0,1 в одиницях показу
    if (mode === 'manual' && scaleMode === 'auto') {
      scaleInput = { min: showTemp(auto.min, $units), max: showTemp(auto.max, $units) }
      manualLimits = {
        min: toCelsius(scaleInput.min!, $units.temperature),
        max: toCelsius(scaleInput.max!, $units.temperature),
      }
    }
    scaleMode = mode
  }

  function setScaleLimit(which: 'min' | 'max', input: number) {
    if (Number.isFinite(input)) manualLimits[which] = toCelsius(input, $units.temperature)
  }

  // Зміна одиниць — лише перерахунок полів; модель і межі шкали не змінюються
  $effect(() => {
    const u = $units
    untrack(() => {
      scaleInput = { min: showTemp(manualLimits.min, u), max: showTemp(manualLimits.max, u) }
    })
  })

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
    ;({ zoom, panX, panY } = fitView(ir.width, ir.height, viewWidth, viewHeight))
  })

  function zoomTo(next: number, cx = viewWidth / 2, cy = viewHeight / 2) {
    ;({ zoom, panX, panY } = zoomAt({ zoom, panX, panY }, next, cx, cy))
    autoFit = false
  }

  // Ізотерми (docs/spec/features.md §2.5): межі — °C, стартові — від автошкали файлу
  let isotherms = $state<IsothermState[]>(untrack(() => defaultIsotherms(auto)))
  const temps = $derived(frameTemperatures(ir, model))
  const shownIsotherms = $derived(
    isotherms.map((s) => (s.enabled && isValidIsotherm(toIsotherm(s)) ? toIsotherm(s) : null)),
  )

  /** Кадр у кольорах палітри з ізотермами і частка кадру в межах кожної ізотерми. */
  const frame = $derived.by(() => {
    const rgba = renderFrame(ir.ad, palette(paletteId), scale)
    const active = shownIsotherms.filter((i) => i !== null)
    const counts = paintIsotherms(temps, rgba, active)
    let k = 0
    const shares = shownIsotherms.map((i) => (i === null ? null : counts[k++]! / ir.ad.length))
    return { rgba, shares }
  })

  const histogram = $derived(paletteHistogram(ir.ad, scale))
  /** Смуги ізотерм на шкалі й гістограмі: ізотерма 1 — останньою (поверх). */
  const bands = $derived(
    isotherms
      .flatMap((s, k) => {
        const band = shownIsotherms[k] ? isothermBand(s, scaleLabels) : null
        return band ? [{ ...band, color: s.color }] : []
      })
      .reverse(),
  )

  let canvas: HTMLCanvasElement | undefined = $state()

  $effect(() => {
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.putImageData(new ImageData(frame.rgba, ir.width, ir.height), 0, 0)
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

  // Об'єкти аналізу (docs/spec/features.md §2.4)
  /** Допуск попадання в об'єкт, екранних пікселів. */
  const HIT_PX = 6
  let tool = $state<'select' | ShapeKind>('select')
  /** Довідка під «?»: дії кожного інструмента, вид і клавіші. */
  const help = $derived([
    ...(['select', 'point', 'rect', 'line'] as const).map(
      (t) => `${$tr(`tools.${t}`)}: ${$tr(`tools.hint.${t}`)}`,
    ),
    $tr('view.hint'),
    $tr('tools.keys'),
  ])
  let objects = $state<MeasureObject[]>([])
  let selectedId = $state<number | null>(null)
  let nextId = 1
  const selected = $derived(objects.find((o) => o.id === selectedId) ?? null)
  const results = $derived(measureObjects(ir, objects, overrides))
  const selectedResult = $derived(results.find((r) => r.object.id === selectedId) ?? null)

  function updateObject(id: number, patch: Partial<MeasureObject>) {
    objects = objects.map((o) => (o.id === id ? { ...o, ...patch } : o))
  }

  function deleteSelected() {
    objects = objects.filter((o) => o.id !== selectedId)
    selectedId = null
  }

  function deleteAll() {
    objects = []
    selectedId = null
  }

  function selectTool(next: 'select' | ShapeKind) {
    tool = next
    viewport?.focus()
  }

  // Профіль — лише для вибраної лінії, розподіл температур — лише для вибраного прямокутника
  const profileObject = $derived(selected?.shape.kind === 'line' ? selected : undefined)
  const profile = $derived(profileObject ? lineProfile(ir, profileObject, overrides) : [])
  let profileHover = $state<number | null>(null)
  const profileMarker = $derived(
    profileHover !== null && profileHover < profile.length ? profile[profileHover]! : null,
  )

  const distributionObject = $derived(selected?.shape.kind === 'rect' ? selected : undefined)
  const distribution = $derived(distributionObject ? areaDistribution(ir, distributionObject, overrides) : [])

  function download(href: string, suffix: string) {
    const a = document.createElement('a')
    a.href = href
    a.download = `${file.name.replace(/\.[^.]+$/, '')}_${suffix}`
    a.click()
  }

  function downloadCsv(csv: string, suffix: string) {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    download(url, `${suffix}.csv`)
    URL.revokeObjectURL(url)
  }

  function exportCsv() {
    downloadCsv(resultsCsv(results, $locale, $units, $tr), 'results')
  }

  function exportProfile() {
    if (profileObject) {
      downloadCsv(profileCsv(profile, $locale, $units.temperature, $tr), `profile_${profileObject.name}`)
    }
  }

  function exportDistribution() {
    if (distributionObject) {
      downloadCsv(
        distributionCsv(distribution, $locale, $units.temperature, $tr),
        `distribution_${distributionObject.name}`,
      )
    }
  }

  /** Зсув перетягуванням або редагування об'єкта: `start` — фігура на початку перетягування. */
  let drag: { x: number; y: number; panX: number; panY: number } | null = null
  let edit: {
    id: number
    handle: Handle
    from: [number, number]
    start: MeasureObject['shape']
    creating: boolean
  } | null = null
  let hover: { x: number; y: number } | null = $state(null)
  let hoverHit = $state<Hit | null>(null)

  /** Неперервні координати кадру під курсором. */
  function framePoint(e: PointerEvent): [number, number] {
    const rect = viewport!.getBoundingClientRect()
    return [(e.clientX - rect.left - panX) / zoom, (e.clientY - rect.top - panY) / zoom]
  }

  function updateHover(e: PointerEvent) {
    const [fx, fy] = framePoint(e)
    const x = Math.floor(fx)
    const y = Math.floor(fy)
    hover = x >= 0 && y >= 0 && x < ir.width && y < ir.height ? { x, y } : null
    hoverHit =
      tool === 'select' && !drag && !edit ? hitTest(objects, fx, fy, HIT_PX / zoom, selectedId) : null
  }

  function startPan(e: PointerEvent) {
    drag = { x: e.clientX, y: e.clientY, panX, panY }
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 && e.button !== 1) return
    viewport!.setPointerCapture(e.pointerId)
    // Середня кнопка — зсув у будь-якому режимі
    if (e.button === 1) {
      e.preventDefault()
      startPan(e)
      return
    }
    const [fx, fy] = framePoint(e)
    if (tool === 'select') {
      const hit = hitTest(objects, fx, fy, HIT_PX / zoom, selectedId)
      if (hit) {
        selectedId = hit.id
        const shape = objects.find((o) => o.id === hit.id)!.shape
        edit = {
          id: hit.id,
          handle: hit.handle,
          from: framePixel(fx, fy, ir.width, ir.height),
          start: shape,
          creating: false,
        }
      } else {
        selectedId = null
        startPan(e)
      }
      return
    }
    if (fx < 0 || fy < 0 || fx >= ir.width || fy >= ir.height) {
      startPan(e)
      return
    }
    const px = framePixel(fx, fy, ir.width, ir.height)
    const object: MeasureObject = {
      id: nextId++,
      name: nextName(objects, tool),
      shape: newShape(tool, px),
      overrides: {},
    }
    objects = [...objects, object]
    selectedId = object.id
    edit = { id: object.id, handle: drawingHandle(tool), from: px, start: object.shape, creating: true }
  }

  function onPointerMove(e: PointerEvent) {
    if (edit) {
      const [fx, fy] = framePoint(e)
      const to = framePixel(fx, fy, ir.width, ir.height)
      updateObject(edit.id, { shape: dragShape(edit.start, edit.handle, edit.from, to, ir.width, ir.height) })
    } else if (drag) {
      panX = drag.panX + e.clientX - drag.x
      panY = drag.panY + e.clientY - drag.y
      autoFit = false
    }
    updateHover(e)
  }

  function onPointerUp(e: PointerEvent) {
    // Клік без перетягування в режимі прямокутника/лінії нічого не додає
    if (edit?.creating) {
      const id = edit.id
      const created = objects.find((o) => o.id === id)
      if (created && isDegenerate(created.shape)) {
        objects = objects.filter((o) => o.id !== id)
        selectedId = null
      }
    }
    edit = null
    drag = null
    if (viewport!.hasPointerCapture(e.pointerId)) viewport!.releasePointerCapture(e.pointerId)
  }

  const CURSORS: Record<Handle, string> = {
    move: 'move',
    nw: 'nwse-resize',
    se: 'nwse-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    start: 'pointer',
    end: 'pointer',
  }
  const viewportCursor = $derived(hoverHit ? CURSORS[hoverHit.handle] : 'crosshair')

  function onKeyDown(e: KeyboardEvent) {
    const step = 40
    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        if (selectedId === null) return
        deleteSelected()
        break
      case 'Escape':
        selectedId = null
        tool = 'select'
        break
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
        label: `${kind === 'max' ? 'Max' : 'Min'} ${fmt(model.toCelsius(p.ad))}`,
      }
    }),
  )

  const fmt = (t: number) => formatTemperature(t, $locale, $units.temperature)

  /** Екранна точка центру пікселя кадру. */
  const sx = (x: number) => panX + (x + 0.5) * zoom
  const sy = (y: number) => panY + (y + 0.5) * zoom
  const pixelAt = (i: number) => ({ x: sx(i % ir.width), y: sy(Math.floor(i / ir.width)) })

  // Max/Min усередині прямокутників і ліній
  const objectMarkers = $derived(
    results.flatMap((r) =>
      r.object.shape.kind === 'point' || r.stats.maxAt < 0
        ? []
        : [
            { key: `${r.object.id}-max`, kind: 'max', ...pixelAt(r.stats.maxAt) },
            { key: `${r.object.id}-min`, kind: 'min', ...pixelAt(r.stats.minAt) },
          ],
    ),
  )

  // Розміри панелей (спільні для вкладок, див. settings.ts): ширина бічної панелі й частка ІЧ поруч із фото
  let viewerEl: HTMLDivElement | undefined = $state()
  let viewsWidth = $state(0)
  let dragFrom = 0

  const setSidebarWidth = (width: number) => sidebarWidth.set(clampSidebarWidth(width, viewerEl?.clientWidth))
  const setPhotoSplit = (share: number) => photoSplit.set(clampPhotoSplit(share))
</script>

<div class="viewer" bind:this={viewerEl} style:--sidebar-width="{$sidebarWidth}px">
  <aside class="controls">
    <section class="readout" aria-live="polite">
      <h2>{$tr('cursor.title')}</h2>
      <!-- Однакова висота з курсором і без — вміст панелі нижче не стрибає -->
      <p class="temp" class:flag={cursor && cursor.status !== 'ok'} class:muted={!cursor}>
        {cursor ? fmt(cursor.t) : '—'}
      </p>
      <p class="warning slot">
        {#if cursor?.status === 'out-of-range'}
          {$tr('cursor.outOfRange')}
        {:else if cursor?.status === 'no-calibration'}
          {$tr('cursor.noCalibration')}
        {/if}
      </p>
      <p class="muted">{$tr('cursor.pixel')}: {cursor ? `${cursor.x}, ${cursor.y}` : '—'}</p>
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
        <dd>
          {formatNumber(fromCelsius(range.min, $units.temperature), $locale, 0)} …
          {formatNumber(fromCelsius(range.max, $units.temperature), $locale, 0)}
          {TEMPERATURE_SYMBOL[$units.temperature]}
        </dd>
        <dt>{$tr('info.frameMax')}</dt>
        <dd>{fmt(model.toCelsius(extremes.max.ad))}</dd>
        <dt>{$tr('info.frameMin')}</dt>
        <dd>{fmt(model.toCelsius(extremes.min.ad))}</dd>
      </dl>
      {#if note}
        <h3>{$tr('info.note')}</h3>
        <p class="note-text">{note}</p>
      {/if}
    </section>

    <label class="check">
      <input type="checkbox" bind:checked={showExtremes} />
      {$tr('view.extremes')}
    </label>

    {#if audio}
      <section>
        <h2>{$tr('audio.title')}</h2>
        <audio controls src={audioUrl}></audio>
        <button
          type="button"
          disabled={!audioUrl}
          onclick={() =>
            audioUrl && download(audioUrl, audioMime === 'audio/wav' ? 'audio.wav' : 'audio.bin')}
          >{$tr('audio.save')}</button
        >
      </section>
    {/if}

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
            <span>{$tr('scale.max')}, {TEMPERATURE_SYMBOL[$units.temperature]}</span>
            <input
              type="number"
              step="0.1"
              bind:value={scaleInput.max}
              oninput={(e) => setScaleLimit('max', e.currentTarget.valueAsNumber)}
            />
          </label>
          <label class="field">
            <span>{$tr('scale.min')}, {TEMPERATURE_SYMBOL[$units.temperature]}</span>
            <input
              type="number"
              step="0.1"
              bind:value={scaleInput.min}
              oninput={(e) => setScaleLimit('min', e.currentTarget.valueAsNumber)}
            />
          </label>
        </div>
        {#if !manualValid}
          <p class="warning" role="alert">{$tr('scale.invalid')}</p>
        {/if}
      {/if}
      <Histogram
        bins={histogram}
        rgb={palette(paletteId)}
        {bands}
        minLabel={fmt(scaleLabels.min)}
        maxLabel={fmt(scaleLabels.max)}
      />
    </fieldset>

    <fieldset class="isotherms">
      <legend>{$tr('isotherm.section')}</legend>
      {#each isotherms as iso, k (k)}
        <IsothermPanel
          index={k + 1}
          value={iso}
          onchange={(v) => (isotherms[k] = v)}
          share={frame.shares[k] ?? null}
        />
      {/each}
      {#if isotherms.every((i) => i.enabled)}
        <p class="note">{$tr('isotherm.priority')}</p>
      {/if}
    </fieldset>

    <ParamsPanel
      title={$tr('params.title')}
      base={fileParams}
      {overrides}
      onchange={(o) => (overrides = o)}
      baseLabel={$tr('params.fromFile')}
      resetLabel={$tr('params.reset')}
      tau={model.tau}
    />

    {#if selected && selectedResult}
      {#key selected.id}
        <ParamsPanel
          title="{$tr('objectParams.title')} {selected.name}"
          base={params}
          overrides={selected.overrides}
          onchange={(o) => updateObject(selected.id, { overrides: o })}
          baseLabel={$tr('objectParams.inherit')}
          resetLabel={$tr('objectParams.reset')}
          tau={temperatureModel(ir, { ...overrides, ...selected.overrides }).tau}
        />
      {/key}
    {/if}
  </aside>

  <Splitter
    label={$tr('view.sidebarWidth')}
    valuenow={$sidebarWidth}
    valuemin={SIDEBAR.min}
    valuemax={SIDEBAR.max}
    onstart={() => (dragFrom = $sidebarWidth)}
    ondrag={(dx) => setSidebarWidth(dragFrom + dx)}
    onstep={(n) => setSidebarWidth($sidebarWidth + 16 * n)}
    onreset={() => setSidebarWidth(SIDEBAR.default)}
  />

  <section class="image-area">
    <div class="toolbar">
      <div class="tools" role="radiogroup" aria-label={$tr('tools.title')}>
        {#each ['select', 'point', 'rect', 'line'] as const as t (t)}
          <button
            type="button"
            role="radio"
            aria-checked={tool === t}
            class:active={tool === t}
            onclick={() => selectTool(t)}
          >
            {$tr(`tools.${t}`)}
          </button>
        {/each}
      </div>
      <button type="button" disabled={selectedId === null} onclick={deleteSelected}
        >{$tr('tools.deleteSelected')}</button
      >
      <button type="button" disabled={objects.length === 0} onclick={deleteAll}
        >{$tr('tools.deleteAll')}</button
      >
      {#if photo}
        <label class="check">
          <input type="checkbox" bind:checked={showPhoto} />
          {$tr('photo.show')}
        </label>
      {/if}
      <span class="sep"></span>
      <button type="button" onclick={() => zoomTo(zoom / ZOOM_STEP)} title={$tr('view.zoomOut')}>−</button>
      <span class="zoom">{Math.round(zoom * 100)} %</span>
      <button type="button" onclick={() => zoomTo(zoom * ZOOM_STEP)} title={$tr('view.zoomIn')}>+</button>
      <button type="button" onclick={() => (autoFit = true)}>{$tr('view.fit')}</button>
      <button type="button" onclick={() => zoomTo(1)}>{$tr('view.actual')}</button>
      <HelpTip label={$tr('view.help')} items={help} align="right" />
    </div>
    <div class="views" bind:clientWidth={viewsWidth} style:--ir-share={photo && showPhoto ? $photoSplit : 1}>
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
          onmousedown={(e) => {
            // Середня кнопка — зсув, а не автопрокрутка браузера
            if (e.button === 1) e.preventDefault()
          }}
          onpointermove={onPointerMove}
          onpointerup={onPointerUp}
          onpointercancel={onPointerUp}
          onpointerleave={() => (hover = null)}
          onkeydown={onKeyDown}
          style:cursor={viewportCursor}
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
          <svg class="overlay" aria-hidden="true">
            {#each objects as o (o.id)}
              {@const sh = o.shape}
              {@const sel = o.id === selectedId}
              <g class="object" class:selected={sel}>
                {#if sh.kind === 'point'}
                  <path class="shape" d="M {sx(sh.x) - 6} {sy(sh.y) - 6} l 12 12 m 0 -12 l -12 12" />
                  <text x={sx(sh.x) + 8} y={sy(sh.y) + 14}>{o.name}</text>
                {:else if sh.kind === 'rect'}
                  {@const x = panX + sh.x0 * zoom}
                  {@const y = panY + sh.y0 * zoom}
                  {@const w = (sh.x1 - sh.x0 + 1) * zoom}
                  {@const h = (sh.y1 - sh.y0 + 1) * zoom}
                  <rect class="shape" {x} {y} width={w} height={h} />
                  <text x={x + 4} y={y + 14}>{o.name}</text>
                  {#if sel}
                    {#each [[x, y], [x + w, y], [x, y + h], [x + w, y + h]] as [hx, hy], i (i)}
                      <rect class="handle" x={hx! - 4} y={hy! - 4} width="8" height="8" />
                    {/each}
                  {/if}
                {:else}
                  <line class="shape" x1={sx(sh.x0)} y1={sy(sh.y0)} x2={sx(sh.x1)} y2={sy(sh.y1)} />
                  <text x={sx(sh.x0) + 6} y={sy(sh.y0) - 6}>{o.name}</text>
                  {#if sel}
                    {#each [[sx(sh.x0), sy(sh.y0)], [sx(sh.x1), sy(sh.y1)]] as [hx, hy], i (i)}
                      <rect class="handle" x={hx! - 4} y={hy! - 4} width="8" height="8" />
                    {/each}
                  {/if}
                {/if}
              </g>
            {/each}
            {#each objectMarkers as m (m.key)}
              <g class="marker small {m.kind}" transform="translate({m.x} {m.y})">
                <path d="M -6 0 H 6 M 0 -6 V 6" />
              </g>
            {/each}
            {#if profileMarker}
              <rect
                class="profile-marker"
                x={panX + profileMarker.x * zoom - 3}
                y={panY + profileMarker.y * zoom - 3}
                width={zoom + 6}
                height={zoom + 6}
              />
            {/if}
            {#if showExtremes}
              {#each markers as m (m.kind)}
                <g class="marker {m.kind}" transform="translate({m.cx} {m.cy})">
                  <circle r="7" />
                  <path d="M -11 0 H -4 M 4 0 H 11 M 0 -11 V -4 M 0 4 V 11" />
                  <text x="12" y="-8">{m.label}</text>
                </g>
              {/each}
            {/if}
          </svg>
        </div>
        <ColorBar {paletteId} maxLabel={fmt(scaleLabels.max)} minLabel={fmt(scaleLabels.min)} {bands} />
      </div>
      {#if photo && showPhoto}
        <Splitter
          label={$tr('view.photoSplit')}
          valuenow={$photoSplit * 100}
          valuemin={PHOTO_SPLIT.min * 100}
          valuemax={PHOTO_SPLIT.max * 100}
          onstart={() => (dragFrom = $photoSplit)}
          ondrag={(dx) => setPhotoSplit(dragFrom + dx / Math.max(1, viewsWidth))}
          onstep={(n) => setPhotoSplit($photoSplit + 0.025 * n)}
          onreset={() => setPhotoSplit(PHOTO_SPLIT.default)}
        />
        <PhotoPanel
          {photo}
          frame={frame.rgba}
          frameWidth={ir.width}
          frameHeight={ir.height}
          id={file.id}
          irView={{ zoom, panX, panY }}
          onirview={(v) => {
            ;({ zoom, panX, panY } = v)
            autoFit = false
          }}
          onirfit={() => (autoFit = true)}
          {alignment}
          onalign={(a) => (alignment = a)}
          sync={syncPhoto}
          onsync={(v) => (syncPhoto = v)}
          onclose={() => (showPhoto = false)}
        />
      {/if}
    </div>

    <div class="bottom">
      <ResultsTable {results} {selectedId} onselect={(id) => (selectedId = id)} onexport={exportCsv} />
      {#if profileObject}
        <ProfileChart
          name={profileObject.name}
          points={profile}
          hoverIndex={profileHover}
          onhover={(k) => (profileHover = k)}
          onexport={exportProfile}
        />
      {/if}
      {#if distributionObject}
        <DistributionChart
          name={distributionObject.name}
          bins={distribution}
          rgb={palette(paletteId)}
          onexport={exportDistribution}
        />
      {/if}
    </div>
  </section>
</div>

<style>
  .viewer {
    display: grid;
    /* min(): після звуження вікна панель не займає більше половини, навіть якщо збережено ширше */
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
    border-radius: 8px;
    background: var(--surface);
    padding: 8px 10px 10px;
    margin: 0;
  }
  .isotherms {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  legend {
    font-size: 0.9rem;
    font-weight: 600;
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
  .note {
    margin: 4px 0 0;
    font-size: 0.8rem;
    color: var(--muted);
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
  .readout .slot {
    min-height: 1lh;
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
  .tools {
    display: flex;
  }
  .tools button {
    border-radius: 0;
    margin-left: -1px;
  }
  .tools button:first-child {
    border-radius: 7px 0 0 7px;
    margin-left: 0;
  }
  .tools button:last-child {
    border-radius: 0 7px 7px 0;
  }
  .tools button.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    font-weight: 600;
    position: relative;
  }
  .sep {
    flex: 1;
  }
  .views {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  /* ІЧ і фото ділять ширину в пропорції --ir-share (межу між ними тягнуть) */
  .views > .stage {
    flex: var(--ir-share) 1 0;
    min-width: 0;
  }
  .views > :global(:last-child:not(.stage)) {
    flex: calc(1 - var(--ir-share)) 1 0;
    min-width: 0;
  }
  .stage {
    display: flex;
    gap: 10px;
    min-height: 0;
  }
  h3 {
    margin: 8px 0 2px;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--muted);
  }
  .note-text {
    margin: 0;
    font-size: 0.85rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  audio {
    width: 100%;
    margin-bottom: 6px;
  }
  .viewport {
    position: relative;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    background: var(--stage);
    border-radius: 8px;
    cursor: crosshair;
    touch-action: none;
    user-select: none;
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
  .profile-marker {
    fill: none;
    stroke: #fff;
    stroke-width: 2;
    filter: drop-shadow(0 0 1px #000);
  }
  /* Висоту задає таблиця результатів (стала) — нижня смуга не стискається й не росте */
  .bottom {
    display: flex;
    gap: 12px;
    flex-shrink: 0;
  }
  .bottom > :global(*) {
    flex: 1 1 0;
    min-width: 0;
  }
  .marker.small path {
    stroke-width: 1.5;
  }
  .object .shape {
    fill: none;
    stroke: #a6ff4d;
    stroke-width: 1.5;
    filter: drop-shadow(0 0 1px #000);
  }
  .object.selected .shape {
    stroke: #ffd60a;
    stroke-width: 2.5;
  }
  .object .handle {
    fill: #ffd60a;
    stroke: #000;
    stroke-width: 1;
  }
  .object text,
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
      gap: 16px;
      height: auto;
    }
    .image-area {
      order: -1;
    }
    .views {
      flex-direction: column;
      flex: none;
    }
    .views > .stage,
    .views > :global(:last-child:not(.stage)) {
      height: 60vh;
      flex: none;
    }
    .bottom {
      flex-direction: column;
    }
  }
</style>
