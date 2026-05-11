<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { mcpStore } from '$lib/stores/mcp.svelte';
  import { logsStore } from '$lib/stores/logs.svelte';
  import { deviceStore } from '$lib/stores/devices.svelte';

  let tab = $state<'logs' | 'mcp' | 'build'>('mcp');

  onMount(() => mcpStore.start());
  onDestroy(() => {
    mcpStore.stop();
    logsStore.stop();
  });

  // Restart log stream when selected device changes.
  $effect(() => {
    const sel = deviceStore.selected;
    if (sel?.state === 'Booted') {
      logsStore.start(sel.udid);
    } else {
      logsStore.stop();
    }
  });

  function fmtTime(ms: number) {
    const d = new Date(ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  }
  function pad(n: number, len = 2) {
    return String(n).padStart(len, '0');
  }
  function summarize(s: string, max = 80) {
    if (s.length <= max) return s;
    return s.slice(0, max) + '…';
  }
</script>

<div class="panel-header flex items-center gap-1 !py-1.5">
  {#each ['logs', 'mcp', 'build'] as t}
    <button
      class="px-2 py-0.5 rounded text-xs transition-colors {tab === t ? 'bg-bg-subtle text-fg' : 'text-fg-muted hover:text-fg'}"
      onclick={() => (tab = t as typeof tab)}
    >{t === 'mcp' ? 'MCP Activity' : t === 'logs' ? 'Logs' : 'Build'}</button>
  {/each}
  <span class="flex-1"></span>
  {#if tab === 'mcp' && mcpStore.events.length > 0}
    <button class="text-xs text-fg-muted hover:text-fg" title="Clear" onclick={() => mcpStore.clear()}>✕</button>
  {/if}
  {#if tab === 'logs'}
    <input
      class="bg-bg-subtle border border-bg-border rounded px-2 py-0.5 text-xs w-24 focus:outline-none focus:border-accent"
      placeholder="filter…"
      bind:value={logsStore.filter}
    />
  {/if}
</div>

<div class="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed min-h-0">
  {#if tab === 'logs'}
    {#if !deviceStore.selected}
      <div class="text-fg-dim">Select a device to stream logs.</div>
    {:else if deviceStore.selected.state !== 'Booted'}
      <div class="text-fg-dim">Boot {deviceStore.selected.name} to stream logs.</div>
    {:else if logsStore.visible.length === 0}
      <div class="text-fg-dim">Waiting for log events from {deviceStore.selected.name}…</div>
    {:else}
      <div class="space-y-0.5">
        {#each logsStore.visible.slice(-300) as line}
          <div class="flex gap-2">
            <span class="text-fg-dim shrink-0">{fmtTime(line.ts)}</span>
            <span class="text-accent-300 shrink-0">{(line.subsystem ?? '').slice(-20)}</span>
            <span class="text-fg break-all">{line.message}</span>
          </div>
        {/each}
      </div>
    {/if}

  {:else if tab === 'mcp'}
    {#if mcpStore.events.length === 0}
      <div class="text-fg-muted space-y-1.5">
        <div>Waiting for Claude Code to call claude-sim MCP tools…</div>
        <div class="opacity-60 italic">Tip: run <span class="text-accent">claude</span> in a terminal with claude-sim registered. Tool calls will stream here.</div>
      </div>
    {:else}
      <div class="space-y-2">
        {#each mcpStore.events as ev (ev.id)}
          <div class="border-l-2 pl-2 {ev.status === 'error' ? 'border-red-500' : ev.status === 'pending' ? 'border-yellow-500' : 'border-green-500'}">
            <div class="flex items-center gap-2">
              <span class="text-fg-dim">{fmtTime(ev.ts)}</span>
              <span class="text-accent font-semibold">{ev.tool}</span>
              {#if ev.duration_ms !== undefined}
                <span class="text-fg-dim">{ev.duration_ms}ms</span>
              {/if}
              {#if ev.status !== 'ok'}
                <span class="text-xs uppercase tracking-wide {ev.status === 'error' ? 'text-red-400' : 'text-yellow-400'}">{ev.status}</span>
              {/if}
            </div>
            <div class="text-fg-muted ml-1">→ {summarize(ev.args_summary)}</div>
            {#if ev.result_summary}
              <div class="text-fg-dim ml-1">← {summarize(ev.result_summary)}</div>
            {/if}
            {#if ev.error}
              <div class="text-red-400 ml-1">{summarize(ev.error, 200)}</div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

  {:else}
    <div class="text-fg-dim space-y-1">
      <div>No build in progress.</div>
      <div class="opacity-60 italic">Click "Build &amp; Run" in the left panel (Phase D wires this up).</div>
    </div>
  {/if}
</div>
