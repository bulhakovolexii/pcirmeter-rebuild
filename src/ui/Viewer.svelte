<script lang="ts">
  import { untrack } from 'svelte'
  import { DEFAULT_PALETTE, PALETTE_IDS, palette, type PaletteId } from '../core/palettes'
  import { isValidIsotherm, paintIsotherms } from '../core/isotherms'
  import {
    autoDisplayScale,
    frameExtremes,
    manualDisplayScale,
    paletteBinAds,
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
  import type { FileMarkup, OpenedFile } from './files'
  import {
    formatNumber,
    formatSavedAt,
    formatTemperature,
    TEMPERATURE_SYMBOL,
    temperatureStatus,
  } from './format'
  import HelpTip from './HelpTip.svelte'
  import { Button } from '$lib/components/ui/button'
  import * as ButtonGroup from '$lib/components/ui/button-group'
  import * as Accordion from '$lib/components/ui/accordion'
  import MinusIcon from '@lucide/svelte/icons/minus'
  import PlusIcon from '@lucide/svelte/icons/plus'
  import { Checkbox } from '$lib/components/ui/checkbox'
  import { Input } from '$lib/components/ui/input'
  import * as RadioGroup from '$lib/components/ui/radio-group'
  import * as ToggleGroup from '$lib/components/ui/toggle-group'
  import SelectField from './SelectField.svelte'
  import Histogram from './Histogram.svelte'
  import IsothermPanel from './IsothermPanel.svelte'
  import { defaultIsotherms, isothermBand, toIsotherm, type IsothermState } from './isotherms'
  import type { Units } from './params'
  import ParamsPanel from './ParamsPanel.svelte'
  import { NO_ALIGNMENT, type Alignment } from './photo'
  import PhotoPanel from './PhotoPanel.svelte'
  import ProfileChart from './ProfileChart.svelte'
  import { registerReportSource } from './report'
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
    BOTTOM,
    bottomHeight,
    clampBottomHeight,
    clampHistogramHeight,
    clampPhotoSplit,
    clampSidebarWidth,
    HISTOGRAM,
    histogramHeight,
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
  import { fitView, wheelFactor, ZOOM_STEP, zoomAt, type Insets } from './view'

  interface Props {
    file: OpenedFile
    /** Зміна параметрів кадру чи об'єктів — для збереження в сеансі вкладки. */
    onmarkup?: (markup: FileMarkup) => void
  }

  let { file, onmarkup }: Props = $props()

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
  let overrides = $state<Partial<ObjectParams>>(untrack(() => file.markup?.overrides ?? {}))
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
  /** Розгорнуті блоки бічної панелі (спершу — усі). */
  let openSections = $state(['scale', 'isotherms', 'params', 'object'])

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
  /** Висота смуги масштабу над кадром: кадр вписується нижче за неї (відступ смуги 6 px зверху й знизу). */
  let barHeight = $state(0)
  const insets: Insets = $derived({ top: barHeight > 0 ? barHeight + 12 : 0, bottom: 0 })

  $effect(() => {
    if (!autoFit || viewWidth === 0 || viewHeight === 0) return
    ;({ zoom, panX, panY } = fitView(ir.width, ir.height, viewWidth, viewHeight, insets))
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
      zoomTo(zoom * wheelFactor(e), e.clientX - rect.left, e.clientY - rect.top)
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
    ...(['select', 'point', 'rect', 'line'] as const).map((t) => {
      const hint = $tr(`tools.hint.${t}`)
      return `${$tr(`tools.${t}`)}: ${hint.charAt(0).toLocaleLowerCase()}${hint.slice(1)}`
    }),
    $tr('view.hint'),
    $tr('tools.keys'),
  ])
  let objects = $state<MeasureObject[]>(untrack(() => file.markup?.objects ?? []))
  let selectedId = $state<number | null>(null)
  let nextId = untrack(() => Math.max(0, ...objects.map((o) => o.id)) + 1)
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
      const cx = panX + (p.x + 0.5) * zoom
      const cy = panY + (p.y + 0.5) * zoom
      const label = `${kind === 'max' ? 'Max' : 'Min'} ${fmt(model.toCelsius(p.ad))}`
      // Підпис праворуч угорі від маркера; біля правого краю — ліворуч, під смугою масштабу чи біля верхнього
      // краю — знизу (як у звіті, figures.ts); ширина — оцінка для шрифту 12 px
      const left = cx + 12 + label.length * 7 > viewWidth
      const below = cy - 20 < insets.top
      return { kind, cx, cy, label, lx: left ? -12 : 12, ly: below ? 20 : -8, anchor: left ? 'end' : 'start' }
    }),
  )

  const fmt = (t: number) => formatTemperature(t, $locale, $units.temperature)

  /** Температури стовпця гістограми: крайні — «≤» / «≥» межі шкали, решта — діапазон (або одне значення). */
  function binLabel(index: number): string | null {
    const { lo, hi } = paletteBinAds(index, scale)
    if (lo > hi) return null
    if (lo === -Infinity) return `≤ ${fmt(model.toCelsius(hi))}`
    if (hi === Infinity) return `≥ ${fmt(model.toCelsius(lo))}`
    const [from, to] = [model.toCelsius(lo), model.toCelsius(hi)]
    const [a, b] = [fmt(from), fmt(to)]
    if (a === b) return a
    // Одиниця — лише в кінці діапазону
    const num = formatNumber(fromCelsius(from, $units.temperature), $locale, 1)
    return Number.isNaN(from) || Number.isNaN(to) ? `${a} … ${b}` : `${num} … ${b}`
  }

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

  // Знімок того, що бачить користувач, — для PDF-звіту (читається в момент створення звіту)
  $effect(() =>
    registerReportSource(file.id, () => ({
      name: file.name,
      thermogram: file.thermogram,
      overrides: $state.snapshot(overrides),
      paletteId,
      scale,
      scaleLabels,
      manualScale: manual,
      isotherms: $state.snapshot(isotherms),
      objects: $state.snapshot(objects),
      showExtremes,
    })),
  )

  $effect(() => {
    const markup = { overrides: $state.snapshot(overrides), objects: $state.snapshot(objects) }
    untrack(() => onmarkup?.(markup))
  })

  // Розміри панелей (спільні для вкладок, див. settings.ts): ширина бічної панелі й частка ІЧ поруч із фото
  let viewerEl: HTMLDivElement | undefined = $state()
  let viewsWidth = $state(0)
  let dragFrom = 0

  const setSidebarWidth = (width: number) => sidebarWidth.set(clampSidebarWidth(width, viewerEl?.clientWidth))
  const setPhotoSplit = (share: number) => photoSplit.set(clampPhotoSplit(share))
  let areaHeight = $state(0)
  const setBottomHeight = (height: number) =>
    bottomHeight.set(clampBottomHeight(height, areaHeight || Infinity))
  const setHistogramHeight = (height: number) => histogramHeight.set(clampHistogramHeight(height))
  // Після зменшення вікна збережена висота смуги не витісняє зображення
  const shownBottomHeight = $derived(clampBottomHeight($bottomHeight, areaHeight || Infinity))
