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
  import { Label } from '$lib/components/ui/label'
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down'
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
  <Dialog.Content
    class="flex max-h-[calc(100vh-3rem)] flex-col sm:max-w-2xl"
    closeLabel={$tr('report.cancel')}
    portalProps={{ disabled: typeof window === 'undefined' }}
  >
    <Dialog.Header>
      <Dialog.Title>{$tr('report.dialog')}</Dialog.Title>
      <Dialog.Description>{$tr('report.remember')}</Dialog.Description>
    </Dialog.Header>

    <div class="-mx-6 flex min-h-0 flex-col gap-6 overflow-y-auto px-6 py-1">
      <div class="grid grid-cols-2 gap-4">
        <div class="grid gap-2 col-span-2">
          <Label for="report-subject">{$tr('report.subject')}</Label>
          <Input id="report-subject" type="text" bind:value={$reportMeta.subject} />
        </div>
        <div class="grid gap-2">
          <Label for="report-author">{$tr('report.author')}</Label>
          <Input id="report-author" type="text" bind:value={$reportMeta.author} autocomplete="name" />
        </div>
        <div class="grid gap-2">
          <Label for="report-group">{$tr('report.group')}</Label>
          <Input id="report-group" type="text" bind:value={$reportMeta.group} />
        </div>
        <div class="grid gap-2">
          <Label for="report-teacher">{$tr('report.teacher')}</Label>
          <Input id="report-teacher" type="text" bind:value={$reportMeta.teacher} />
        </div>
        <div class="grid gap-2">
          <Label for="report-date">{$tr('report.date')}</Label>
          <Input id="report-date" type="date" bind:value={$reportMeta.date} />
        </div>
        <div class="grid gap-2 col-span-2">
          <Label for="report-description">{$tr('report.description')}</Label>
          <Textarea
            id="report-description"
            rows={2}
            bind:value={$reportMeta.description}
            placeholder={$tr('report.descriptionHint')}
          />
        </div>
      </div>

      <fieldset class="m-0 grid gap-3 border-0 p-0">
        <legend class="mb-3 p-0 text-sm font-medium">{$tr('report.files')}</legend>
        <ol class="files">
          {#each files as f (f.id)}
            <li class:excluded={excluded[f.id]}>
              <Label class="col-start-1">
                <Checkbox checked={!excluded[f.id]} onCheckedChange={(c) => (excluded[f.id] = !c)} />
                {f.name}
              </Label>
              {#if !excluded[f.id]}
                <Textarea
                  class="col-start-1"
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

      <div class="grid gap-2">
        <Label for="report-conclusion">{$tr('report.conclusion')}</Label>
        <Textarea id="report-conclusion" rows={3} bind:value={$reportMeta.conclusion} />
      </div>
    </div>

    <Dialog.Footer class="items-center">
      <p class="text-muted-foreground me-auto text-sm" role="status">
        {#if busy}
          {$tr('report.creating')}
        {:else if warning}
          <span class="warning">{warning}</span>
        {:else if error}
          <span class="warning">{error}</span>
        {/if}
      </p>
      <Button variant="outline" onclick={onclose}>{$tr('report.cancel')}</Button>
      <DropdownMenu.Root bind:open={menuOpen}>
        <DropdownMenu.Trigger class={buttonVariants()} disabled={busy}>
          {$tr('report.create')}
          <ChevronDownIcon />
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
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  .files {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .files li {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto 1fr;
    gap: 8px 12px;
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
    border-radius: var(--radius-md, 8px);
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
  .warning {
    color: var(--warn);
  }
</style>
