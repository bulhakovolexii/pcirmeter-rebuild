<script lang="ts">
  import { Button } from '$lib/components/ui/button'
  import * as Tabs from '$lib/components/ui/tabs'
  import * as Alert from '$lib/components/ui/alert'
  import * as Empty from '$lib/components/ui/empty'
  import CircleAlertIcon from '@lucide/svelte/icons/circle-alert'
  import FolderOpenIcon from '@lucide/svelte/icons/folder-open'
  import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
  import WifiOffIcon from '@lucide/svelte/icons/wifi-off'
  import { onMount, untrack } from 'svelte'
  import { locale, tr } from '../i18n'
  import { openFiles, restoreFiles, type FileSource, type OpenError, type OpenedFile } from './files'
  import { LENGTH_SYMBOL, TEMPERATURE_SYMBOL } from './format'
  import { demoSources, isDemoPath } from './demo'
  import { applyUpdate, dismissOfflineReady, onLaunchFiles, pwa } from './pwa'
  import { openTabSession, type TabSession } from './session'
  import { units } from './settings'
  import FileTabs from './FileTabs.svelte'
  import SelectField from './SelectField.svelte'
  import Viewer from './Viewer.svelte'
  import logoUrl from './images/kafedra-logo.svg'

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
  /** Діалог звіту (Dialog, DropdownMenu) — окремий chunk: вантажиться з першим натисканням «Звіт»
   *  і далі лишається змонтованим (зберігає вибір файлів і коментарі між відкриттями). */
  let reportDialog: Promise<typeof import('./ReportDialog.svelte')> | undefined = $state()

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
    // Демо-сторінка — зі своїм сеансом вкладки: її зразки не з'являються в звичайному режимі й навпаки
    const demo = isDemoPath(location.pathname)
    void openTabSession(demo ? 'demo' : 'main').then((s) => {
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
      if (demo && restored.length === 0 && files.length === 0) void open(demoSources())
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

<!-- Вкладки файлів (shadcn Tabs): список — у шапці, панелі — переглядачі в main -->
<Tabs.Root
  class="app gap-0"
  value={activeId === null ? '' : String(activeId)}
  onValueChange={(v) => (activeId = Number(v))}
>
  <header>
    <div class="brand">
      <h1>{$tr('app.title')}</h1>
    </div>
    <div class="tabs dark">
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
    <div class="actions dark">
      <Button onclick={() => input?.click()}>{$tr('files.open')}</Button>
      <input
        bind:this={input}
        type="file"
        accept=".jpg,.jpeg,.hir"
        multiple
        hidden
        onchange={onInputChange}
      />
      <Button
        variant="outline"
        disabled={files.length === 0}
        title={$tr('report.buttonTitle')}
        onclick={() => {
          reportDialog ??= import('./ReportDialog.svelte')
          reportOpen = true
        }}>{$tr('report.button')}</Button
      >
      <SelectField
        bind:value={$units.temperature}
        ariaLabel={$tr('units.temperature')}
        options={(['C', 'F', 'K'] as const).map((u) => ({ value: u, label: TEMPERATURE_SYMBOL[u] }))}
      />
      <SelectField
        bind:value={$units.length}
        ariaLabel={$tr('units.length')}
        options={(['m', 'ft'] as const).map((u) => ({ value: u, label: LENGTH_SYMBOL[u][$locale] }))}
      />
      <SelectField
        bind:value={$locale}
        ariaLabel={$tr('app.language')}
        options={[
          { value: 'uk', label: 'Українська' },
          { value: 'en', label: 'English' },
        ]}
      />
    </div>
  </header>

  <!-- Повідомлення — shadcn Alert; кнопка дії — праворуч -->
  {#if $pwa.update}
    <Alert.Root class="mb-2.5 flex items-center gap-3" role="status">
      <RefreshCwIcon />
      <Alert.Description class="flex-1">{$tr('pwa.update')}</Alert.Description>
      <Button size="sm" onclick={applyUpdate}>{$tr('pwa.reload')}</Button>
    </Alert.Root>
  {:else if $pwa.offlineReady}
    <Alert.Root class="mb-2.5 flex items-center gap-3" role="status">
      <WifiOffIcon />
      <Alert.Description class="flex-1">{$tr('pwa.offlineReady')}</Alert.Description>
      <Button variant="outline" size="sm" onclick={dismissOfflineReady}>{$tr('error.dismiss')}</Button>
    </Alert.Root>
  {/if}

  {#if errors.length > 0}
    <Alert.Root variant="destructive" class="mb-2.5 flex items-start gap-3">
      <CircleAlertIcon />
      <div class="flex-1">
        <Alert.Title>{$tr('error.title')}</Alert.Title>
        <Alert.Description>
          <ul class="m-0 list-disc ps-4">
            {#each errors as err, i (i)}
              <li><strong>{err.name}</strong>: {$tr(`error.${err.reason}`)}</li>
            {/each}
          </ul>
        </Alert.Description>
      </div>
      <Button variant="outline" size="sm" onclick={() => (errors = [])}>{$tr('error.dismiss')}</Button>
    </Alert.Root>
  {/if}

  {#if files.length > 0}
    <main>
      <!-- Переглядачі всіх файлів лишаються змонтованими: вкладка зберігає палітру, шкалу й масштаб -->
      {#each files as f (f.id)}
        <Tabs.Content value={String(f.id)} tabindex={-1} class="pane">
          <Viewer file={f} onmarkup={(m) => session?.saveMarkup(f.id, m)} />
        </Tabs.Content>
      {/each}
    </main>
  {:else}
    <main class="empty">
      <Empty.Root class="border">
        <Empty.Header>
          <Empty.Media variant="icon"><FolderOpenIcon /></Empty.Media>
          <Empty.Title>{$tr('files.emptyTitle')}</Empty.Title>
          <Empty.Description>{$tr('files.empty')}</Empty.Description>
        </Empty.Header>
        <Empty.Content>
          <Button onclick={() => input?.click()}>{$tr('files.open')}</Button>
        </Empty.Content>
      </Empty.Root>
    </main>
  {/if}

  {#if files.length > 0}
    {#await reportDialog then module}
      {#if module}
        <module.default open={reportOpen} {files} onclose={() => (reportOpen = false)} />
      {/if}
    {/await}
  {/if}

  {#if dragging}
    <div class="drop" aria-hidden="true">{$tr('files.drop')}</div>
  {/if}
</Tabs.Root>

<!-- Вужче за 1024 px інтерфейс не вміщається — замість нього заглушка (застосунок лишається змонтованим,
     відкриті файли не губляться) -->
<div class="narrow" role="alert">
  <Empty.Root>
    <Empty.Header>
      <Empty.Media><img class="logo" src={logoUrl} alt={$tr('app.logo')} /></Empty.Media>
      <Empty.Title>{$tr('narrow.title')}</Empty.Title>
      <Empty.Description>{$tr('narrow.text')}</Empty.Description>
    </Empty.Header>
  </Empty.Root>
</div>

<style>
  :global(.app) {
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
  h1 {
    font-size: 1.006rem;
    font-weight: 600;
    margin: 0;
  }
  .actions {
    flex-shrink: 0;
    display: flex;
    gap: 6px;
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
  main :global(.pane) {
    height: 100%;
  }
  main :global(.pane[hidden]) {
    display: none;
  }
  .empty {
    display: grid;
    place-items: center;
    text-align: center;
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
    :global(.app) {
      display: none;
    }
    .narrow {
      display: flex;
      min-height: 100vh;
      box-sizing: border-box;
      padding: 16px;
    }
    /* Логотип кафедри (tools/extract_logo.py) */
    .narrow .logo {
      height: 120px;
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
    font-size: 1.137rem;
    pointer-events: none;
  }
</style>
