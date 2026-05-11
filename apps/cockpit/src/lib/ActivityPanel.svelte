<script lang="ts">
  // Phase A stub — will receive SSE from /api/logs and /api/mcp-events in Phase E.
  let tab = $state<'logs' | 'mcp' | 'build'>('mcp');
</script>

<div class="panel-header flex items-center gap-1 !py-1.5">
  <button
    class="px-2 py-0.5 rounded text-xs transition-colors {tab === 'logs' ? 'bg-bg-subtle text-fg' : 'text-fg-muted hover:text-fg'}"
    onclick={() => tab = 'logs'}
  >Logs</button>
  <button
    class="px-2 py-0.5 rounded text-xs transition-colors {tab === 'mcp' ? 'bg-bg-subtle text-fg' : 'text-fg-muted hover:text-fg'}"
    onclick={() => tab = 'mcp'}
  >MCP Activity</button>
  <button
    class="px-2 py-0.5 rounded text-xs transition-colors {tab === 'build' ? 'bg-bg-subtle text-fg' : 'text-fg-muted hover:text-fg'}"
    onclick={() => tab = 'build'}
  >Build</button>
</div>

<div class="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed min-h-0">
  {#if tab === 'logs'}
    <div class="text-fg-dim space-y-1">
      <div>[--:--:--] No device selected. Logs will stream here when a sim boots.</div>
    </div>
  {:else if tab === 'mcp'}
    <div class="text-fg-dim space-y-1.5">
      <div class="text-fg-muted">Waiting for Claude Code to call claude-sim MCP tools…</div>
      <div class="opacity-60 italic">Tip: run <span class="text-accent">claude</span> in a terminal with claude-sim registered. Tool calls will stream here.</div>
    </div>
  {:else}
    <div class="text-fg-dim">
      <div>No build in progress.</div>
      <div class="mt-1 opacity-60 italic">Click "Build & Run" in the left panel after picking a project.</div>
    </div>
  {/if}
</div>
