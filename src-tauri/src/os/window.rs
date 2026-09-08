//! Screens, and putting a window on one (F6).
//!
//! Two things only the host can answer: **what screens this machine has**, and
//! **where the window of a process we started actually is**. Everything about
//! which window should go where is decided in the domain; this module carries
//! it out and reports, in words, what it could and could not do (ADR-016).
//!
//! The screens are numbered the way a person would number them: the primary is
//! 1, and the rest follow left to right. Windows itself enumerates monitors in
//! no promised order, so the order is imposed here, once, and the same list is
//! what the editor offers and what a placement means.
//!
//! A rectangle is read in the coordinates of the screen it names — `0, 0` is
//! that screen's top-left corner — so a profile that says "on screen 2 at
//! 0, 0" means the same thing on a machine whose second screen is on the other
//! side. Without a screen, a rectangle is in the desktop's own coordinates,
//! which on a single-screen machine is the same thing.
//!
//! Nothing here reaches into a window this product did not open: the caller
//! passes the process id of a program the run started.

use serde::{Deserialize, Serialize};

/// One screen, as the product talks about it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Monitor {
    /// 1 is the primary; the rest follow left to right.
    pub number: i64,
    /// What Windows calls it, for the editor to show beside the number.
    pub name: String,
    /// The working area — the screen without the taskbar — in desktop coordinates.
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub primary: bool,
}

/// Where a window should go. The domain's shape, as it crosses the boundary.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Placement {
    #[serde(default)]
    pub monitor: Option<i64>,
    #[serde(default)]
    pub rect: Option<Rect>,
    #[serde(default = "normal")]
    pub state: String,
}

fn normal() -> String {
    "normal".to_string()
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// What happened when a placement was carried out.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Placed {
    /// Did the window move at all?
    pub placed: bool,
    /// What was done, in a sentence fragment: "maximised on screen 1".
    pub detail: String,
    /// What could not be done as asked, if anything — never silence.
    pub note: Option<String>,
}

impl Placed {
    fn nothing(reason: &str) -> Self {
        Self {
            placed: false,
            detail: String::new(),
            note: Some(reason.to_string()),
        }
    }
}

/// The screens this machine has, primary first and then left to right.
#[cfg(windows)]
pub fn monitors() -> Vec<Monitor> {
    use windows::Win32::Foundation::{BOOL, LPARAM, RECT};
    use windows::Win32::Graphics::Gdi::{
        EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFOEXW,
    };
    // The flag lives under WindowsAndMessaging in this version of the crate,
    // though it is a monitor's flag; it is 1, and has been since Windows 98.
    use windows::Win32::UI::WindowsAndMessaging::MONITORINFOF_PRIMARY;

    unsafe extern "system" fn visit(
        monitor: HMONITOR,
        _dc: HDC,
        _clip: *mut RECT,
        lparam: LPARAM,
    ) -> BOOL {
        // SAFETY: lparam is the pointer to the vector passed below, alive for the call.
        let found = &mut *(lparam.0 as *mut Vec<Monitor>);
        let mut info = MONITORINFOEXW {
            monitorInfo: windows::Win32::Graphics::Gdi::MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFOEXW>() as u32,
                ..Default::default()
            },
            ..Default::default()
        };
        if GetMonitorInfoW(monitor, &mut info as *mut MONITORINFOEXW as *mut _).as_bool() {
            let work = info.monitorInfo.rcWork;
            let name = String::from_utf16_lossy(&info.szDevice)
                .trim_end_matches('\0')
                .to_string();
            found.push(Monitor {
                number: 0, // numbered below, once the order is decided
                name,
                x: work.left,
                y: work.top,
                width: work.right - work.left,
                height: work.bottom - work.top,
                primary: info.monitorInfo.dwFlags & MONITORINFOF_PRIMARY != 0,
            });
        }
        BOOL(1)
    }

    let mut found: Vec<Monitor> = Vec::new();
    // SAFETY: the callback only writes into the vector this stack owns, which
    // outlives the enumeration.
    let _ = unsafe {
        EnumDisplayMonitors(
            None,
            None,
            Some(visit),
            LPARAM(&mut found as *mut Vec<Monitor> as isize),
        )
    };
    order(found)
}

