<script lang="ts">
  import { tr } from '../i18n'
  import HelpTip from './HelpTip.svelte'
  import {
    defaultPlacement,
    irViewFor,
    jpegSize,
    layerRect,
    moveAlignment,
    NO_ALIGNMENT,
    scaleAlignment,
    syncedPhotoView,
    type Alignment,
  } from './photo'
  import { fitView, ZOOM_STEP, zoomAt, type View } from './view'

  interface Props {
    /** JPEG видимого фото. */
    photo: Uint8Array
    /** Поточний ІЧ-кадр у кольорах палітри (з ізотермами). */
    frame: Uint8ClampedArray<ArrayBuffer>
    frameWidth: number
    frameHeight: number
    /** Унікальний префікс для імен радіокнопок. */
    id: number
    /** Вид ІЧ-вікна; за синхронізації вид фото виводиться з нього, а зміни виду фото передаються в `onirview`. */
    irView: View
    onirview: (view: View) => void
    /** «Вписати» за синхронізації — вписати ІЧ-зображення. */
    onirfit: () => void
    alignment: Alignment
    onalign: (alignment: Alignment) => void
    sync: boolean
    onsync: (sync: boolean) => void
    onclose: () => void
  }

  let {
    photo,
    frame,
    frameWidth,
    frameHeight,
    id,
    irView,
    onirview,
    onirfit,
    alignment,
    onalign,
    sync,
    onsync,
    onclose,
  }: Props = $props()

  /** Крок масштабу суміщення кнопками й Shift + колесо. */
  const ALIGN_STEP = 1.02

  let mode = $state<'photo' | 'overlay'>('photo')
  /** Частка ІЧ у накладенні, %; оригінал стартує з 128/255. */
  let blend = $state(50)

  let url = $state<string | undefined>()
  $effect(() => {
    const u = URL.createObjectURL(new Blob([photo as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }))
    url = u
    return () => URL.revokeObjectURL(u)
  })

  // Розмір — із заголовка JPEG; якщо не вдалося — після завантаження зображення
  let loadedSize = $state<{ width: number; height: number } | null>(null)
  const size = $derived(jpegSize(photo) ?? loadedSize)
  const base = $derived(size && defaultPlacement(frameWidth, frameHeight, size.width, size.height))
  /** ІЧ-шар на фото, px фото. */
  const layer = $derived(base && layerRect(base, alignment))

  let viewport: HTMLDivElement | undefined = $state()
  let viewWidth = $state(0)
  let viewHeight = $state(0)
  /** Власний вид — лише без синхронізації. */
  let ownView = $state<View>({ zoom: 1, panX: 0, panY: 0 })
  let autoFit = $state(true)

  const view = $derived(sync && layer ? syncedPhotoView(irView, layer, frameWidth) : ownView)

  $effect(() => {
    if (sync || !autoFit || !size || viewWidth === 0 || viewHeight === 0) return
    ownView = fitView(size.width, size.height, viewWidth, viewHeight)
  })

  function setView(next: View) {
    if (sync && layer) {
      onirview(irViewFor(next, layer, frameWidth))
    } else {
      ownView = next
      autoFit = false
    }
  }

  function setSync(next: boolean) {
    // Вимкнення — фото лишається там, де було
    if (!next) {
      ownView = view
      autoFit = false
    }
    onsync(next)
  }

  function fit() {
    if (sync) onirfit()
    else autoFit = true
  }

  function zoomTo(next: number, cx = viewWidth / 2, cy = viewHeight / 2) {
    setView(zoomAt(view, next, cx, cy))
  }

  function scaleLayer(factor: number, cx = viewWidth / 2, cy = viewHeight / 2) {
    if (base) onalign(scaleAlignment(base, alignment, factor, cx, cy, view, sync))
  }

  // Колесо — масштаб виду; Shift + колесо (лише в накладенні) — масштаб суміщення
  $effect(() => {
    const el = viewport
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      // Shift + колесо в деяких системах дає горизонтальну прокрутку
      const up = (e.deltaY || e.deltaX) < 0
      if (e.shiftKey && mode === 'overlay') scaleLayer(up ? ALIGN_STEP : 1 / ALIGN_STEP, cx, cy)
      else zoomTo(view.zoom * (up ? ZOOM_STEP : 1 / ZOOM_STEP), cx, cy)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  let canvas: HTMLCanvasElement | undefined = $state()
  $effect(() => {
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.putImageData(new ImageData(frame, frameWidth, frameHeight), 0, 0)
  })

  /** ІЧ-шар у координатах вікна. */
  const screenLayer = $derived(
    layer && {
      x: view.panX + layer.x * view.zoom,
      y: view.panY + layer.y * view.zoom,
      width: layer.width * view.zoom,
      height: layer.height * view.zoom,
    },
  )

  /** Перетягування: зсув виду або (Shift) суміщення; початкові вид і суміщення. */
  let drag: { align: boolean; x: number; y: number; view: View; alignment: Alignment } | null = null
  let dragging = $state(false)

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 && e.button !== 1) return
    if (e.button === 1) e.preventDefault()
    viewport!.setPointerCapture(e.pointerId)
    drag = {
      align: e.button === 0 && e.shiftKey && mode === 'overlay',
      x: e.clientX,
      y: e.clientY,
      view,
      alignment,
    }
    dragging = true
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (drag.align) onalign(moveAlignment(drag.alignment, dx, dy, drag.view.zoom, sync))
    else setView({ ...drag.view, panX: drag.view.panX + dx, panY: drag.view.panY + dy })
  }

  function onPointerUp(e: PointerEvent) {
    drag = null
    dragging = false
    if (viewport!.hasPointerCapture(e.pointerId)) viewport!.releasePointerCapture(e.pointerId)
  }

  function onKeyDown(e: KeyboardEvent) {
    switch (e.key) {
      case '+':
      case '=':
        zoomTo(view.zoom * ZOOM_STEP)
        break
      case '-':
        zoomTo(view.zoom / ZOOM_STEP)
        break
      case '0':
        fit()
        break
      default:
        return
    }
    e.preventDefault()
  }

  const aligned = $derived(
    alignment.scale !== NO_ALIGNMENT.scale ||
      alignment.dx !== NO_ALIGNMENT.dx ||
      alignment.dy !== NO_ALIGNMENT.dy,
  )
