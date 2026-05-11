<script lang="ts">
  import { deviceStore } from '$lib/stores/devices.svelte';

  function shortRuntime(r: string) {
    const m = r.match(/iOS-(\d+)-(\d+)/);
    if (m) return `iOS ${m[1]}.${m[2]}`;
    return r;
  }
</script>

<footer class="flex items-center justify-between px-4 py-1 border-t border-bg-border bg-bg-panel text-xs text-fg-dim">
  <span>
    {#if deviceStore.error}
      <span class="text-red-400">Backend offline</span>
    {:else if deviceStore.selected && deviceStore.selected.state === 'Booted'}
      <span class="text-green-400">● Live</span>
      <span class="text-fg-muted ml-1">{deviceStore.selected.name} · {shortRuntime(deviceStore.selected.runtime)}</span>
    {:else if deviceStore.selected}
      <span class="text-fg-muted">{deviceStore.selected.name} · {deviceStore.selected.state}</span>
    {:else}
      <span>Ready · pick a device</span>
    {/if}
  </span>
  <span>claude-sim v0.2.0-alpha · Phase B (mirror + input)</span>
</footer>
