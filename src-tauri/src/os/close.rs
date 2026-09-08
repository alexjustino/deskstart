//! Closing a program the run started — politely first, then firmly.
//!
//! The process is one this product spawned and still holds the handle of. Its
//! top-level windows are asked to close (`WM_CLOSE`, the same message the ✕
//! button sends), and the process is given a grace period to go; only then is
//! it terminated. A program that never got a window — a console tool, a stub —
//! has nothing to ask and is terminated after the same grace.
//!
//! A process that had already exited is reported as such, never as closed by
//! us: on Windows 11 more than one `System32` program is a stub that hands off
//! and exits (risk R2), and the window it opened belongs to someone else. The
//! log says so; nothing is killed that we did not start.

use std::process::Child;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum How {
    /// The program closed itself after its windows were asked to.
    Window,
    /// The grace ran out and the process was terminated.
    Terminated,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Closed {
    pub how: How,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CloseFailure {
    /// The process was already gone; whatever is on screen is not ours.
    AlreadyExited,
    Os(String),
}

impl CloseFailure {
    pub fn reason(&self) -> String {
        match self {
            CloseFailure::AlreadyExited => {
                "the process Deskstart started had already exited; what it opened belongs to another process"
                    .to_string()
            }
            CloseFailure::Os(message) => format!("Windows could not close it: {message}"),
        }
    }
}

/// Close a held process: ask its windows, wait up to `grace`, then terminate.
pub fn close(child: &mut Child, grace: Duration) -> Result<Closed, CloseFailure> {
    if exited(child) {
        return Err(CloseFailure::AlreadyExited);
    }
    ask_windows(child.id());
    let deadline = Instant::now() + grace;
    while Instant::now() < deadline {
        if exited(child) {
            return Ok(Closed { how: How::Window });
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    child
        .kill()
        .map_err(|error| CloseFailure::Os(error.to_string()))?;
    let _ = child.wait();
    Ok(Closed {
        how: How::Terminated,
    })
}

fn exited(child: &mut Child) -> bool {
    matches!(child.try_wait(), Ok(Some(_)))
}

/// Post `WM_CLOSE` to every visible, unowned top-level window of the process.
#[cfg(windows)]
fn ask_windows(pid: u32) {
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindow, GetWindowThreadProcessId, IsWindowVisible, PostMessageW, GW_OWNER,
        WM_CLOSE,
    };

    struct Search {
        pid: u32,
        found: Vec<HWND>,
    }

    unsafe extern "system" fn visit(hwnd: HWND, lparam: LPARAM) -> BOOL {
        // SAFETY: lparam is the pointer to `Search` passed below, alive for the call.
        let search = &mut *(lparam.0 as *mut Search);
        let mut owner_pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut owner_pid));
        let top_level = GetWindow(hwnd, GW_OWNER)
            .map(|h| h.0.is_null())
            .unwrap_or(true);
        if owner_pid == search.pid && IsWindowVisible(hwnd).as_bool() && top_level {
            search.found.push(hwnd);
        }
        BOOL(1)
    }

    let mut search = Search {
        pid,
        found: Vec::new(),
    };
    // SAFETY: the callback only reads window properties and pushes into the
    // vector `search` owns; `search` outlives the enumeration.
    let _ = unsafe { EnumWindows(Some(visit), LPARAM(&mut search as *mut Search as isize)) };
    for hwnd in search.found {
        // SAFETY: posting a standard message to a window handle we just enumerated.
        let _ = unsafe { PostMessageW(hwnd, WM_CLOSE, WPARAM(0), LPARAM(0)) };
    }
}

#[cfg(not(windows))]
fn ask_windows(_pid: u32) {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::os::process::{spawn, Launch};
    use std::path::PathBuf;

    #[cfg(windows)]
    fn cmd() -> PathBuf {
        let system = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
        PathBuf::from(format!(r"{system}\System32\cmd.exe"))
    }

    #[cfg(windows)]
    #[test]
    fn a_process_that_already_exited_is_not_ours_to_close() {
        let mut spawned = spawn(&Launch {
            program: cmd(),
            args: vec!["/d".into(), "/c".into(), "exit".into(), "0".into()],
            working_dir: None,
            env: Vec::new(),
        })
        .unwrap();
        let _ = spawned.child.wait();
        let failure = close(&mut spawned.child, Duration::from_millis(100)).unwrap_err();
        assert_eq!(failure, CloseFailure::AlreadyExited);
        assert!(failure.reason().contains("already exited"));
    }

    #[cfg(windows)]
    #[test]
    fn a_process_without_a_window_is_terminated_after_the_grace() {
        // A console tool sleeping longer than the grace: no window to ask.
        let mut spawned = spawn(&Launch {
            program: cmd(),
            args: vec![
                "/d".into(),
                "/c".into(),
                "ping".into(),
                "-n".into(),
                "30".into(),
                "127.0.0.1".into(),
            ],
            working_dir: None,
            env: Vec::new(),
        })
        .unwrap();
        let started = Instant::now();
        let closed = close(&mut spawned.child, Duration::from_millis(300)).unwrap();
        assert_eq!(closed.how, How::Terminated);
        assert!(started.elapsed() < Duration::from_secs(5));
        assert!(exited(&mut spawned.child));
    }
}
