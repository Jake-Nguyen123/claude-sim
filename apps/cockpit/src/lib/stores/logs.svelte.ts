// Reactive store for device log lines streamed from the Cockpit backend.
//
// Subscribes to SSE /api/logs?udid=<udid>. Backend spawns `simctl spawn <udid>
// log stream` per booted device and multiplexes to the UI. Cap buffer at 2000
// lines to keep render smooth.

import { subscribe } from '$lib/api';

export type LogLine = {
  ts: number; // ms epoch
  level: 'debug' | 'info' | 'notice' | 'error' | 'fault' | string;
  subsystem?: string;
  category?: string;
  process?: string;
  message: string;
};

const MAX_LINES = 2000;

class LogsStore {
  lines = $state<LogLine[]>([]);
  filter = $state('');
  paused = $state(false);
  private source: EventSource | null = null;
  private currentUdid: string | null = null;

  get visible() {
    const f = this.filter.toLowerCase();
    if (!f) return this.lines;
    return this.lines.filter(
      (l) =>
        l.message.toLowerCase().includes(f) ||
        (l.subsystem ?? '').toLowerCase().includes(f) ||
        (l.process ?? '').toLowerCase().includes(f)
    );
  }

  start(udid: string) {
    if (this.currentUdid === udid && this.source) return;
    this.stop();
    this.currentUdid = udid;
    try {
      this.source = subscribe(`/api/logs?udid=${encodeURIComponent(udid)}`);
      this.source.onmessage = (e) => {
        if (this.paused) return;
        try {
          const line = JSON.parse(e.data) as LogLine;
          this.lines = [...this.lines, line].slice(-MAX_LINES);
        } catch {
          /* ignore */
        }
      };
    } catch (e) {
      console.warn('[logs store] subscribe failed', e);
    }
  }

  stop() {
    this.source?.close();
    this.source = null;
    this.currentUdid = null;
  }

  clear() {
    this.lines = [];
  }
}

export const logsStore = new LogsStore();
