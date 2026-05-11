// Reactive store for the current build job. One active build at a time
// (matches Xcode's mental model). Streams progress events via SSE.

import { API_BASE, subscribe, api, type BuildRequestBody } from '$lib/api';

export type BuildEvent =
  | { type: 'started'; build_id: string; scheme: string; udid: string }
  | { type: 'phase'; name: 'settings' | 'build' | 'install' | 'launch' }
  | { type: 'progress'; line: string }
  | {
      type: 'diagnostic';
      severity: 'error' | 'warning';
      file?: string;
      line?: number;
      col?: number;
      message: string;
    }
  | {
      type: 'finished';
      status: 'ok' | 'error';
      app_path?: string;
      bundle_id?: string;
      pid?: number;
      duration_ms: number;
      error?: string;
    };

export type Diagnostic = Extract<BuildEvent, { type: 'diagnostic' }>;

class BuildStore {
  buildId = $state<string | null>(null);
  phase = $state<string | null>(null);
  status = $state<'idle' | 'running' | 'ok' | 'error'>('idle');
  duration_ms = $state(0);
  lines = $state<string[]>([]);
  diagnostics = $state<Diagnostic[]>([]);
  finalError = $state<string | null>(null);
  appPath = $state<string | null>(null);
  bundleId = $state<string | null>(null);
  private source: EventSource | null = null;

  reset() {
    this.buildId = null;
    this.phase = null;
    this.status = 'idle';
    this.duration_ms = 0;
    this.lines = [];
    this.diagnostics = [];
    this.finalError = null;
    this.appPath = null;
    this.bundleId = null;
    this.source?.close();
    this.source = null;
  }

  get errors() {
    return this.diagnostics.filter((d) => d.severity === 'error');
  }
  get warnings() {
    return this.diagnostics.filter((d) => d.severity === 'warning');
  }

  async start(body: BuildRequestBody) {
    this.reset();
    this.status = 'running';
    try {
      const { build_id } = await api.startBuild(body);
      this.buildId = build_id;
      this.subscribeEvents(build_id);
    } catch (e) {
      this.status = 'error';
      this.finalError = (e as Error).message;
    }
  }

  private subscribeEvents(buildId: string) {
    const url = `/api/build/${buildId}/events`;
    this.source = subscribe(url);
    this.source.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as BuildEvent;
        this.handle(evt);
      } catch {
        /* ignore parse errors */
      }
    };
    this.source.onerror = () => {
      // SSE will retry; if build is done we'll close anyway.
    };
  }

  private handle(evt: BuildEvent) {
    switch (evt.type) {
      case 'started':
        this.buildId = evt.build_id;
        this.status = 'running';
        break;
      case 'phase':
        this.phase = evt.name;
        break;
      case 'progress':
        this.lines = [...this.lines, evt.line].slice(-2000);
        break;
      case 'diagnostic':
        this.diagnostics = [...this.diagnostics, evt];
        break;
      case 'finished':
        this.status = evt.status;
        this.duration_ms = evt.duration_ms;
        this.appPath = evt.app_path ?? null;
        this.bundleId = evt.bundle_id ?? null;
        this.finalError = evt.error ?? null;
        this.source?.close();
        this.source = null;
        break;
    }
  }
}

export const buildStore = new BuildStore();
