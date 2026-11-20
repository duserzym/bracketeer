//! A deliberately narrow system-browser opener for this app's release notes.
use std::process::Command;

fn allowed(url: &str) -> bool {
    let Some(version) = url.strip_prefix("https://github.com/duserzym/bracketeer/releases/tag/v")
    else {
        return false;
    };
    let core = version.split(['-', '+']).next().unwrap_or_default();
    let parts: Vec<_> = core.split('.').collect();
    parts.len() == 3
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()))
        && version
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b".-+".contains(&b))
}

#[tauri::command]
pub fn open_release_url(url: String) -> Result<(), String> {
    if !allowed(&url) {
        return Err("Only bracketeer release-tag URLs may be opened".into());
    }
    #[cfg(target_os = "macos")]
    let mut command = Command::new("open");
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut cmd = Command::new("rundll32.exe");
        cmd.arg("url.dll,FileProtocolHandler");
        cmd
    };
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let mut command = Command::new("xdg-open");
    command
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permits_only_this_repositorys_https_release_tags() {
        for url in [
            "https://github.com/duserzym/bracketeer/releases/tag/v0.1.1",
            "https://github.com/duserzym/bracketeer/releases/tag/v1.2.3-beta.1",
        ] {
            assert!(allowed(url), "{url}");
        }
        for url in [
            "http://github.com/duserzym/bracketeer/releases/tag/v0.1.1",
            "https://github.com.evil.test/duserzym/bracketeer/releases/tag/v0.1.1",
            "https://github.com@evil.test/duserzym/bracketeer/releases/tag/v0.1.1",
            "https://github.com/duserzym/other/releases/tag/v0.1.1",
            "https://github.com/duserzym/bracketeer/releases/latest",
            "https://github.com/duserzym/bracketeer/releases/tag/v",
            "https://github.com/duserzym/bracketeer/releases/tag/v../../settings",
            "https://github.com/duserzym/bracketeer/releases/tag/v0.1.1?next=evil",
            "https://github.com/duserzym/bracketeer/releases/tag/v0.1.1#fragment",
            "https://github.com/duserzym/bracketeer/releases/tag/v0.1.1\n--args",
            "file:///tmp/test",
        ] {
            assert!(!allowed(url), "{url}");
            assert!(open_release_url(url.into()).is_err());
        }
    }
}
