<script lang="ts">
  import { untrack } from 'svelte'
  import { locale, tr } from '../i18n'
  import type { ReportFile } from '../report/report'
  import type { OpenedFile } from './files'
  import { createReport, reportMeta, savePerson, viewerSnapshot } from './report'
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
  let busy = $state(false)
  let error = $state('')
  let warning = $state('')

  const selected = $derived(files.filter((f) => !excluded[f.id]))

  $effect(() => {
    if (!dialog) return
    if (open && !dialog.open) {
      untrack(() => {
        error = ''
        warning = ''
      })
      dialog.showModal()
    } else if (!open && dialog.open) dialog.close()
  })

  async function create(e: SubmitEvent) {
    e.preventDefault()
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
      const { bytes, fileName } = await createReport($state.snapshot($reportMeta), snapshots, {
        locale: $locale,
        units: $units,
        t: $tr,
      })
      const url = URL.createObjectURL(
        new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
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
  <form onsubmit={create}>
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
            <li>
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
                  rows="2"
                  aria-label="{$tr('report.comment')}: {f.name}"
                  placeholder={$tr('report.commentHint')}
                  value={comments[f.id] ?? ''}
                  oninput={(e) => (comments[f.id] = e.currentTarget.value)}></textarea>
              {/if}
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
      <button type="submit" class="primary" disabled={busy}>{$tr('report.create')}</button>
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
    display: flex;
    flex-direction: column;
    gap: 4px;
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
