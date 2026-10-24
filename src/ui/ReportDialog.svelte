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
  import { Button, buttonVariants } from '$lib/components/ui/button'
  import { Checkbox } from '$lib/components/ui/checkbox'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'

  interface Props {
    open: boolean
    /** Відкриті файли в порядку вкладок. */
    files: readonly OpenedFile[]
    onclose: () => void
  }

  let { open, files, onclose }: Props = $props()

  /** Файли, вилучені зі звіту (нові файли за замовчуванням входять). */
  let excluded = $state<Record<number, boolean>>({})
  let comments = $state<Record<number, string>>({})
  /** Мініатюри (`data:` URL) — оновлюються щоразу, коли діалог відкривається. */
  let thumbs = $state<Record<number, string>>({})
  let busy = $state(false)
  let error = $state('')
  let warning = $state('')
  let menuOpen = $state(false)

  const FORMATS: readonly ReportFormat[] = ['pdf', 'odt']

  const selected = $derived(files.filter((f) => !excluded[f.id]))

  $effect(() => {
    if (!open) return
    untrack(() => {
      error = ''
      warning = ''
      menuOpen = false
      void updateThumbnails()
    })
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

<Dialog.Root {open} onOpenChange={(v) => !v && onclose()}>
  <!-- Портал — лише в браузері: SSR-смоук-тести (svelte/server) бачать вміст діалогу на місці -->
  <Dialog.Content closeLabel={$tr('report.cancel')} portalProps={{ disabled: typeof window === 'undefined' }}>
    <Dialog.Header class="dialog-head">
      <Dialog.Title>{$tr('report.dialog')}</Dialog.Title>
    </Dialog.Header>

    <div class="body">
      <div class="grid">
        <label class="wide">
          <span>{$tr('report.subject')}</span>
          <Input type="text" bind:value={$reportMeta.subject} />
        </label>
        <label>
          <span>{$tr('report.author')}</span>
          <Input type="text" bind:value={$reportMeta.author} autocomplete="name" />
        </label>
        <label>
          <span>{$tr('report.group')}</span>
          <Input type="text" bind:value={$reportMeta.group} />
        </label>
        <label>
          <span>{$tr('report.teacher')}</span>
          <Input type="text" bind:value={$reportMeta.teacher} />
        </label>
        <label>
          <span>{$tr('report.date')}</span>
          <Input type="date" bind:value={$reportMeta.date} />
        </label>
        <label class="wide">
          <span>{$tr('report.description')}</span>
          <Textarea
            class="min-h-0"
            rows={2}
            bind:value={$reportMeta.description}
            placeholder={$tr('report.descriptionHint')}
          />
        </label>
      </div>
      <p class="hint">{$tr('report.remember')}</p>

      <fieldset>
        <legend>{$tr('report.files')}</legend>
        <ol class="files">
          {#each files as f (f.id)}
            <li class:excluded={excluded[f.id]}>
              <label class="check">
                <Checkbox checked={!excluded[f.id]} onCheckedChange={(c) => (excluded[f.id] = !c)} />
                <strong>{f.name}</strong>
              </label>
              {#if !excluded[f.id]}
                <Textarea
                  class="comment"
                  rows={3}
                  aria-label="{$tr('report.comment')}: {f.name}"
                  placeholder={$tr('report.commentHint')}
                  value={comments[f.id] ?? ''}
                  oninput={(e) => (comments[f.id] = e.currentTarget.value)}
                />
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
        <Textarea class="min-h-0" rows={3} bind:value={$reportMeta.conclusion} />
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
      <Button onclick={onclose}>{$tr('report.cancel')}</Button>
      <DropdownMenu.Root bind:open={menuOpen}>
        <DropdownMenu.Trigger class={buttonVariants({ variant: 'primary' })} disabled={busy}>
          {$tr('report.create')} <span aria-hidden="true">▾</span>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content side="top" align="end" class="min-w-64" aria-label={$tr('report.format')}>
          {#each FORMATS as format (format)}
            <DropdownMenu.Item class="flex-col items-start gap-0" onSelect={() => create(format)}>
              <strong>{format.toUpperCase()}</strong>
              <span class="text-muted-foreground text-xs">{$tr(`report.format.${format}`)}</span>
            </DropdownMenu.Item>
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  :global(.dialog-head),
  footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
  }
  :global(.dialog-head) {
    flex-direction: row;
    min-height: 44px;
    border-bottom: 1px solid var(--border);
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
  .files li > :global(.comment) {
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
</style>
