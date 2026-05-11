<script lang="ts">
  // Phase A stub — will stream MJPEG from /mirror.mjpg in Phase B.
  let connected = $state(false);
</script>

<div class="panel-header flex items-center justify-between">
  <span>Mirror</span>
  <div class="flex items-center gap-1 text-xs">
    <span class="text-fg-dim">{connected ? '60 fps' : 'no signal'}</span>
  </div>
</div>

<div class="flex-1 grid place-items-center min-h-0 p-4 relative">
  {#if connected}
    <!-- Phase B: <img src="http://localhost:8765/mirror.mjpg" /> -->
    <div class="text-fg-muted">MJPEG stream placeholder</div>
  {:else}
    <div class="text-center space-y-3 max-w-sm">
      <div class="text-6xl text-fg-dim">📱</div>
      <h2 class="text-lg font-semibold">No simulator booted</h2>
      <p class="text-sm text-fg-muted">
        Pick a device from the left and boot it. The live mirror will appear here.
        Click anywhere to tap. Drag to swipe. Type to input text.
      </p>
    </div>
  {/if}
</div>

<!-- Hardware button row -->
<div class="border-t border-bg-border p-2 flex items-center justify-center gap-1.5">
  <button class="btn text-xs" disabled>⌂ Home</button>
  <button class="btn text-xs" disabled>⏻ Lock</button>
  <button class="btn text-xs" disabled>🔊 Vol</button>
  <button class="btn text-xs" disabled>🎤 Siri</button>
  <button class="btn text-xs" disabled>📷 Screenshot</button>
  <button class="btn text-xs" disabled>● Record</button>
</div>
