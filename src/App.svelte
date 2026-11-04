<script lang="ts">
  import { onMount } from 'svelte';

  type Theme = 'light' | 'dark' | 'system';
  let theme = $state<Theme>('light');
  let systemDark = $state(false);

  onMount(() => {
    try {
      const saved = localStorage.getItem('bracketeer.theme');
      if (saved === 'light' || saved === 'dark' || saved === 'system')
        theme = saved;
    } catch {
      // The app also works when browser storage is unavailable.
    }
    const media = matchMedia('(prefers-color-scheme: dark)');
    systemDark = media.matches;
    const update = () => (systemDark = media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });

  $effect(() => {
    document.documentElement.dataset.theme =
      theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  });

  function chooseTheme(event: Event) {
    theme = (event.currentTarget as HTMLSelectElement).value as Theme;
    try {
      localStorage.setItem('bracketeer.theme', theme);
    } catch {
      // Keep the selection for this visit if storage is unavailable.
    }
  }
</script>

<main>
  <header>
    <h1>bracketeer</h1>
    <label>
      Theme
      <select value={theme} onchange={chooseTheme}>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </label>
  </header>
  <p>Standard-bracketed LA-ICP-MS run sequences for Qtegra.</p>
  <p>The sequence editor arrives in milestone 3.</p>
</main>
