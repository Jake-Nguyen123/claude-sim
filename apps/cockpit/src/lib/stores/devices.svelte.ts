// Svelte 5 runes-based reactive store for device list.
//
// Polls /api/devices every 4s. Use selectedUdid for the active device the
// MirrorCanvas + input handlers point at.

import { api, type Device } from '$lib/api';

class DeviceStore {
  devices = $state<Device[]>([]);
  selectedUdid = $state<string | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);
  private timer: number | null = null;

  get booted() {
    return this.devices.filter((d) => d.state === 'Booted');
  }
  get selected() {
    return this.devices.find((d) => d.udid === this.selectedUdid) ?? null;
  }

  async refresh() {
    this.loading = true;
    try {
      const { devices } = await api.listDevices();
      this.devices = devices;
      this.error = null;
      // Auto-select first booted device if nothing selected.
      if (!this.selectedUdid && this.booted.length > 0) {
        this.selectedUdid = this.booted[0].udid;
      }
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.loading = false;
    }
  }

  async boot(udid: string) {
    await api.bootDevice(udid);
    await this.refresh();
    this.selectedUdid = udid;
  }

  async shutdown(udid: string) {
    await api.shutdownDevice(udid);
    await this.refresh();
  }

  startPolling(intervalMs = 4000) {
    if (this.timer !== null) return;
    this.refresh();
    this.timer = window.setInterval(() => this.refresh(), intervalMs);
  }

  stopPolling() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const deviceStore = new DeviceStore();
