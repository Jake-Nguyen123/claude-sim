<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { deviceStore } from '$lib/stores/devices.svelte';
  import type { Device } from '$lib/api';

  onMount(() => deviceStore.startPolling());
  onDestroy(() => deviceStore.stopPolling());

  function bootedIcon(state: Device['state']) {
    return state === 'Booted' ? '🟢' : state === 'Booting' ? '🟡' : '⚪';
  }

  function shortRuntime(r: string) {
    // "com.apple.CoreSimulator.SimRuntime.iOS-26-4" → "iOS 26.4"
    const m = r.match(/iOS-(\d+)-(\d+)/);
    if (m) return `iOS ${m[1]}.${m[2]}`;
    return r.replace('com.apple.CoreSimulator.SimRuntime.', '').replace(/-/g, ' ');
  }

  async function onBoot(d: Device, e: MouseEvent) {
    e.stopPropagation();
    try {
      await deviceStore.boot(d.udid);
    } catch (err) {
      console.error(err);
      alert(`Boot failed: ${(err as Error).message}`);
    }
  }

  async function onShutdown(d: Device, e: MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Shutdown ${d.name}?`)) return;
    try {
      await deviceStore.shutdown(d.udid);
    } catch (err) {
      console.error(err);
    }
  }
</script>

<div class="panel-header flex items-center justify-between">
  <span>Devices</span>
  <button
    class="text-fg-muted hover:text-fg disabled:opacity-50"
    title="Refresh"
    onclick={() => deviceStore.refresh()}
    disabled={deviceStore.loading}
  >↻</button>
</div>

<div class="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
  {#if deviceStore.error}
    <div class="text-xs text-red-400 p-2 bg-red-950/30 rounded">
      Backend not reachable.
      <div class="mt-1 opacity-70">Make sure the Rust core is running (it serves on localhost:8765).</div>
    </div>
  {:else if deviceStore.loading && deviceStore.devices.length === 0}
    <div class="text-xs text-fg-dim p-2">Loading devices…</div>
  {:else if deviceStore.devices.length === 0}
    <div class="text-xs text-fg-dim p-2">No simulators available. Install at least one iOS runtime via Xcode.</div>
  {/if}

  {#each deviceStore.devices as device (device.udid)}
    <div
      role="button"
      tabindex="0"
      class="device-item w-full text-left group"
      class:device-item-active={deviceStore.selectedUdid === device.udid}
      onclick={() => (deviceStore.selectedUdid = device.udid)}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (deviceStore.selectedUdid = device.udid)}
    >
      <span class="text-fg-dim">{bootedIcon(device.state)}</span>
      <div class="flex-1 min-w-0">
        <div class="truncate">{device.name}</div>
        <div class="text-xs text-fg-dim truncate">{shortRuntime(device.runtime)}</div>
      </div>
      <div class="opacity-0 group-hover:opacity-100 flex gap-1">
        {#if device.state === 'Booted'}
          <button
            class="text-xs text-fg-muted hover:text-red-400"
            title="Shutdown"
            onclick={(e) => onShutdown(device, e)}
          >⏻</button>
        {:else}
          <button
            class="text-xs text-fg-muted hover:text-accent"
            title="Boot"
            onclick={(e) => onBoot(device, e)}
          >▶</button>
        {/if}
      </div>
    </div>
  {/each}
</div>

<div class="border-t border-bg-border p-3 space-y-2">
  <div class="panel-header !border-0 !p-0">Project</div>
  <div class="text-xs text-fg-muted">
    <div class="font-mono text-fg-dim truncate">No project opened</div>
    <div class="mt-1">Pick a folder with an .xcodeproj or .xcworkspace</div>
  </div>
  <button class="btn w-full text-xs" disabled>Open project…</button>
  <button class="btn-accent w-full text-xs" disabled>▶ Build &amp; Run</button>
  <div class="text-xs text-fg-dim text-center opacity-60">Phase D wires up build/run</div>
</div>