</script>

<!-- Керування — оверлеєм над фото: вікно фото має ту саму висоту, що й ІЧ-вікно поруч -->
<section class="photo" aria-label={$tr('photo.title')}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="viewport"
    class:dragging
    bind:this={viewport}
    bind:clientWidth={viewWidth}
    bind:clientHeight={viewHeight}
    role="application"
    aria-label={$tr('photo.title')}
    tabindex="0"
    onpointerdown={onPointerDown}
    onmousedown={(e) => {
      if (e.button === 1) e.preventDefault()
    }}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onkeydown={onKeyDown}
  >
    {#if url}
      <img
        src={url}
        alt={$tr('photo.title')}
        draggable="false"
        onload={(e) => {
          const img = e.currentTarget as HTMLImageElement
          loadedSize = { width: img.naturalWidth, height: img.naturalHeight }
        }}
        style:left="{view.panX}px"
        style:top="{view.panY}px"
        style:width={size ? `${size.width * view.zoom}px` : undefined}
        style:height={size ? `${size.height * view.zoom}px` : undefined}
      />
    {/if}
    {#if mode === 'overlay' && screenLayer}
      <canvas
        bind:this={canvas}
        width={frameWidth}
        height={frameHeight}
        style:left="{screenLayer.x}px"
        style:top="{screenLayer.y}px"
        style:width="{screenLayer.width}px"
        style:height="{screenLayer.height}px"
        style:opacity={blend / 100}
      ></canvas>
    {/if}
  </div>
  <div class="float-bar top">
    <div class="float-group">
      <div class="segmented" role="radiogroup" aria-label={$tr('photo.mode')}>
        {#each ['photo', 'overlay'] as const as m (m)}
          <label>
            <input type="radio" name="photo-mode-{id}" checked={mode === m} onchange={() => (mode = m)} />
            {$tr(`photo.mode.${m}`)}
          </label>
        {/each}
      </div>
      <label class="check">
        <input type="checkbox" checked={sync} onchange={(e) => setSync(e.currentTarget.checked)} />
        {$tr('photo.sync')}
      </label>
    </div>
    <div class="float-group">
      <!-- За синхронізації масштаб фото — це масштаб ІЧ (кнопки над кадром), власні не потрібні -->
      {#if !sync}
        <button type="button" onclick={() => zoomTo(view.zoom / ZOOM_STEP)} title={$tr('view.zoomOut')}
          >−</button
        >
        <button type="button" onclick={() => zoomTo(view.zoom * ZOOM_STEP)} title={$tr('view.zoomIn')}
          >+</button
        >
        <button type="button" onclick={fit}>{$tr('view.fit')}</button>
      {/if}
      <HelpTip
        label={$tr('view.help')}
        items={mode === 'overlay' ? [$tr('view.hint'), $tr('photo.hint.align')] : [$tr('view.hint')]}
        align="right"
      />
      <button type="button" onclick={onclose} title={$tr('photo.hide')} aria-label={$tr('photo.hide')}
        >×</button
      >
    </div>
  </div>
  <div class="float-bar bottom">
    <!-- Прозорість і суміщення ІЧ-шару мають сенс лише в режимі накладення -->
    {#if mode === 'overlay'}
      <label class="float-group blend">
        <span>{$tr('photo.blend')}</span>
        <input type="range" min="0" max="100" step="5" bind:value={blend} />
        <span class="value">{blend} %</span>
      </label>
      <div class="float-group">
        <span>{$tr('photo.layerScale')}</span>
        <button type="button" onclick={() => scaleLayer(1 / ALIGN_STEP)} title={$tr('photo.layerSmaller')}
          >−</button
        >
        <span class="value">{Math.round(alignment.scale * 100)} %</span>
        <button type="button" onclick={() => scaleLayer(ALIGN_STEP)} title={$tr('photo.layerLarger')}
          >+</button
        >
        <button
          type="button"
          disabled={!aligned}
          onclick={() => onalign(NO_ALIGNMENT)}
          title={$tr('photo.resetAlign')}
          aria-label={$tr('photo.resetAlign')}>↺</button
        >
      </div>
    {/if}
  </div>
</section>

<style>
  .photo {
    position: relative;
    display: flex;
    min-width: 0;
    min-height: 0;
  }
  .segmented {
    display: flex;
    gap: 10px;
  }
  .segmented label,
  .check {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .check {
    margin-left: 4px;
  }
  .blend {
    flex: 1 1 200px;
    max-width: 320px;
  }
  .blend input {
    flex: 1;
    min-width: 60px;
  }
  .value {
    min-width: 3.5em;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .viewport {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--stage);
    border-radius: 8px;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .viewport.dragging {
    cursor: grabbing;
  }
  img,
  canvas {
    position: absolute;
    max-width: none;
  }
  canvas {
    pointer-events: none;
  }
</style>
