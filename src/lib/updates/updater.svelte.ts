import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { scheduleUpdateChecks } from './scheduler';
import {
  loadPrefs,
  whatsNew,
  releaseNotesUrl,
  savePrefs,
  UNSUPPORTED_FOLDER_REASON,
  transition,
  type UpdateStatus,
  type UpdateInfo,
  type UpdateEvent,
  type UpdatePrefs,
} from './updates';

export const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const WEB_REASON = 'Updates come with the desktop app.';
const PORTABLE_REASON = UNSUPPORTED_FOLDER_REASON;
const storage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
};
const bundledNotes = import.meta.glob<string>('/release-notes/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});
export const updater = $state({
  status: { kind: 'idle' } as UpdateStatus,
  prefs: loadPrefs(storage),
  version: __APP_VERSION__,
  justChecked: false,
  whatsNewOpen: false,
  currentNotes: '',
});
let flashTimer: ReturnType<typeof setTimeout>;
let previewTimer: ReturnType<typeof setTimeout>;
let previewOutcome: UpdateStatus | undefined;
let support: Promise<boolean> | undefined;
const supported = () =>
  (support ??= isTauri
    ? invoke<boolean>('update_supported')
    : Promise.resolve(false));
function send(event: UpdateEvent) {
  updater.status = transition(updater.status, event);
}
function failure(error: unknown) {
  send({
    type: 'failure',
    message: String(error),
  });
}
export function setPrefs(prefs: Partial<UpdatePrefs>) {
  updater.prefs = { ...updater.prefs, ...prefs };
  savePrefs(storage, updater.prefs);
}
function record(result: string) {
  setPrefs({ lastCheck: Date.now(), lastResult: result });
}

export async function check(manual = false) {
  if (!isTauri && !previewOutcome) return;
  const next = transition(updater.status, { type: 'check', manual });
  if (next === updater.status) return;
  updater.justChecked = false;
  updater.status = next;
  if (previewOutcome) {
    const outcome = previewOutcome;
    previewTimer = setTimeout(() => {
      updater.status =
        outcome.kind === 'idle'
          ? { kind: 'none', checkedAt: Date.now() }
          : outcome;
      updater.justChecked = manual && updater.status.kind === 'none';
    }, 600);
    return;
  }
  try {
    const canInstall = await supported();
    const info = await invoke<UpdateInfo | null>('update_check');
    record(
      info
        ? `Version ${info.version} ${info.ready ? 'is ready to install' : 'is available'}`
        : "You're up to date",
    );
    send({ type: 'result', info, checkedAt: updater.prefs.lastCheck! });
    if (!canInstall) {
      send({
        type: 'unsupported',
        reason: PORTABLE_REASON,
        ...(info ? { info } : {}),
      });
    } else if (!info && manual) {
      updater.justChecked = true;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        updater.justChecked = false;
      }, 5000);
    } else if (info && !info.ready && updater.prefs.autoDownload) {
      await download();
    }
  } catch (error) {
    failure(error);
    if (updater.status.kind === 'error') record(updater.status.message);
  }
}

export async function download() {
  if (!isTauri || updater.status.kind !== 'available') return;
  send({ type: 'download' });
  let off: (() => void) | undefined;
  try {
    off = await listen<{ downloaded: number; total: number | null }>(
      'update-progress',
      ({ payload }) => {
        send({
          type: 'progress',
          pct: payload.total
            ? Math.min(
                100,
                Math.round((payload.downloaded / payload.total) * 100),
              )
            : null,
        });
      },
    );
    const info = await invoke<UpdateInfo>('update_download');
    send({ type: 'downloaded', info });
    setPrefs({ lastResult: `Version ${info.version} is ready to install` });
  } catch (error) {
    failure(error);
  } finally {
    off?.();
  }
}
export async function install() {
  if (!isTauri || updater.status.kind !== 'ready') return;
  // Persist before the native command can install and restart the process.
  setPrefs({
    pendingNotes: {
      version: updater.status.info.version,
      notes: updater.status.info.notes ?? '',
    },
  });
  send({ type: 'install' });
  try {
    await invoke('update_install');
  } catch (error) {
    failure(error);
  }
}

export function showWhatsNew() {
  updater.whatsNewOpen = true;
}
function recordRunningVersion(version: string) {
  updater.version = version;
  const result = whatsNew(
    version,
    updater.prefs,
    bundledNotes[`/release-notes/${version}.md`],
  );
  updater.currentNotes = result.notes;
  updater.whatsNewOpen = result.show;
  updater.prefs = result.prefs;
  savePrefs(storage, result.prefs);
}

/** Open only a validated release tag in the system browser on desktop. */
export async function openReleaseNotes(event: MouseEvent, version: string) {
  const url = releaseNotesUrl(version);
  if (!isTauri) return;
  event.preventDefault();
  await invoke('open_release_url', { url });
}

/** Start once from onMount; disposal also handles an in-flight support probe. */
export function startScheduler(): () => void {
  let disposed = false;
  let stopChecks: (() => void) | undefined;
  if (!isTauri) {
    recordRunningVersion(__APP_VERSION__);
    if (!preview()) send({ type: 'unsupported', reason: WEB_REASON });
  } else {
    void import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then((version) => {
        if (!disposed) recordRunningVersion(version);
      })
      .catch(() => {
        if (!disposed) recordRunningVersion(__APP_VERSION__);
      });
    void supported()
      .then(async (canInstall) => {
        if (disposed) return;
        if (!canInstall) {
          send({ type: 'unsupported', reason: PORTABLE_REASON });
          return;
        }
        const info = await invoke<UpdateInfo | null>('update_status');
        if (disposed) return;
        if (info) {
          send({ type: 'check', manual: false });
          send({ type: 'result', info, checkedAt: Date.now() });
        }
        stopChecks = scheduleUpdateChecks(() => void check());
      })
      .catch((error) => {
        if (!disposed) {
          send({ type: 'check', manual: false });
          failure(error);
        }
      });
  }
  return () => {
    disposed = true;
    stopChecks?.();
    clearTimeout(flashTimer);
    clearTimeout(previewTimer);
    previewOutcome = undefined;
  };
}
function preview(): boolean {
  const value = new URLSearchParams(location.search).get('update-preview');
  const info: UpdateInfo = {
    version: '0.2.0',
    currentVersion: '0.1.0',
    notes: 'Faster generate, new wizard',
    date: null,
    ready: false,
  };
  switch (value) {
    case 'idle':
      updater.status = { kind: 'idle' };
      break;
    case 'checking':
      updater.status = { kind: 'checking' };
      break;
    case 'none':
      updater.status = { kind: 'none', checkedAt: Date.now() };
      updater.justChecked = true;
      break;
    case 'available':
      updater.status = { kind: 'available', info };
      break;
    case 'downloading':
      updater.status = { kind: 'downloading', info, pct: 43 };
      break;
    case 'ready':
      updater.status = { kind: 'ready', info: { ...info, ready: true } };
      break;
    case 'error':
      updater.status = {
        kind: 'error',
        message: 'Network error: Could not reach GitHub',
      };
      break;
    case 'unsupported':
      updater.status = { kind: 'unsupported', reason: PORTABLE_REASON, info };
      break;
    default:
      return false;
  }
  previewOutcome = updater.status;
  return true;
}
