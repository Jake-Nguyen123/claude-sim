// Typed fetch wrapper for the Cockpit's local Rust backend.
//
// The Rust core spawns an axum HTTP+SSE server on localhost:8765 (configurable
// via tauri.conf.json env, default 8765). All UI ↔ backend traffic flows here
// (mirror MJPEG, device control, input dispatch, logs/mcp/build SSE).

export const API_BASE = 'http://127.0.0.1:8765';
export const MIRROR_URL = `${API_BASE}/mirror.mjpg`;

export type Device = {
  udid: string;
  name: string;
  runtime: string;
  state: 'Booted' | 'Shutdown' | 'Booting' | 'Shutting Down' | string;
};

export type HealthStatus = {
  ok: boolean;
  version: string;
  helpers: { sim_capture: boolean; sim_input: boolean };
  mcp_attached: boolean;
};

async function jfetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${path} → HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => jfetch<HealthStatus>('/api/health'),

  listDevices: () => jfetch<{ devices: Device[] }>('/api/devices'),
  bootDevice: (udid: string) =>
    jfetch<{ ok: true; already_booted?: boolean }>(`/api/devices/${udid}/boot`, { method: 'POST' }),
  shutdownDevice: (udid: string) =>
    jfetch<{ ok: true }>(`/api/devices/${udid}/shutdown`, { method: 'POST' }),

  tap: (udid: string, x: number, y: number, holdMs = 80) =>
    jfetch<{ ok: true }>('/api/input/tap', {
      method: 'POST',
      body: JSON.stringify({ udid, x, y, hold_ms: holdMs })
    }),
  swipe: (udid: string, x1: number, y1: number, x2: number, y2: number, durationMs = 200) =>
    jfetch<{ ok: true }>('/api/input/swipe', {
      method: 'POST',
      body: JSON.stringify({ udid, x1, y1, x2, y2, duration_ms: durationMs })
    }),
  keyTap: (udid: string, usage: number, modifiers: number[] = []) =>
    jfetch<{ ok: true }>('/api/input/key-tap', {
      method: 'POST',
      body: JSON.stringify({ udid, usage, modifiers })
    }),
  buttonTap: (udid: string, name: 'home' | 'lock' | 'side' | 'siri' | 'applepay') =>
    jfetch<{ ok: true }>('/api/input/button-tap', {
      method: 'POST',
      body: JSON.stringify({ udid, name })
    })
};

// SSE subscription helper. Returns an EventSource you can attach .onmessage to.
export function subscribe(path: string): EventSource {
  return new EventSource(API_BASE + path);
}