#[cfg(not(windows))]
pub fn monitors() -> Vec<Monitor> {
    Vec::new()
}

/// Primary first, then left to right, then numbered from 1.
fn order(mut found: Vec<Monitor>) -> Vec<Monitor> {
    found.sort_by_key(|m| (!m.primary, m.x, m.y));
    for (index, monitor) in found.iter_mut().enumerate() {
        monitor.number = index as i64 + 1;
    }
    found
}

/// The visible top-level window this process owns, if it has one yet.
#[cfg(windows)]
pub fn main_window(pid: u32) -> Option<windows::Win32::Foundation::HWND> {
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindow, GetWindowThreadProcessId, IsWindowVisible, GW_OWNER,
    };

    struct Search {
        pid: u32,
        found: Option<HWND>,
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
            search.found = Some(hwnd);
            return BOOL(0); // stop: one is enough
        }
        BOOL(1)
    }

    let mut search = Search { pid, found: None };
    // SAFETY: the callback only reads window properties and writes into the
    // `search` this stack owns, which outlives the enumeration.
    let _ = unsafe { EnumWindows(Some(visit), LPARAM(&mut search as *mut Search as isize)) };
    search.found
}

/// Put this process's window where the placement says, and report what happened.
///
/// The window is not there the instant the process is: a program takes a moment
/// to show one. So the caller's timeout is spent looking, and a program that
/// never shows a window of its own — a stub that handed off, risk R2 — ends as
/// a report that says exactly that.
#[cfg(windows)]
pub fn place(pid: u32, placement: &Placement, timeout: std::time::Duration) -> Placed {
    use std::thread::sleep;
    use std::time::Instant;
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, ShowWindow, HWND_TOP, SWP_NOACTIVATE, SWP_NOSIZE, SWP_NOZORDER, SW_MAXIMIZE,
        SW_MINIMIZE, SW_RESTORE,
    };

    let deadline = Instant::now() + timeout;
    let window = loop {
        if let Some(window) = main_window(pid) {
            break window;
        }
        if Instant::now() >= deadline {
            return Placed::nothing("the program did not show a window of its own in time");
        }
        sleep(std::time::Duration::from_millis(100));
    };

    let screens = monitors();
    let mut note = None;
    let screen = match placement.monitor {
        None => None,
        Some(number) => match screens.iter().find(|m| m.number == number) {
            Some(found) => Some(found.clone()),
            None => {
                note = Some(format!(
                    "this machine has {} screen{}, not {number}; the primary was used",
                    screens.len(),
                    if screens.len() == 1 { "" } else { "s" }
                ));
                screens.iter().find(|m| m.primary).cloned()
            }
        },
    };

    let mut done: Vec<String> = Vec::new();

    // The rectangle first: a maximised window remembers what it was, so a
    // window that is sized and then maximised comes back to the right place.
    if let Some(rect) = placement.rect {
        let (x, y) = match &screen {
            Some(monitor) => (monitor.x + rect.x, monitor.y + rect.y),
            None => (rect.x, rect.y),
        };
        // SAFETY: `window` is a live top-level window of the process asked for.
        let moved = unsafe {
            SetWindowPos(
                window,
                HWND_TOP,
                x,
                y,
                rect.width,
                rect.height,
                SWP_NOACTIVATE | SWP_NOZORDER,
            )
        };
        match moved {
            Ok(()) => done.push(format!("{}×{} at {x}, {y}", rect.width, rect.height)),
            Err(error) => {
                log::warn!("the window could not be moved: {error}");
                note = Some("Windows refused to move the window".to_string());
            }
        }
    } else if let Some(monitor) = &screen {
        // A screen and no rectangle: move it there, keeping its size.
        // SAFETY: as above.
        let moved = unsafe {
            SetWindowPos(
                window,
                HWND_TOP,
                monitor.x + 40,
                monitor.y + 40,
                0,
                0,
                SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOSIZE,
            )
        };
        if let Err(error) = moved {
            log::warn!("the window could not be moved: {error}");
            note = Some("Windows refused to move the window".to_string());
        }
    }

    match placement.state.as_str() {
        "maximized" => {
            // SAFETY: as above.
            let _ = unsafe { ShowWindow(window, SW_MAXIMIZE) };
            done.push("maximised".to_string());
        }
        "minimized" => {
            // SAFETY: as above.
            let _ = unsafe { ShowWindow(window, SW_MINIMIZE) };
            done.push("minimised".to_string());
        }
        _ => {
            if placement.rect.is_some() {
                // A window that opened maximised ignores a rectangle until it
                // is restored; restoring first is what makes "normal at this
                // size" mean what it says.
                // SAFETY: as above.
                let _ = unsafe { ShowWindow(window, SW_RESTORE) };
                // SAFETY: as above.
                if let Some(rect) = placement.rect {
                    let (x, y) = match &screen {
                        Some(monitor) => (monitor.x + rect.x, monitor.y + rect.y),
                        None => (rect.x, rect.y),
                    };
                    let _ = unsafe {
                        SetWindowPos(
                            window,
                            HWND_TOP,
                            x,
                            y,
                            rect.width,
                            rect.height,
                            SWP_NOACTIVATE | SWP_NOZORDER,
                        )
                    };
                }
            }
        }
    }

    if let Some(monitor) = &screen {
        done.push(format!("on screen {}", monitor.number));
    }

    Placed {
        placed: true,
        detail: if done.is_empty() {
            "left where it opened".to_string()
        } else {
            done.join(" ")
        },
        note,
    }
}

