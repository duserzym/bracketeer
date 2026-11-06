//! Native dialogs, clipboard and file bytes for the shared Svelte app.

use tauri::{Manager, WindowEvent};

mod geometry;
mod updater;

#[tauri::command]
async fn read_file(path: String) -> Result<tauri::ipc::Response, String> {
    std::fs::read(&path)
        .map(tauri::ipc::Response::new)
        .map_err(|error| format!("{path}: {error}"))
}

#[tauri::command]
async fn write_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, bytes).map_err(|error| format!("{path}: {error}"))
}

#[tauri::command]
fn reset_window(window: tauri::WebviewWindow) -> tauri::Result<()> {
    geometry::reset(&window)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updater::UpdateState::default())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                geometry::restore(&window);
                // Register after restoring so startup events cannot replace the saved place.
                let saved_window = window.clone();
                window.on_window_event(move |event| {
                    if matches!(
                        event,
                        WindowEvent::Moved(_)
                            | WindowEvent::Resized(_)
                            | WindowEvent::CloseRequested { .. }
                    ) {
                        geometry::save(&saved_window);
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            reset_window,
            updater::update_check,
            updater::update_download,
            updater::update_install,
            updater::update_status,
            updater::update_supported
        ])
        .run(tauri::generate_context!())
        .expect("error while running bracketeer");
}
