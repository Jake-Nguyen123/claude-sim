<script lang="ts">
  import { deviceStore } from '$lib/stores/devices.svelte';
  import { api, MIRROR_URL } from '$lib/api';

  let img = $state<HTMLImageElement | null>(null);
  let imgFailed = $state(false);

  // Active device tracking — clear failed flag when device changes.
  $effect(() => {
    const _ = deviceStore.selectedUdid;
    imgFailed = false;
  });

  // Reactive: re-evaluate when selected device changes (not on every render).
  const src = $derived.by(() => {
    const sel = deviceStore.selected;
    if (!sel || sel.state !== 'Booted') return null;
    return `${MIRROR_URL}?udid=${encodeURIComponent(sel.udid)}`;
  });

  function imgToNormalized(e: MouseEvent): { x: number; y: number } | null {
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }

  // Click → tap. Drag (mousedown → move → mouseup with displacement) → swipe.
  let dragStart: { x: number; y: number; t: number } | null = null;

  function onMouseDown(e: MouseEvent) {
    const p = imgToNormalized(e);
    if (!p) return;
    dragStart = { ...p, t: performance.now() };
  }

  async function onMouseUp(e: MouseEvent) {
    const end = imgToNormalized(e);
    const start = dragStart;
    dragStart = null;
    if (!end || !start) return;
    const sel = deviceStore.selected;
    if (!sel) return;

    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    const dist = Math.hypot(dx, dy);
    const duration = performance.now() - start.t;

    try {
      if (dist > 0.03 || duration > 400) {
        // Treat as swipe — duration in ms based on user's drag speed
        await api.swipe(sel.udid, start.x, start.y, end.x, end.y, Math.min(800, Math.max(120, duration)));
      } else {
        await api.tap(sel.udid, start.x, start.y);
      }
    } catch (err) {
      console.warn('input failed', err);
    }
  }

  async function onHardware(name: 'home' | 'lock' | 'side' | 'siri' | 'applepay') {
    const sel = deviceStore.selected;
    if (!sel) return;
    try {
      await api.buttonTap(sel.udid, name);
    } catch (err) {
      console.warn(err);
    }
  }

  // Keyboard input — only when MirrorCanvas region is focused.
  function onKeyDown(e: KeyboardEvent) {
    const sel = deviceStore.selected;
    if (!sel) return;
    const usage = keyToUsage(e.key);
    if (!usage) return;
    e.preventDefault();
    api.keyTap(sel.udid, usage.usage, usage.shift ? [225] : []).catch(console.warn);
  }

  // Minimal HID map. Phase B is intentionally small; type_text via MCP for full coverage.
  function keyToUsage(k: string): { usage: number; shift?: boolean } | null {
    if (k.length === 1) {
      const code = k.charCodeAt(0);
      if (code >= 97 && code <= 122) return { usage: 4 + (code - 97) };
      if (code >= 65 && code <= 90) return { usage: 4 + (code - 65), shift: true };
      if (code >= 49 && code <= 57) return { usage: 30 + (code - 49) };
      if (code === 48) return { usage: 39 };
      if (k === ' ') return { usage: 44 };
    }
    if (k === 'Enter') return { usage: 40 };
    if (k === 'Backspace') return { usage: 42 };
    if (k === 'Tab') return { usage: 43 };
    if (k === 'Escape') return { usage: 41 };
    return null;
  }
</script>

<div class="panel-header flex items-center justify-between">
  <span>Mirror</span>
  <div class="flex items-center gap-1 text-xs">
    {#if !src}
      <span class="text-fg-dim">no signal</span>
    {:else if imgFailed}
      <span class="text-red-400">backend offline</span>
    {:else}
      <span class="text-green-400">● live</span>
    {/if}
  </div>
</div>

<div
  class="flex-1 flex items-center justify-center min-h-0 min-w-0 p-4 relative outline-none overflow-hidden focus:bg-bg-subtle/30"
  role="region"
  tabindex="0"
  aria-label="Simulator mirror — click to tap, drag to swipe, type to input"
  onkeydown={onKeyDown}
>
  {#if src && !imgFailed}
    <img
      bind:this={img}
      {src}
      alt="iOS Simulator live mirror"
      class="block cursor-crosshair select-none rounded-md shadow-2xl"
      style="max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain;"
      draggable={false}
      onmousedown={onMouseDown}
      onmouseup={onMouseUp}
      onerror={() => (imgFailed = true)}
    />
  {:else}
    <div class="text-center space-y-3 max-w-sm">
      <div class="text-6xl text-fg-dim">📱</div>
      {#if !deviceStore.selected}
        <h2 class="text-lg font-semibold">No device selected</h2>
        <p class="text-sm text-fg-muted">Pick a simulator from the left panel.</p>
      {:else if deviceStore.selected.state !== 'Booted'}
        <h2 class="text-lg font-semibold">{deviceStore.selected.name} is not booted</h2>
        <p class="text-sm text-fg-muted">Boot it from the left panel to start the mirror.</p>
      {:else if imgFailed}
        <h2 class="text-lg font-semibold">Mirror backend offline</h2>
        <p class="text-sm text-fg-muted">
          The Rust core isn't serving <code class="text-accent">/mirror.mjpg</code> yet.
          Phase B (in progress) wires the sim-capture → HTTP stream.
        </p>
      {/if}
    </div>
  {/if}
</div>

<!-- Hardware button row -->
<div class="border-t border-bg-border p-2 flex items-center justify-center gap-1.5">
  <button class="btn text-xs" onclick={() => onHardware('home')}>⌂ Home</button>
  <button class="btn text-xs" onclick={() => onHardware('lock')}>⏻ Lock</button>
  <button class="btn text-xs" onclick={() => onHardware('side')}>◷ Side</button>
  <button class="btn text-xs" onclick={() => onHardware('siri')}>🎤 Siri</button>
  <button class="btn text-xs" disabled>📷 Screenshot</button>
  <button class="btn text-xs" disabled>● Record</button>
</div>
