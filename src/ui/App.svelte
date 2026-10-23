<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { locale, tr } from '../i18n'
  import { openFiles, restoreFiles, type FileSource, type OpenError, type OpenedFile } from './files'
  import { LENGTH_SYMBOL, TEMPERATURE_SYMBOL } from './format'
  import { demoSources, isDemoPath } from './demo'
  import { applyUpdate, dismissOfflineReady, onLaunchFiles, pwa } from './pwa'
  import { openTabSession, type TabSession } from './session'
  import { units } from './settings'
  import FileTabs from './FileTabs.svelte'
  import ReportDialog from './ReportDialog.svelte'
  import Viewer from './Viewer.svelte'

  interface Props {
    /** Початково відкриті файли (для тестів і майбутнього відкриття з URL). */
    initialFiles?: OpenedFile[]
  }

  let { initialFiles = [] }: Props = $props()

  // Термограми не змінюються — $state.raw, щоб Svelte не обгортав кадри проксі
  let files: OpenedFile[] = $state.raw(untrack(() => [...initialFiles]))
  let activeId: number | null = $state(untrack(() => initialFiles[0]?.id ?? null))
  let errors: OpenError[] = $state([])
  let dragging = $state(false)
  let input: HTMLInputElement | undefined = $state()
  let reportOpen = $state(false)

  async function open(sources: Iterable<FileSource>) {
    const { opened, errors: failed } = await openFiles(sources)
    errors = failed
    if (opened.length > 0) {
      files = [...files, ...opened]
      activeId = opened[0]!.id
    }
  }

  // Файли, відкриті з ОС через встановлений застосунок
  onMount(() => onLaunchFiles((launched) => void open(launched)))

  // Відкриті файли переживають перезавантаження вкладки браузера (до закриття вкладки файлу чи браузера)
  let session: TabSession | null = $state.raw(null)
  onMount(() => {
    void openTabSession().then((s) => {
      let restored: OpenedFile[] = []
      if (s) {
        restored = restoreFiles(s.files)
        if (restored.length > 0) {
          files = [...restored, ...files]
          if (activeId === null) activeId = s.activeId ?? restored[0]!.id
        }
        session = s
      }
      // Демо-сторінка відкриває зразки; після перезавантаження — те, що збережено в сеансі вкладки
      if (restored.length === 0 && files.length === 0 && isDemoPath(location.pathname))
        void open(demoSources())
    })
  })
  $effect(() => session?.sync(files, activeId))

  function close(id: number) {
    const i = files.findIndex((f) => f.id === id)
    files = files.filter((f) => f.id !== id)
    if (activeId === id) activeId = (files[i] ?? files[i - 1])?.id ?? null
  }

  function closeAll() {
    files = []
    activeId = null
  }

  function onInputChange() {
    if (input?.files) void open(Array.from(input.files))
    if (input) input.value = ''
  }

  const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false

  function onDragOver(e: DragEvent) {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragging = true
  }

  function onDrop(e: DragEvent) {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragging = false
    if (e.dataTransfer) void open(Array.from(e.dataTransfer.files))
  }
</script>

<svelte:window
  ondragover={onDragOver}
  ondragleave={(e) => {
    if (!e.relatedTarget) dragging = false
  }}
  ondrop={onDrop}
/>

<svelte:head>
  <title>{$tr('app.title')}</title>
</svelte:head>

