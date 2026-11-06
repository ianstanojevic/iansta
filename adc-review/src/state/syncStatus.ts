/**
 * Progress of a running sync, kept outside React so it survives the view
 * switching from the welcome screen to the overview once the first game lands.
 */
import { useSyncExternalStore } from 'react';

export interface SyncStatus {
  running: boolean;
  phase: string;
  done: number;
  total: number;
  error: string | null;
  result: string | null;
  cancelRequested: boolean;
  /** The server asked for the app password (APP_PASSWORD). */
  needsPassword: boolean;
}

let status: SyncStatus = { running: false, phase: '', done: 0, total: 0, error: null, result: null, cancelRequested: false, needsPassword: false };
const listeners = new Set<() => void>();

export const getSyncStatus = () => status;

export function setSyncStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

export function useSyncStatus() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}
