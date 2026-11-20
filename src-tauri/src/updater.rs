//! Signed desktop updates from the configured stable feed.
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct UpdateState {
    pending: Mutex<Option<Update>>,
    bytes: Mutex<Option<Vec<u8>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    version: String,
    current_version: String,
    notes: Option<String>,
    date: Option<String>,
    ready: bool,
}

#[derive(Clone, Serialize)]
struct Progress {
    downloaded: u64,
    total: Option<u64>,
}

fn info(update: &Update, ready: bool) -> UpdateInfo {
    UpdateInfo {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        notes: update.body.clone(),
        date: update.date.map(|date| date.to_string()),
        ready,
    }
}

#[tauri::command]
pub async fn update_check(
    app: AppHandle,
    state: State<'_, UpdateState>,
) -> Result<Option<UpdateInfo>, String> {
    if app
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|config| config.get("pubkey"))
        .and_then(|key| key.as_str())
        .is_none_or(str::is_empty)
    {
        return Err("Updater pubkey is empty".into());
    }
    // Check even when ready: an explicit check may discover a newer release.
    let updater = app.updater_builder().build().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;
    let mut pending = state.pending.lock().map_err(|e| e.to_string())?;
    let mut bytes = state.bytes.lock().map_err(|e| e.to_string())?;
    if pending.as_ref().map(|u| &u.version) != update.as_ref().map(|u| &u.version) {
        *bytes = None;
    }
    let result = update.as_ref().map(|u| info(u, bytes.is_some()));
    *pending = update;
    Ok(result)
}

#[tauri::command]
pub async fn update_download(
    app: AppHandle,
    state: State<'_, UpdateState>,
) -> Result<UpdateInfo, String> {
    let update = state
        .pending
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("No update available")?;
    let mut downloaded = 0;
    let bytes = update
        .download(
            move |chunk, total| {
                downloaded += chunk as u64;
                let _ = app.emit("update-progress", Progress { downloaded, total });
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    *state.bytes.lock().map_err(|e| e.to_string())? = Some(bytes);
    Ok(info(&update, true))
}

#[tauri::command]
pub async fn update_install(app: AppHandle, state: State<'_, UpdateState>) -> Result<(), String> {
    let update = state
        .pending
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("No update downloaded")?;
    let bytes = state
        .bytes
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("No update downloaded")?;
    // Retain the verified bytes if installation fails, so a retry is possible.
    update.install(bytes).map_err(|e| e.to_string())?;
    app.restart();
}

#[tauri::command]
pub fn update_status(state: State<'_, UpdateState>) -> Option<UpdateInfo> {
    let pending = state.pending.lock().ok()?;
    let ready = state.bytes.lock().ok()?.is_some();
    pending.as_ref().map(|update| info(update, ready))
}

#[tauri::command]
pub fn update_supported() -> bool {
    if cfg!(target_os = "macos") {
        return true;
    }
    cfg!(target_os = "windows")
        && std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|dir| dir.join("uninstall.exe")))
            .is_some_and(|path| path.is_file())
}
