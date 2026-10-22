<script lang="ts">
  import { locale, tr } from '../i18n'
</script>

<main>
  <header>
    <h1>{$tr('app.title')}</h1>
    <select bind:value={$locale} aria-label={$tr('app.language')}>
      <option value="uk">Українська</option>
      <option value="en">English</option>
    </select>
  </header>
  <p class="muted">{$tr('app.placeholder')}</p>
</main>

<style>
  main {
    max-width: 960px;
    margin: 0 auto;
    padding: 16px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid var(--border);
  }
  h1 {
    font-size: 1.4rem;
  }
  .muted {
    color: var(--muted);
  }
</style>
