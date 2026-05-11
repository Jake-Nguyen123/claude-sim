// Reactive store for currently-opened Xcode project + selected scheme.

import { api, type ProjectInfo } from '$lib/api';

const LS_KEY = 'claude-sim.last-project';

class ProjectStore {
  info = $state<ProjectInfo | null>(null);
  selectedScheme = $state<string | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);

  constructor() {
    // Restore last-opened project on mount.
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(LS_KEY);
      if (saved) {
        this.open(saved).catch(() => {
          window.localStorage.removeItem(LS_KEY);
        });
      }
    }
  }

  async open(path: string) {
    this.loading = true;
    this.error = null;
    try {
      const info = await api.detectProject(path);
      this.info = info;
      if (info.schemes.length > 0) this.selectedScheme = info.schemes[0];
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(LS_KEY, path.replace(/\/[^/]+\.(xcodeproj|xcworkspace)$/, ''));
      }
    } catch (e) {
      this.error = (e as Error).message;
      this.info = null;
    } finally {
      this.loading = false;
    }
  }

  close() {
    this.info = null;
    this.selectedScheme = null;
    this.error = null;
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(LS_KEY);
    }
  }
}

export const projectStore = new ProjectStore();