<div class="app">
  <header>
    <div class="brand">
      <span class="logo" aria-hidden="true">ІЧ</span>
      <h1>{$tr('app.title')}</h1>
    </div>
    <div class="tabs">
      {#if files.length > 0}
        <FileTabs
          {files}
          {activeId}
          onselect={(id) => (activeId = id)}
          onclose={close}
          oncloseall={closeAll}
        />
      {/if}
    </div>
    <div class="actions">
      <button type="button" class="primary" onclick={() => input?.click()}>{$tr('files.open')}</button>
      <input
        bind:this={input}
        type="file"
        accept=".jpg,.jpeg,.hir"
        multiple
        hidden
        onchange={onInputChange}
      />
      <button
        type="button"
        disabled={files.length === 0}
        title={$tr('report.buttonTitle')}
        onclick={() => (reportOpen = true)}>{$tr('report.button')}</button
      >
      <select bind:value={$units.temperature} aria-label={$tr('units.temperature')}>
        {#each ['C', 'F', 'K'] as const as u (u)}
          <option value={u}>{TEMPERATURE_SYMBOL[u]}</option>
        {/each}
      </select>
      <select bind:value={$units.length} aria-label={$tr('units.length')}>
        {#each ['m', 'ft'] as const as u (u)}
          <option value={u}>{LENGTH_SYMBOL[u][$locale]}</option>
        {/each}
      </select>
      <select bind:value={$locale} aria-label={$tr('app.language')}>
        <option value="uk">Українська</option>
        <option value="en">English</option>
      </select>
    </div>
  </header>

  {#if $pwa.update}
    <div class="notice" role="status">
      <span>{$tr('pwa.update')}</span>
      <button type="button" class="primary" onclick={applyUpdate}>{$tr('pwa.reload')}</button>
    </div>
  {:else if $pwa.offlineReady}
    <div class="notice" role="status">
      <span>{$tr('pwa.offlineReady')}</span>
      <button type="button" onclick={dismissOfflineReady}>{$tr('error.dismiss')}</button>
    </div>
  {/if}

  {#if errors.length > 0}
    <div class="errors" role="alert">
      <ul>
        {#each errors as err, i (i)}
          <li><strong>{err.name}</strong>: {$tr(`error.${err.reason}`)}</li>
        {/each}
      </ul>
      <button type="button" onclick={() => (errors = [])}>{$tr('error.dismiss')}</button>
    </div>
  {/if}

  {#if files.length > 0}
    <main>
      <!-- Переглядачі всіх файлів лишаються змонтованими: вкладка зберігає палітру, шкалу й масштаб -->
      {#each files as f (f.id)}
        <div class="pane" hidden={f.id !== activeId}>
          <Viewer file={f} onmarkup={(m) => session?.saveMarkup(f.id, m)} />
        </div>
      {/each}
    </main>
  {:else}
    <main class="empty">
      <p class="muted">{$tr('files.empty')}</p>
    </main>
  {/if}

  {#if files.length > 0}
    <ReportDialog open={reportOpen} {files} onclose={() => (reportOpen = false)} />
  {/if}

  {#if dragging}
    <div class="drop" aria-hidden="true">{$tr('files.drop')}</div>
  {/if}
</div>

<!-- Вужче за 1024 px інтерфейс не вміщається — замість нього заглушка (застосунок лишається змонтованим,
     відкриті файли не губляться) -->
<div class="narrow" role="alert">
  <span class="logo" aria-hidden="true">ІЧ</span>
  <h1>{$tr('narrow.title')}</h1>
  <p>{$tr('narrow.text')}</p>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    box-sizing: border-box;
    padding: 0 16px 16px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin: 10px 0;
    padding: 8px 14px;
    background: var(--header);
    color: #fff;
    border: 1px solid #3a3a3a;
    border-top: 3px solid var(--accent);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  .brand {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .logo {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: #a0001b;
    font-weight: 700;
    letter-spacing: 0.5px;
  }
  h1 {
    font-size: 1.15rem;
    font-weight: 600;
    margin: 0;
  }
  .actions {
    flex-shrink: 0;
    display: flex;
    gap: 6px;
  }
  header select,
  header button:not(.primary) {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.22);
    color: #fff;
  }
  header select:hover,
  header button:not(.primary):hover {
    border-color: var(--gold);
  }
  header option {
    color: var(--fg);
    background: var(--surface);
  }
  .primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    font-weight: 600;
  }
  .primary:not(:disabled):hover {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }
  header .primary {
    background: #a0001b;
    border-color: #a0001b;
  }
  header .primary:hover {
    border-color: var(--gold);
  }
  .notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-left: 4px solid var(--accent);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .errors {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
    padding: 8px 12px;
    border-left: 4px solid var(--accent);
    border-radius: var(--radius);
    background: var(--error-bg);
  }
  .errors ul {
    margin: 0;
    padding-left: 18px;
  }
  .tabs {
    flex: 1;
    min-width: 0;
    display: flex;
  }
  main {
    flex: 1;
    min-height: 0;
  }
  .pane {
    height: 100%;
  }
  .pane[hidden] {
    display: none;
  }
  .empty {
    display: grid;
    place-items: center;
    text-align: center;
  }
  .muted {
    color: var(--muted);
  }
  .narrow {
    display: none;
  }
  @media (max-width: 1279px) {
    .brand h1 {
      display: none;
    }
  }
  @media (max-width: 1023px) {
    .app {
      display: none;
    }
    .narrow {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      min-height: 100vh;
      box-sizing: border-box;
      padding: 24px 16px;
      text-align: center;
    }
    .narrow .logo {
      width: 48px;
      height: 48px;
      font-size: 1.2rem;
      color: #fff;
    }
    .narrow p {
      max-width: 420px;
      margin: 0;
      color: var(--muted);
    }
  }
  .drop {
    position: fixed;
    inset: 12px;
    display: grid;
    place-items: center;
    border: 3px dashed var(--accent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--bg) 85%, transparent);
    font-size: 1.3rem;
    pointer-events: none;
  }
</style>
