//! Opening a folder, a file or a web address — by verb on a validated target,
//! never by a composed command line (ADR-018).
//!
//! A folder opens in Explorer, which is a program started like any other:
//! `explorer.exe` with the path as its one argument, through
//! [`crate::os::process`]. A file and a web address open in whatever Windows
//! associates with them, through `ShellExecuteExW` with the `open` verb on the
//! target itself — no parameters, no shell string, and the target already
//! checked by the domain (absolute path; `http`/`https` only) and again here.

use std::path::{Path, PathBuf};

use crate::os::process::{self, Launch, LaunchFailure};

/// Something opened. The PID is what Windows handed back, when it did: a file
/// opened by an application that was already running yields none.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Opened {
    pub pid: Option<u32>,
}

fn explorer() -> PathBuf {
    let root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
    Path::new(&root).join("explorer.exe")
}

/// Open a folder in Explorer.
pub fn folder(path: &Path) -> Result<Opened, LaunchFailure> {
    if !path.is_absolute() {
        return Err(LaunchFailure::NotAbsolute(path.to_path_buf()));
    }
    if !path.is_dir() {
        return Err(LaunchFailure::NotFound(path.to_path_buf()));
    }
    let spawned = process::spawn(&Launch {
        program: explorer(),
        args: vec![path.to_string_lossy().into_owned()],
        working_dir: None,
        env: Vec::new(),
    })?;
    Ok(Opened {
        pid: Some(spawned.pid),
    })
}

/// Open a file with the application Windows associates with it.
pub fn file(path: &Path) -> Result<Opened, LaunchFailure> {
    if !path.is_absolute() {
        return Err(LaunchFailure::NotAbsolute(path.to_path_buf()));
    }
    if !path.is_file() {
        return Err(LaunchFailure::NotFound(path.to_path_buf()));
    }
    shell_open(&path.to_string_lossy())
}

/// Open a web address in the default browser. Only `http` and `https`: the
/// domain refuses the rest, and so does this, because a check that lives in
/// one place is a check that can be bypassed.
pub fn url(url: &str) -> Result<Opened, LaunchFailure> {
    let lower = url.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return Err(LaunchFailure::Os {
            code: None,
            message: format!("only http and https addresses are opened, not {url}"),
        });
    }
    shell_open(url)
}

#[cfg(windows)]
fn shell_open(target: &str) -> Result<Opened, LaunchFailure> {
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::GetProcessId;
    use windows::Win32::UI::Shell::{
        ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS,
        SHELLEXECUTEINFOW,
    };
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let verb = HSTRING::from("open");
    let file = HSTRING::from(target);
    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI,
        lpVerb: PCWSTR(verb.as_ptr()),
        lpFile: PCWSTR(file.as_ptr()),
        nShow: SW_SHOWNORMAL.0,
        ..Default::default()
    };

    // SAFETY: `info` is fully initialised, the strings outlive the call, and
    // the handle it returns is closed below.
    let result = unsafe { ShellExecuteExW(&mut info) };
    if let Err(error) = result {
        // hInstApp carries the SE_ERR_* code; the last error carries the rest.
        return Err(match info.hInstApp.0 as isize {
            2 | 3 => LaunchFailure::NotFound(PathBuf::from(target)),
            5 => LaunchFailure::Os {
                code: Some(5),
                message: "access was denied".into(),
            },
            31 => LaunchFailure::Os {
                code: Some(31),
                message: "no application is associated with this kind of file".into(),
            },
            _ => LaunchFailure::Os {
                code: Some(error.code().0),
                message: error.message(),
            },
        });
    }

    let pid = if info.hProcess.is_invalid() {
        None
    } else {
        // SAFETY: a valid process handle we own, closed right after reading.
        let pid = unsafe { GetProcessId(info.hProcess) };
        let _ = unsafe { CloseHandle(info.hProcess) };
        Some(pid)
    };
    Ok(Opened { pid })
}

#[cfg(not(windows))]
fn shell_open(_target: &str) -> Result<Opened, LaunchFailure> {
    Err(LaunchFailure::Os {
        code: None,
        message: "opening files and web addresses is only available on Windows".into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_relative_or_missing_folder_is_a_reason() {
        assert_eq!(
            folder(Path::new("src")),
            Err(LaunchFailure::NotAbsolute(PathBuf::from("src")))
        );
        let missing = std::env::temp_dir().join("deskstart-no-such-folder");
        assert_eq!(folder(&missing), Err(LaunchFailure::NotFound(missing)));
    }

    #[test]
    fn a_missing_file_is_a_reason_and_a_folder_is_not_a_file() {
        let missing = std::env::temp_dir().join("deskstart-no-such-file.txt");
        assert_eq!(file(&missing), Err(LaunchFailure::NotFound(missing)));
        let dir = std::env::temp_dir();
        assert_eq!(file(&dir), Err(LaunchFailure::NotFound(dir)));
    }

    #[test]
    fn only_web_schemes_are_opened() {
        for bad in [
            "file:///C:/secret.txt",
            "javascript:alert(1)",
            "ftp://x",
            "example.com",
        ] {
            let failure = url(bad).unwrap_err();
            assert!(
                failure.reason().contains("only http and https"),
                "{bad}: {failure:?}"
            );
        }
    }

    #[test]
    fn explorer_lives_under_the_system_root() {
        let path = explorer();
        assert!(path.is_absolute());
        assert!(path.ends_with("explorer.exe"));
    }
}
