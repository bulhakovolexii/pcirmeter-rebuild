<script lang="ts">
  import { tr } from '../i18n'
  import { defaultPlacement, jpegSize } from './photo'
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
  }

  let { photo, frame, frameWidth, frameHeight, id }: Props = $props()

  let mode = $state<'photo' | 'overlay'>('photo')
  /** Частка ІЧ у накладенні, %; оригінал стартує з 128/255. */
  let blend = $state(50)
  /** Ручне суміщення: зсув ІЧ-шару в пікселях фото. */
  let offset = $state({ dx: 0, dy: 0 })

  let url = $state<string | undefined>()
  $effect(() => {
    const u = URL.createObjectURL(new Blob([photo as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }))
    url = u
    return () => URL.revokeObjectURL(u)
  })

  // Розмір — із заголовка JPEG; якщо не вдалося — після завантаження зображення
  let loadedSize = $state<{ width: number; height: number } | null>(null)
  const size = $derived(jpegSize(photo) ?? loadedSize)
  const placement = $derived(size && defaultPlacement(frameWidth, frameHeight, size.width, size.height))

  let viewport: HTMLDivElement | undefined = $state()
  let viewWidth = $state(0)
  let viewHeight = $state(0)
  let view = $state<View>({ zoom: 1, panX: 0, panY: 0 })
  let autoFit = $state(true)

  $effect(() => {
    if (!autoFit || !size || viewWidth === 0 || viewHeight === 0) return
    view = fitView(size.width, size.height, viewWidth, viewHeight)
  })

  function zoomTo(next: number, cx = viewWidth / 2, cy = viewHeight / 2) {
    view = zoomAt(view, next, cx, cy)
    autoFit = false
  }

  $effect(() => {
    const el = viewport
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      zoomTo(
        view.zoom * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP),
        e.clientX - rect.left,
        e.clientY - rect.top,
      )
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
  const layer = $derived(
    placement && {
      x: view.panX + (placement.x + offset.dx) * view.zoom,
      y: view.panY + (placement.y + offset.dy) * view.zoom,
      width: placement.width * view.zoom,
      height: placement.height * view.zoom,
    },
  )

  let drag: { kind: 'pan' | 'layer'; x: number; y: number; from: { a: number; b: number } } | null = null
  let dragging = $state(false)

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 && e.button !== 1) return
    if (e.button === 1) e.preventDefault()
    viewport!.setPointerCapture(e.pointerId)
    const rect = viewport!.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const onLayer =
      e.button === 0 &&
      mode === 'overlay' &&
      layer &&
      px >= layer.x &&
      py >= layer.y &&
      px < layer.x + layer.width &&
      py < layer.y + layer.height
    drag = onLayer
      ? { kind: 'layer', x: e.clientX, y: e.clientY, from: { a: offset.dx, b: offset.dy } }
      : { kind: 'pan', x: e.clientX, y: e.clientY, from: { a: view.panX, b: view.panY } }
    dragging = true
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (drag.kind === 'layer') {
      offset = { dx: Math.round(drag.from.a + dx / view.zoom), dy: Math.round(drag.from.b + dy / view.zoom) }
    } else {
      view = { ...view, panX: drag.from.a + dx, panY: drag.from.b + dy }
      autoFit = false
    }
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
        autoFit = true
        break
      default:
        return
    }
    e.preventDefault()
  }
</script>

<section class="photo" aria-label={$tr('photo.title')}>
  <div class="toolbar">
    <div class="segmented" role="radiogroup" aria-label={$tr('photo.mode')}>
      {#each ['photo', 'overlay'] as const as m (m)}
        <label>
          <input type="radio" name="photo-mode-{id}" checked={mode === m} onchange={() => (mode = m)} />
          {$tr(`photo.mode.${m}`)}
        </label>
      {/each}
    </div>
    <span class="sep"></span>
    <button type="button" onclick={() => zoomTo(view.zoom / ZOOM_STEP)} title={$tr('view.zoomOut')}>−</button>
    <span class="zoom">{Math.round(view.zoom * 100)} %</span>
    <button type="button" onclick={() => zoomTo(view.zoom * ZOOM_STEP)} title={$tr('view.zoomIn')}>+</button>
    <button type="button" onclick={() => (autoFit = true)}>{$tr('view.fit')}</button>
  </div>
  {#if mode === 'overlay'}
    <div class="toolbar">
      <label class="blend">
        <span>{$tr('photo.blend')}</span>
        <input type="range" min="0" max="100" step="5" bind:value={blend} />
        <span class="value">{blend} %</span>
      </label>
      <button
        type="button"
        disabled={offset.dx === 0 && offset.dy === 0}
        onclick={() => (offset = { dx: 0, dy: 0 })}>{$tr('photo.resetAlign')}</button
      >
    </div>
  {/if}
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
    {#if mode === 'overlay' && layer}
      <canvas
        bind:this={canvas}
        class="layer"
        width={frameWidth}
        height={frameHeight}
        style:left="{layer.x}px"
        style:top="{layer.y}px"
        style:width="{layer.width}px"
        style:height="{layer.height}px"
        style:opacity={blend / 100}
      ></canvas>
    {/if}
  </div>
  <p class="hint">
    {mode === 'overlay' ? $tr('photo.hint.overlay') : $tr('view.hint')}
  </p>
</section>

<style>
  .photo {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    min-height: 0;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    font-size: 0.9rem;
  }
  .toolbar button {
    min-width: 2rem;
  }
  .segmented {
    display: flex;
    gap: 12px;
  }
  .sep {
    flex: 1;
  }
  .zoom {
    min-width: 4.5em;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .blend {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
  }
  .blend input {
    flex: 1;
    min-width: 80px;
  }
  .value {
    min-width: 3.5em;
    font-variant-numeric: tabular-nums;
  }
  .viewport {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--stage);
    border-radius: 6px;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .viewport.dragging {
    cursor: grabbing;
  }
  .viewport:focus-visible {
    outline: 2px solid var(--accent);
  }
  img,
  canvas {
    position: absolute;
    max-width: none;
  }
  .layer {
    cursor: move;
  }
  .hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--muted);
  }
</style>