</script>

<div class="viewer" bind:this={viewerEl} style:--sidebar-width="{$sidebarWidth}px">
  <aside class="controls">
    <!-- «Під курсором» і «Файл» закріплені вгорі; прокручується решта панелі -->
    <div class="pinned">
      <section class="readout" aria-live="polite">
        <h2>{$tr('cursor.title')}</h2>
        <!-- Позначка «поза діапазоном» — праворуч у тому ж рядку: висота блока не змінюється, панель не стрибає -->
        <p class="temp" class:flag={cursor && cursor.status !== 'ok'} class:muted={!cursor}>
          <span>{cursor ? fmt(cursor.t) : '—'}</span>
          {#if cursor?.status === 'out-of-range'}
            <span class="status">{$tr('cursor.outOfRange')}</span>
          {:else if cursor?.status === 'no-calibration'}
            <span class="status">{$tr('cursor.noCalibration')}</span>
          {/if}
        </p>
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
        </dl>
        {#if note}
          <h3>{$tr('info.note')}</h3>
          <p class="note-text">{note}</p>
        {/if}
      </section>
    </div>

    <div class="scroll">
      {#if audio}
        <section>
          <h2>{$tr('audio.title')}</h2>
          <audio controls src={audioUrl}></audio>
          <Button
            variant="outline"
            disabled={!audioUrl}
            onclick={() =>
              audioUrl && download(audioUrl, audioMime === 'audio/wav' ? 'audio.wav' : 'audio.bin')}
            >{$tr('audio.save')}</Button
          >
        </section>
      {/if}

      <!-- Блоки панелі — shadcn Accordion: кожен можна згорнути -->
      <Accordion.Root type="multiple" bind:value={openSections}>
        <Accordion.Item value="scale">
          <Accordion.Trigger>{$tr('scale.title')}</Accordion.Trigger>
          <Accordion.Content>
            <RadioGroup.Root
              class="segmented"
              orientation="horizontal"
              aria-label={$tr('scale.title')}
              value={scaleMode}
              onValueChange={(v) => setScaleMode(v as 'auto' | 'manual')}
            >
              {#each ['auto', 'manual'] as const as m (m)}
                <label class="check">
                  <RadioGroup.Item value={m} />
                  {$tr(`scale.${m}`)}
                </label>
              {/each}
            </RadioGroup.Root>
            {#if scaleMode === 'manual'}
              <div class="limits">
                <label class="field">
                  <span>{$tr('scale.max')}, {TEMPERATURE_SYMBOL[$units.temperature]}</span>
                  <Input
                    type="number"
                    step="0.1"
                    bind:value={scaleInput.max}
                    oninput={(e) => setScaleLimit('max', e.currentTarget.valueAsNumber)}
                  />
                </label>
                <label class="field">
                  <span>{$tr('scale.min')}, {TEMPERATURE_SYMBOL[$units.temperature]}</span>
                  <Input
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
              {binLabel}
            />
            <!-- Нижня межа гістограми змінює її висоту -->
            <div class="histogram-resize">
              <Splitter
                label={$tr('histogram.height')}
                orientation="horizontal"
                valuenow={$histogramHeight}
                valuemin={HISTOGRAM.min}
                valuemax={HISTOGRAM.max}
                onstart={() => (dragFrom = $histogramHeight)}
                ondrag={(dy) => setHistogramHeight(dragFrom + dy)}
                onstep={(n) => setHistogramHeight($histogramHeight + 8 * n)}
                onreset={() => setHistogramHeight(HISTOGRAM.default)}
              />
            </div>
          </Accordion.Content>
        </Accordion.Item>

        <Accordion.Item value="isotherms">
          <Accordion.Trigger>{$tr('isotherm.section')}</Accordion.Trigger>
          <Accordion.Content class="isotherms">
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
          </Accordion.Content>
        </Accordion.Item>

        <ParamsPanel
          value="params"
          title={$tr('params.title')}
          base={fileParams}
          {overrides}
          onchange={(o) => (overrides = o)}
          baseLabel={$tr('params.fromFile')}
          resetLabel={$tr('params.reset')}
          tau={model.tau}
        >
          <div class="field">
            <label for="palette-{file.id}">{$tr('palette.title')}</label>
            <SelectField
              id="palette-{file.id}"
              class="w-full"
              bind:value={paletteId}
              options={PALETTE_IDS.map((id) => ({ value: id, label: $tr(`palette.${id}`) }))}
            />
          </div>
          <label class="check">
            <Checkbox bind:checked={showExtremes} />
            {$tr('view.extremes')}
          </label>
        </ParamsPanel>

        {#if selected && selectedResult}
          {#key selected.id}
            <ParamsPanel
              value="object"
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
      </Accordion.Root>
    </div>
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

  <section class="image-area" bind:clientHeight={areaHeight}>
    <div class="toolbar">
      <ToggleGroup.Root
        type="single"
        variant="outline"
        role="radiogroup"
        aria-label={$tr('tools.title')}
        value={tool}
        onValueChange={(v) => v && selectTool(v as typeof tool)}
      >
        {#each ['select', 'point', 'rect', 'line'] as const as t (t)}
          <ToggleGroup.Item value={t}>{$tr(`tools.${t}`)}</ToggleGroup.Item>
        {/each}
      </ToggleGroup.Root>
      <Button variant="outline" disabled={selectedId === null} onclick={deleteSelected}
        >{$tr('tools.deleteSelected')}</Button
      >
      <Button variant="outline" disabled={objects.length === 0} onclick={deleteAll}
        >{$tr('tools.deleteAll')}</Button
      >
      {#if photo}
        <label class="check">
          <Checkbox bind:checked={showPhoto} />
          {$tr('photo.show')}
        </label>
      {/if}
    </div>
    <div class="views" bind:clientWidth={viewsWidth} style:--ir-share={photo && showPhoto ? $photoSplit : 1}>
      <div class="stage">
        <div class="frame">
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
                    <text x={m.lx} y={m.ly} text-anchor={m.anchor}>{m.label}</text>
                  </g>
                {/each}
              {/if}
            </svg>
          </div>
          <!-- Масштаб і довідка — оверлеєм над кадром (як у видимого фото), щоб тулбар уміщався в один рядок -->
          <div class="float-bar top dark" bind:offsetHeight={barHeight}>
            <span></span>
            <div class="float-group">
              <ButtonGroup.Root aria-label={$tr('view.zoom')}>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onclick={() => zoomTo(zoom / ZOOM_STEP)}
                  title={$tr('view.zoomOut')}
                  aria-label={$tr('view.zoomOut')}><MinusIcon /></Button
                >
                <ButtonGroup.Text class="h-8 min-w-16 justify-center px-2 tabular-nums"
                  >{Math.round(zoom * 100)} %</ButtonGroup.Text
                >
                <Button
                  variant="outline"
                  size="icon-sm"
                  onclick={() => zoomTo(zoom * ZOOM_STEP)}
                  title={$tr('view.zoomIn')}
                  aria-label={$tr('view.zoomIn')}><PlusIcon /></Button
                >
              </ButtonGroup.Root>
              <ButtonGroup.Root>
                <Button variant="outline" size="sm" onclick={() => (autoFit = true)}>{$tr('view.fit')}</Button
                >
                <Button variant="outline" size="sm" onclick={() => zoomTo(1)}>{$tr('view.actual')}</Button>
              </ButtonGroup.Root>
              <HelpTip label={$tr('view.help')} items={help} align="right" />
            </div>
          </div>
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
          irView={{ zoom, panX, panY }}
          irViewSize={{ width: viewWidth, height: viewHeight, insets }}
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

    <Splitter
      label={$tr('view.bottomHeight')}
      orientation="horizontal"
      valuenow={shownBottomHeight}
      valuemin={BOTTOM.min}
      valuemax={BOTTOM.max}
      onstart={() => (dragFrom = shownBottomHeight)}
      ondrag={(dy) => setBottomHeight(dragFrom - dy)}
      onstep={(n) => setBottomHeight(shownBottomHeight - 16 * n)}
      onreset={() => setBottomHeight(BOTTOM.default)}
    />

    <div class="bottom" style:height="{shownBottomHeight}px">
      <ResultsTable
        {results}
        {selectedId}
        onselect={(id) => (selectedId = id)}
        onnote={(id, note) => updateObject(id, { note })}
        onexport={exportCsv}
      />
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
    min-height: 0;
  }
  .pinned,
  .scroll {
    display: flex;
    flex-direction: column;
    gap: 14px;
    /* Відступ від смуги прокрутки; місце під смугу зарезервоване в обох частинах — вони вирівняні,
       і вміст не зсувається, коли смуга з'являється */
    padding-right: 8px;
    scrollbar-gutter: stable;
  }
  .pinned {
    flex-shrink: 0;
    gap: 0;
    overflow: hidden;
    padding-bottom: 10px;
    margin-bottom: 10px;
    border-bottom: 1px solid var(--border);
  }
  /* Прокрутка й згортання (overflow) обрізають кільце фокуса (3 px) біля країв — запас 4 px усередині,
     компенсований від'ємним полем, щоб вміст не зсувався */
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    margin-left: -4px;
    padding-left: 4px;
  }
  .controls :global([data-slot='accordion-content']) {
    margin: -4px -4px 0;
  }
  .controls :global([data-slot='accordion-content'] > div) {
    padding-inline: 4px;
    padding-top: 4px;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 0.744rem;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.787rem;
  }
  /* Межа (12 px) — одразу під гістограмою */
  .histogram-resize {
    margin: 0 0 -12px;
  }
  .controls :global(.isotherms) {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .controls :global(.segmented) {
    display: flex;
    gap: 16px;
    margin-bottom: 6px;
  }
  .limits {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 8px;
  }
  .note {
    margin: 4px 0 0;
    font-size: 0.7rem;
    color: var(--muted);
  }
  .check {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 0.787rem;
  }
  .readout .temp {
    display: flex;
    align-items: center;
    gap: 8px;
    /* Нижній відступ — як у заголовків h2 */
    margin: 0 0 4px;
    font-size: 1.4rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .temp.flag {
    color: var(--warn);
  }
  /* До двох рядків дрібним шрифтом — не вищі за рядок температури */
  .temp .status {
    font-size: 0.656rem;
    font-weight: 400;
    line-height: 1.15;
    white-space: normal;
  }
  .warning {
    margin: 4px 0 0;
    color: var(--warn);
    font-size: 0.744rem;
  }
  .muted {
    color: var(--muted);
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
    margin: 0;
    font-size: 0.744rem;
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
  .frame {
    position: relative;
    flex: 1;
    display: flex;
    min-width: 0;
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
    font-size: 0.744rem;
    font-weight: 600;
    color: var(--muted);
  }
  .note-text {
    margin: 0;
    font-size: 0.744rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    /* Довга примітка не забирає місце в закріпленій частині панелі */
    max-height: 5lh;
    overflow-y: auto;
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
  /* Висоту задає межа над смугою (`bottomHeight`) — смуга не стискається й не росте разом із вікном */
  .bottom {
    display: flex;
    gap: 12px;
    flex-shrink: 0;
    min-height: 0;
  }
  /* Межа над смугою заходить у проміжки області — відстань між зображенням і смугою лишається ~12 px */
  .image-area > :global(.splitter) {
    margin: -8px 0;
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
</style>
