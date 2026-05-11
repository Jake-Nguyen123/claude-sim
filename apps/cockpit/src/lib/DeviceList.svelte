<script lang="ts">
  // Phase A stub — will fetch real device list from /api/devices in Phase C.
  type Device = {
    udid: string;
    name: string;
    runtime: string;
    state: 'Booted' | 'Shutdown';
  };
  const placeholder: Device[] = [
    { udid: 'C833...', name: 'iPhone 17', runtime: 'iOS 26.4', state: 'Shutdown' },
    { udid: '4213...', name: 'iPhone 17 Pro', runtime: 'iOS 26.4', state: 'Shutdown' },
    { udid: '5160...', name: 'iPad Pro 11"', runtime: 'iOS 26.4', state: 'Shutdown' }
  ];
  let selected = $state<string | null>(null);
</script>

<div class="panel-header flex items-center justify-between">
  <span>Devices</span>
  <button class="text-fg-muted hover:text-fg" title="Refresh">↻</button>
</div>

<div class="flex-1 overflow-y-auto p-2 space-y-1">
  {#each placeholder as device}
    <button
      class="device-item w-full text-left"
      class:device-item-active={selected === device.udid}
      onclick={() => selected = device.udid}
    >
      <span class="text-fg-dim">{device.state === 'Booted' ? '🟢' : '⚪'}</span>
      <div class="flex-1 min-w-0">
        <div class="truncate">{device.name}</div>
        <div class="text-xs text-fg-dim truncate">{device.runtime}</div>
      </div>
    </button>
  {/each}
</div>

<div class="border-t border-bg-border p-3 space-y-2">
  <div class="panel-header !border-0 !p-0">Project</div>
  <div class="text-xs text-fg-muted">
    <div class="font-mono text-fg-dim">/path/to/project</div>
    <div class="mt-1">Not detected — open a project</div>
  </div>
  <button class="btn w-full text-xs">Open project…</button>
  <button class="btn-accent w-full text-xs" disabled>▶ Build & Run</button>
</div>
