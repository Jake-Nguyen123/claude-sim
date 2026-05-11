<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { deviceStore } from '$lib/stores/devices.svelte';
  import { projectStore } from '$lib/stores/project.svelte';
  import { buildStore } from '$lib/stores/build.svelte';
  import type { Device } from '$lib/api';

  onMount(() => deviceStore.startPolling());
  onDestroy(() => deviceStore.stopPolling());

  let projectPathInput = $state('');

  async function openProject() {
    const path = window.prompt('Path to folder containing .xcodeproj or .xcworkspace:', projectPathInput || '/Users/ospreymac/');
    if (!path) return;
    projectPathInput = path;
    await projectStore.open(path);
  }

  async function buildAndRun() {
    const info = projectStore.info;
    const scheme = projectStore.selectedScheme;
    const dev = deviceStore.booted[0] ?? deviceStore.selected;
    if (!info || !scheme || !dev) return;
    if (dev.state !== 'Booted') {
      await deviceStore.boot(dev.udid);
    }
    await buildStore.start({
      project_path: info.path,
      project_type: info.project_type,
      scheme,
      udid: dev.udid,
      launch: true
    });
  }

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

  {#each deviceStore.sortedForDisplay as device (device.udid)}
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
  {#if projectStore.error}
    <div class="text-xs text-red-400 break-all">{projectStore.error}</div>
  {/if}
  {#if projectStore.info}
    <div class="text-xs">
      <div class="font-semibold text-fg">{projectStore.info.name}</div>
      <div class="font-mono text-fg-dim truncate" title={projectStore.info.path}>{projectStore.info.path}</div>
    </div>
    <div>
      <label class="block text-xs text-fg-muted mb-1" for="scheme-sel">Scheme</label>
      <select
        id="scheme-sel"
        class="w-full bg-bg-subtle border border-bg-border rounded px-2 py-1 text-xs focus:outline-none focus:border-accent"
        bind:value={projectStore.selectedScheme}
        disabled={buildStore.status === 'running'}
      >
        {#each projectStore.info.schemes as scheme}
          <option value={scheme}>{scheme}</option>
        {/each}
      </select>
    </div>
  {:else if projectStore.loading}
    <div class="text-xs text-fg-muted">Detecting project…</div>
  {:else}
    <div class="text-xs text-fg-muted">
      <div class="font-mono text-fg-dim">No project opened</div>
      <div class="mt-1">Pick a folder with an .xcodeproj or .xcworkspace</div>
    </div>
  {/if}
  <button class="btn w-full text-xs" onclick={openProject} disabled={buildStore.status === 'running'}>
    {projectStore.info ? 'Switch project…' : 'Open project…'}
  </button>
  <button
    class="btn-accent w-full text-xs"
    onclick={buildAndRun}
    disabled={!projectStore.info || !projectStore.selectedScheme || buildStore.status === 'running' || deviceStore.booted.length === 0}
  >
    {#if buildStore.status === 'running'}
      ⏳ {buildStore.phase ?? 'Building'}…
    {:else if buildStore.status === 'ok'}
      ✅ Build &amp; Run ({(buildStore.duration_ms / 1000).toFixed(1)}s) — run again
    {:else if buildStore.status === 'error'}
      ❌ Build failed — try again
    {:else}
      ▶ Build &amp; Run
    {/if}
  </button>
  {#if !deviceStore.booted.length && projectStore.info}
    <div class="text-xs text-yellow-400 text-center">Boot a simulator first</div>
  {/if}
</div>
