<script lang="ts">
  import { untrack } from 'svelte'
  import { locale, tr } from '../i18n'
  import { openFiles, type FileSource, type OpenError, type OpenedFile } from './files'
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

  async function open(sources: Iterable<FileSource>) {
    const { opened, errors: failed } = await openFiles(sources)
    errors = failed
    if (opened.length > 0) {
      files = [...files, ...opened]
      activeId = opened[0]!.id
    }
  }

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

<div class="app">
  <header>
    <h1>{$tr('app.title')}</h1>
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
      <select bind:value={$locale} aria-label={$tr('app.language')}>
        <option value="uk">Українська</option>
        <option value="en">English</option>
      </select>
    </div>
  </header>

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
    <div class="tabs" role="tablist">
      {#each files as f (f.id)}
        <div class="tab" class:active={f.id === activeId}>
          <button
            type="button"
            role="tab"
            aria-selected={f.id === activeId}
            onclick={() => (activeId = f.id)}
          >
            {f.name}
          </button>
          <button
            type="button"
            class="close"
            aria-label="{$tr('files.close')} {f.name}"
            onclick={() => close(f.id)}>×</button
          >
        </div>
      {/each}
      {#if files.length > 1}
        <button type="button" class="close-all" onclick={closeAll}>{$tr('files.closeAll')}</button>
      {/if}
    </div>
    <main>
      <!-- Переглядачі всіх файлів лишаються змонтованими: вкладка зберігає палітру, шкалу й масштаб -->
      {#each files as f (f.id)}
        <div class="pane" hidden={f.id !== activeId}>
          <Viewer file={f} />
        </div>
      {/each}
    </main>
  {:else}
    <main class="empty">
      <p class="muted">{$tr('files.empty')}</p>
    </main>
  {/if}

  {#if dragging}
    <div class="drop" aria-hidden="true">{$tr('files.drop')}</div>
  {/if}
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
    flex-wrap: wrap;
    border-bottom: 1px solid var(--border);
  }
  h1 {
    font-size: 1.3rem;
    margin: 12px 0;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .errors {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-top: 10px;
    padding: 8px 12px;
    border-radius: 6px;
    background: var(--error-bg);
  }
  .errors ul {
    margin: 0;
    padding-left: 18px;
  }
  .tabs {
    display: flex;
    gap: 4px;
    margin: 10px 0;
    overflow-x: auto;
  }
  .tab {
    display: flex;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    flex-shrink: 0;
  }
  .tab.active {
    border-color: var(--accent);
    box-shadow: inset 0 -2px 0 var(--accent);
  }
  .tab button {
    border: none;
    background: none;
  }
  .tab .close {
    color: var(--muted);
  }
  .close-all {
    margin-left: auto;
    flex-shrink: 0;
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

  @media (max-width: 720px) {
    .app {
      height: auto;
      min-height: 100vh;
    }
  }
</style>
