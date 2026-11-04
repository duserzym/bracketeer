//! Ported from grainatlas: remember logical geometry in the app config folder.
//! Restore only on a connected monitor, keeping the window inside its work area.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Runtime, WebviewWindow};

const DEFAULT: (f64, f64) = (1280.0, 800.0);
const MINIMUM: (f64, f64) = (1024.0, 640.0);

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
struct Geometry {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    maximized: bool,
}

fn file<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|d| d.join("window.json"))
}

fn fit(g: Geometry, areas: &[(f64, f64, f64, f64)]) -> Option<Geometry> {
    if ![g.x, g.y, g.w, g.h].iter().all(|v| v.is_finite()) || g.w <= 0.0 || g.h <= 0.0 {
        return None;
    }
    // The title bar (top 40 px, 100 px from the left) must be on a connected monitor.
    let &(ax, ay, aw, ah) = areas.iter().find(|&&(ax, ay, aw, ah)| {
        aw > 0.0
            && ah > 0.0
            && g.x + 100.0 >= ax
            && g.x + 100.0 <= ax + aw
            && g.y + 1.0 >= ay
            && g.y + 40.0 <= ay + ah
    })?;
    let w = g.w.clamp(MINIMUM.0.min(aw), aw);
    let h = g.h.clamp(MINIMUM.1.min(ah), ah);
    Some(Geometry {
        x: g.x.clamp(ax, (ax + aw - w).max(ax)),
        y: g.y.clamp(ay, (ay + ah - h).max(ay)),
        w,
        h,
        ..g
    })
}

pub fn restore<R: Runtime>(w: &WebviewWindow<R>) {
    let Some(path) = file(w.app_handle()) else {
        return;
    };
    let Ok(bytes) = std::fs::read(path) else {
        return;
    };
    let Ok(g) = serde_json::from_slice::<Geometry>(&bytes) else {
        return;
    };
    let areas: Vec<_> = w
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            let s = m.scale_factor();
            let a = m.work_area();
            (
                f64::from(a.position.x) / s,
                f64::from(a.position.y) / s,
                f64::from(a.size.width) / s,
                f64::from(a.size.height) / s,
            )
        })
        .collect();
    let Some(g) = fit(g, &areas) else { return };
    let _ = w.set_size(LogicalSize::new(g.w, g.h));
    let _ = w.set_position(LogicalPosition::new(g.x, g.y));
    if g.maximized {
        let _ = w.maximize();
    }
}

/// Do not save while minimized; maximized windows retain their normal geometry.
pub fn save<R: Runtime>(w: &WebviewWindow<R>) {
    if w.is_minimized().unwrap_or(false) {
        return;
    }
    let Some(path) = file(w.app_handle()) else {
        return;
    };
    let s = w.scale_factor().unwrap_or(1.0);
    let maximized = w.is_maximized().unwrap_or(false);
    let prev: Option<Geometry> = std::fs::read(&path)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok());
    let g = match (maximized, prev) {
        (true, Some(p)) => Geometry {
            maximized: true,
            ..p
        },
        _ => {
            let (Ok(pos), Ok(size)) = (w.outer_position(), w.inner_size()) else {
                return;
            };
            Geometry {
                x: f64::from(pos.x) / s,
                y: f64::from(pos.y) / s,
                w: f64::from(size.width) / s,
                h: f64::from(size.height) / s,
                maximized,
            }
        }
    };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(bytes) = serde_json::to_vec(&g) {
        let _ = std::fs::write(path, bytes);
    }
}

pub fn reset<R: Runtime>(w: &WebviewWindow<R>) -> tauri::Result<()> {
    if let Some(path) = file(w.app_handle()) {
        let _ = std::fs::remove_file(path);
    }
    w.unmaximize()?;
    w.set_size(LogicalSize::new(DEFAULT.0, DEFAULT.1))?;
    w.center()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn saved() -> Geometry {
        Geometry {
            x: 200.0,
            y: 100.0,
            w: 1280.0,
            h: 800.0,
            maximized: false,
        }
    }

    #[test]
    fn disconnected_monitor_is_not_restored() {
        assert!(
            fit(
                Geometry {
                    x: 2000.0,
                    ..saved()
                },
                &[(0.0, 0.0, 1440.0, 875.0)]
            )
            .is_none()
        );
    }

    #[test]
    fn clamps_size_and_position_to_work_area() {
        let g = fit(
            Geometry {
                w: 2000.0,
                h: 1200.0,
                ..saved()
            },
            &[(0.0, 25.0, 1440.0, 850.0)],
        )
        .unwrap();
        assert_eq!((g.x, g.y, g.w, g.h), (0.0, 25.0, 1440.0, 850.0));
    }

    #[test]
    fn respects_minimum_and_negative_monitor_coordinates() {
        let g = fit(
            Geometry {
                x: -1400.0,
                y: 25.0,
                w: 100.0,
                h: 200.0,
                maximized: true,
            },
            &[(-1440.0, 25.0, 1440.0, 875.0)],
        )
        .unwrap();
        assert_eq!((g.x, g.y, g.w, g.h), (-1400.0, 25.0, 1024.0, 640.0));
        assert!(g.maximized);
    }

    #[test]
    fn malformed_geometry_is_ignored() {
        for w in [f64::NAN, f64::INFINITY, -1.0, 0.0] {
            assert!(fit(Geometry { w, ..saved() }, &[(0.0, 0.0, 1440.0, 900.0)]).is_none());
        }
    }
}