#[cfg(not(windows))]
pub fn place(_pid: u32, _placement: &Placement, _timeout: std::time::Duration) -> Placed {
    Placed::nothing("windows are only placed on Windows")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn screen(x: i32, primary: bool) -> Monitor {
        Monitor {
            number: 0,
            name: format!("screen at {x}"),
            x,
            y: 0,
            width: 1920,
            height: 1040,
            primary,
        }
    }

    #[test]
    fn the_primary_is_screen_one_and_the_rest_run_left_to_right() {
        let ordered = order(vec![
            screen(1920, false),
            screen(-1920, false),
            screen(0, true),
        ]);
        assert_eq!(
            ordered.iter().map(|m| (m.number, m.x)).collect::<Vec<_>>(),
            [(1, 0), (2, -1920), (3, 1920)]
        );
    }

    #[test]
    fn numbering_survives_a_machine_with_one_screen() {
        let ordered = order(vec![screen(0, true)]);
        assert_eq!(ordered.len(), 1);
        assert_eq!(ordered[0].number, 1);
        assert!(ordered[0].primary);
    }

    #[test]
    #[cfg(windows)]
    fn this_machine_has_at_least_one_screen_and_exactly_one_primary() {
        let found = monitors();
        assert!(
            !found.is_empty(),
            "a machine running this test has a screen"
        );
        assert_eq!(found.iter().filter(|m| m.primary).count(), 1);
        assert_eq!(found[0].number, 1);
        assert!(found.iter().all(|m| m.width > 0 && m.height > 0));
    }

    #[test]
    #[cfg(windows)]
    fn a_process_that_is_not_running_has_no_window_to_place() {
        // A pid that cannot be running: nothing to look at, and the report says
        // so rather than the placement quietly counting as done.
        let report = place(
            u32::MAX,
            &Placement::default(),
            std::time::Duration::from_millis(150),
        );
        assert!(!report.placed);
        assert!(report.note.is_some());
    }
}
