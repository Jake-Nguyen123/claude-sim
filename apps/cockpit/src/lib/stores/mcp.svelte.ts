// Reactive store for MCP activity events streamed from the Cockpit backend.
//
// Subscribes to SSE /api/mcp-events. Each event = one tool call by Claude Code
// (or any other MCP client). Backend captures these by hooking into the MCP
// server's pre-response middleware (planned for Phase E).

import { subscribe } from '$lib/api';

export type McpEvent = {
  id: string;
  ts: number; // ms epoch
  tool: string;
  args_summary: string; // first 80 chars of args JSON
  duration_ms?: number;
  status: 'pending' | 'ok' | 'error';
  result_summary?: string;
  error?: string;
};

class McpStore {
  events = $state<McpEvent[]>([]);
  private source: EventSource | null = null;

  start() {
    if (this.source) return;
    try {
      this.source = subscribe('/api/mcp-events');
      this.source.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data) as McpEvent;
          // Update-in-place if event id already exists (pending → ok/error)
          const idx = this.events.findIndex((x) => x.id === evt.id);
          if (idx >= 0) {
            this.events[idx] = evt;
          } else {
            this.events = [evt, ...this.events].slice(0, 200); // cap at 200
          }
        } catch {
          /* ignore parse error */
        }
      };
      this.source.onerror = () => {
        // SSE silently retries; nothing to do.
      };
    } catch (e) {
      console.warn('[mcp store] subscribe failed', e);
    }
  }

  stop() {
    this.source?.close();
    this.source = null;
  }

  clear() {
    this.events = [];
  }
}

export const mcpStore = new McpStore();
