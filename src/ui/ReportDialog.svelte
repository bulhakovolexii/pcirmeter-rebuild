<script lang="ts">
  import { untrack } from 'svelte'
  import { locale, tr } from '../i18n'
  import type { ReportFile, ReportFormat } from '../report/content'
  import type { OpenedFile } from './files'
  import {
    createReport,
    REPORT_MIME,
    reportMeta,
    reportThumbnail,
    savePerson,
    viewerSnapshot,
  } from './report'
  import { rasterizeSvg } from './rasterize'
  import { units } from './settings'

  interface Props {
    open: boolean
    /** Відкриті файли в порядку вкладок. */
    files: readonly OpenedFile[]
    onclose: () => void
  }

  let { open, files, onclose }: Props = $props()

  let dialog: HTMLDialogElement | undefined = $state()
  /** Файли, вилучені зі звіту (нові файли за замовчуванням входять). */
  let excluded = $state<Record<number, boolean>>({})
  let comments = $state<Record<number, string>>({})
  /** Мініатюри (`data:` URL) — оновлюються щоразу, коли діалог відкривається. */
  let thumbs = $state<Record<number, string>>({})
  let busy = $state(false)
  let error = $state('')
  let warning = $state('')
  let menuOpen = $state(false)
  let menu: HTMLDivElement | undefined = $state()

  const FORMATS: readonly ReportFormat[] = ['pdf', 'odt']

  const selected = $derived(files.filter((f) => !excluded[f.id]))

  $effect(() => {
    if (!dialog) return
    if (open && !dialog.open) {
      untrack(() => {
        error = ''
        warning = ''
        menuOpen = false
        void updateThumbnails()
      })
      dialog.showModal()
    } else if (!open && dialog.open) dialog.close()
  })

  async function updateThumbnails() {
    const options = { locale: $locale, units: $units, t: $tr }
    for (const f of files) {
      const s = viewerSnapshot(f.id)
      if (!s) continue
      try {
        thumbs[f.id] = await reportThumbnail({ ...s, comment: '' }, options)
      } catch (err) {
        console.error(err)
      }
    }
  }

  // Меню формату закривається кліком поза ним
  $effect(() => {
    if (!menuOpen) return
    const onpointerdown = (e: PointerEvent) => {
      if (menu && !menu.contains(e.target as Node)) menuOpen = false
    }
    document.addEventListener('pointerdown', onpointerdown)
    return () => document.removeEventListener('pointerdown', onpointerdown)
  })

  function onMenuKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && menuOpen) {
      // Escape закриває меню, а не весь діалог
      e.preventDefault()
      e.stopPropagation()
      menuOpen = false
      menu?.querySelector<HTMLButtonElement>('[aria-haspopup]')?.focus()
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && menuOpen) {
      e.preventDefault()
      const items = [...(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
      const i = items.indexOf(document.activeElement as HTMLButtonElement)
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
      items[next]?.focus()
    }
  }

  async function toggleMenu() {
    menuOpen = !menuOpen
    if (menuOpen) {
      await Promise.resolve()
      menu?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    }
  }

  async function create(format: ReportFormat) {
    menuOpen = false
    error = ''
    if (selected.length === 0) {
      warning = $tr('report.noFiles')
      return
    }
    warning = ''
    const snapshots: ReportFile[] = []
    for (const f of selected) {
      const s = viewerSnapshot(f.id)
      if (s) snapshots.push({ ...s, comment: comments[f.id] ?? '' })
    }
    busy = true
    try {
      savePerson($reportMeta)
      const { bytes, fileName } = await createReport(
        format,
        rasterizeSvg,
        $state.snapshot($reportMeta),
        snapshots,
        {
          locale: $locale,
          units: $units,
          t: $tr,
        },
      )
      const url = URL.createObjectURL(
        new Blob([bytes as Uint8Array<ArrayBuffer>], { type: REPORT_MIME[format] }),
      )
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (err) {
      console.error(err)
      error = $tr('report.error')
    } finally {
      busy = false
    }
  }
</script>

<dialog bind:this={dialog} aria-labelledby="report-title" {onclose}>
  <form onsubmit={(e) => e.preventDefault()}>
    <header>
      <h2 id="report-title">{$tr('report.dialog')}</h2>
      <button type="button" class="close" aria-label={$tr('report.cancel')} onclick={onclose}>×</button>
    </header>

    <div class="body">
      <div class="grid">
        <label class="wide">
          <span>{$tr('report.subject')}</span>
          <input type="text" bind:value={$reportMeta.subject} />
        </label>
        <label>
          <span>{$tr('report.author')}</span>
          <input type="text" bind:value={$reportMeta.author} autocomplete="name" />
        </label>
        <label>
          <span>{$tr('report.group')}</span>
          <input type="text" bind:value={$reportMeta.group} />
        </label>
        <label>
          <span>{$tr('report.teacher')}</span>
          <input type="text" bind:value={$reportMeta.teacher} />
        </label>
        <label>
          <span>{$tr('report.date')}</span>
          <input type="date" bind:value={$reportMeta.date} />
        </label>
        <label class="wide">
          <span>{$tr('report.description')}</span>
          <textarea rows="2" bind:value={$reportMeta.description} placeholder={$tr('report.descriptionHint')}
          ></textarea>
        </label>
      </div>
      <p class="hint">{$tr('report.remember')}</p>

      <fieldset>
        <legend>{$tr('report.files')}</legend>
        <ol class="files">
          {#each files as f (f.id)}
            <li class:excluded={excluded[f.id]}>
              <label class="check">
                <input
                  type="checkbox"
                  checked={!excluded[f.id]}
                  onchange={(e) => (excluded[f.id] = !e.currentTarget.checked)}
                />
                <strong>{f.name}</strong>
              </label>
              {#if !excluded[f.id]}
                <textarea
                  rows="3"
                  aria-label="{$tr('report.comment')}: {f.name}"
                  placeholder={$tr('report.commentHint')}
                  value={comments[f.id] ?? ''}
                  oninput={(e) => (comments[f.id] = e.currentTarget.value)}></textarea>
              {/if}
              <div class="thumb">
                {#if thumbs[f.id]}
                  <img src={thumbs[f.id]} alt="{$tr('report.thumbnail')}: {f.name}" />
                {/if}
              </div>
            </li>
          {/each}
        </ol>
      </fieldset>

      <label class="block">
        <span>{$tr('report.conclusion')}</span>
        <textarea rows="3" bind:value={$reportMeta.conclusion}></textarea>
      </label>
    </div>

    <footer>
      <p class="status" role="status">
        {#if busy}
          {$tr('report.creating')}
        {:else if warning}
          <span class="warning">{warning}</span>
        {:else if error}
          <span class="warning">{error}</span>
        {/if}
      </p>
      <button type="button" onclick={onclose}>{$tr('report.cancel')}</button>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="menu-wrap" bind:this={menu} onkeydown={onMenuKeydown}>
        <button
          type="button"
          class="primary"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          disabled={busy}
          onclick={toggleMenu}>{$tr('report.create')} <span aria-hidden="true">▾</span></button
        >
        {#if menuOpen}
          <div class="menu" role="menu" aria-label={$tr('report.format')}>
            {#each FORMATS as format (format)}
              <button type="button" role="menuitem" onclick={() => create(format)}>
                <strong>{format.toUpperCase()}</strong>
                <span>{$tr(`report.format.${format}`)}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </footer>
  </form>
</dialog>

<style>
  dialog {
    width: min(720px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    padding: 0;
    border: 1px solid var(--border-strong);
    border-top: 3px solid var(--accent);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--fg);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.45);
  }
  form {
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 52px);
  }
  header,
  footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
  }
  header {
    justify-content: space-between;
    border-bottom: 1px solid var(--border);
  }
  h2 {
    margin: 0;
    font-size: 1.05rem;
  }
  .close {
    border: none;
    background: none;
    font-size: 1.3rem;
    line-height: 1;
  }
  .body {
    overflow-y: auto;
    padding: 12px 16px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 12px;
  }
  .wide {
    grid-column: 1 / -1;
  }
  label:not(.check) {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 0.85rem;
  }
  label > span {
    color: var(--muted);
  }
  input[type='text'],
  input[type='date'],
  textarea {
    font: inherit;
    font-size: 0.9rem;
    color: inherit;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 7px;
    padding: 4px 8px;
  }
  textarea {
    resize: vertical;
  }
  .hint {
    margin: 6px 0 10px;
    font-size: 0.8rem;
    color: var(--muted);
  }
  fieldset {
    border: 1px solid var(--border);
    border-radius: 8px;
    margin: 0 0 10px;
    padding: 6px 10px 10px;
  }
  legend {
    font-size: 0.85rem;
    font-weight: 600;
  }
  .files {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .files li {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto 1fr;
    gap: 4px 10px;
  }
  .files li > textarea {
    grid-column: 1;
    min-height: 60px;
  }
  .thumb {
    grid-column: 2;
    grid-row: 1 / span 2;
    width: 160px;
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--stage);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  .thumb img {
    display: block;
    max-width: 100%;
    max-height: 100%;
  }
  .excluded .thumb {
    opacity: 0.35;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.9rem;
  }
  .block {
    margin-top: 4px;
  }
  footer {
    justify-content: flex-end;
    border-top: 1px solid var(--border);
  }
  .status {
    flex: 1;
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .warning {
    color: var(--warn);
  }
  .menu-wrap {
    position: relative;
  }
  .menu {
    position: absolute;
    right: 0;
    bottom: calc(100% + 4px);
    z-index: 1;
    display: flex;
    flex-direction: column;
    min-width: 260px;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
  }
  .menu button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    border: none;
    background: none;
    text-align: left;
    padding: 6px 10px;
  }
  .menu button:hover,
  .menu button:focus-visible {
    background: var(--error-bg);
  }
  .menu span {
    font-size: 0.8rem;
    color: var(--muted);
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
</style>
