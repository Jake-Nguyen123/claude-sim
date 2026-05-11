<script lang="ts">
  import DeviceList from '$lib/DeviceList.svelte';
  import MirrorCanvas from '$lib/MirrorCanvas.svelte';
  import ActivityPanel from '$lib/ActivityPanel.svelte';
</script>

<div class="h-screen flex flex-col bg-bg text-fg">
  <header class="flex items-center justify-between px-4 py-2 border-b border-bg-border bg-bg-panel">
    <div class="flex items-center gap-3">
      <div class="w-6 h-6 rounded bg-accent grid place-items-center text-bg font-bold text-xs">cs</div>
      <h1 class="text-sm font-semibold">claude-sim</h1>
      <span class="text-xs text-fg-dim">v0.2.0-alpha.0</span>
    </div>
    <div class="flex items-center gap-2 text-xs text-fg-muted">
      <span class="px-2 py-0.5 rounded bg-bg-subtle">MCP: connected</span>
      <span class="px-2 py-0.5 rounded bg-bg-subtle">cockpit dev build</span>
    </div>
  </header>

  <main class="flex-1 grid grid-cols-[22%_1fr_28%] gap-2 p-2 min-h-0">
    <section class="panel flex flex-col min-h-0">
      <DeviceList />
    </section>

    <section class="panel flex flex-col min-h-0">
      <MirrorCanvas />
    </section>

    <section class="panel flex flex-col min-h-0">
      <ActivityPanel />
    </section>
  </main>

  <footer class="flex items-center justify-between px-4 py-1 border-t border-bg-border bg-bg-panel text-xs text-fg-dim">
    <span>Ready · No device selected</span>
    <span>Phase A scaffold · Svelte 5 + Tauri 2 + Tailwind</span>
  </footer>
</div>
