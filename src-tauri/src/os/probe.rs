//! Asking whether something is responding yet (F4).
//!
//! Two questions, both cheap enough to ask four times a second:
//!
//! - **window**: does this process have a visible top-level window of its own?
//!   That is what a person means by "it has come up" — a program is up when
//!   its window is on screen, not when its process exists. A process that
//!   handed off to another (the Store Notepad, risk R2) never grows a window
//!   of its own, and the wait says so by timing out rather than by lying.
//! - **port**: does something accept a TCP connection on this machine's port?
//!   Connecting and hanging up is the whole check: it answers the question a
//!   person is really asking ("is the server up?") without sending a byte.
//!
//! Neither question ever blocks for long: the window walk is a snapshot, and
//! the connection has a short timeout of its own.

use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::time::Duration;

/// How long a connection attempt may take before it counts as "not yet".
const CONNECT_TIMEOUT: Duration = Duration::from_millis(200);

/// Does the process own a visible top-level window?
#[cfg(windows)]
pub fn has_window(pid: u32) -> bool {
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindow, GetWindowThreadProcessId, IsWindowVisible, GW_OWNER,
    };

    struct Search {
        pid: u32,
        found: bool,
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
            search.found = true;
            return BOOL(0); // stop: one is enough
        }
        BOOL(1)
    }

    let mut search = Search { pid, found: false };
    // SAFETY: the callback only reads window properties and writes into the
    // `search` this stack owns, which outlives the enumeration.
    let _ = unsafe { EnumWindows(Some(visit), LPARAM(&mut search as *mut Search as isize)) };
    search.found
}

#[cfg(not(windows))]
pub fn has_window(_pid: u32) -> bool {
    false
}

/// Does something answer on this machine's TCP port?
pub fn port_answers(port: u16) -> bool {
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    TcpStream::connect_timeout(&address, CONNECT_TIMEOUT).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn a_port_nobody_listens_on_does_not_answer() {
        // Bind one, learn its number, drop it: a port that was free a moment
        // ago and is free now, without guessing a number.
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).expect("bind");
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        assert!(!port_answers(port));
    }

    #[test]
    fn a_port_something_listens_on_answers() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).expect("bind");
        let port = listener.local_addr().unwrap().port();
        assert!(port_answers(port));
    }

    #[cfg(windows)]
    #[test]
    fn a_process_without_a_window_has_no_window() {
        use crate::os::process::{spawn, Launch};
        use std::path::PathBuf;
        let system = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
        let mut spawned = spawn(&Launch {
            program: PathBuf::from(format!(r"{system}\System32\cmd.exe")),
            args: vec![
                "/d".into(),
                "/c".into(),
                "ping".into(),
                "-n".into(),
                "5".into(),
                "127.0.0.1".into(),
            ],
            working_dir: None,
        })
        .expect("spawn");
        assert!(!has_window(spawned.pid));
        let _ = spawned.child.kill();
    }

    #[cfg(windows)]
    #[test]
    fn a_pid_that_is_not_running_has_no_window() {
        // PID 0 is the system idle process; it owns no window, ever.
        assert!(!has_window(0));
    }
}
