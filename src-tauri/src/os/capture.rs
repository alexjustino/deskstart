//! What is on the desktop now, read so it can become a profile (1.1, ADR-030).
//!
//! A **read**, and a careful one: each visible, top-level window a person
//! would call "a window" — not cloaked (a hidden Store app), not a tool
//! window, not owned by another, with a title, and not this product's own —
//! with the program that owns it, the screen it is on, where it is on that
//! screen, and whether it is maximised or minimised. Nothing is moved,
//! focused, read from inside a window, or sent anywhere.
//!
//! The title is read so a person can recognise the window in the list; it is
//! handed up for that and **not stored** by the profile the capture becomes
//! (the domain's rule, ADR-030). What each window *means* — whether it can be
//! a step, and which step — is the domain's (`domain/capture`).

use serde::Serialize;

use crate::os::window;

/// One window as it is now.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Captured {
    /// The program that owns it, absolute, or None when Windows would not say
    /// (a process running with more rights than this one).
    pub program: Option<String>,
    /// For recognising it in the list. Never stored.
    pub title: String,
    pub class_name: String,
    /// The screen it is on, by the product's numbering (1 is the primary).
    pub monitor: Option<i64>,
    /// Where it is on that screen, in that screen's coordinates; None unless
    /// the window is shown normally (a maximised window's place is its screen).
    pub rect: Option<CapturedRect>,
    /// normal, maximized or minimized.
    pub state: String,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub struct CapturedRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// The screen whose working area holds the point, by number; the primary
/// when none does (a window partly off every screen).
pub fn screen_of(screens: &[window::Monitor], x: i32, y: i32) -> Option<&window::Monitor> {
    screens
        .iter()
        .find(|m| x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height)
        .or_else(|| screens.iter().find(|m| m.primary))
}

/// The windows on the desktop now, in the order Windows keeps them (top first).
#[cfg(windows)]
pub fn windows() -> Vec<Captured> {
    use windows::Win32::Foundation::{CloseHandle, BOOL, HWND, LPARAM, RECT};
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindow, GetWindowLongPtrW, GetWindowPlacement, GetWindowRect,
        GetWindowThreadProcessId, IsIconic, IsWindowVisible, IsZoomed, GWL_EXSTYLE, GW_OWNER,
        WINDOWPLACEMENT, WS_EX_TOOLWINDOW,
    };

    fn program_of(pid: u32) -> Option<String> {
        // SAFETY: a query-only handle, closed below; failure is None.
        let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;
        let mut buffer = [0u16; 1024];
        let mut length = buffer.len() as u32;
        // SAFETY: the buffer and its length travel together.
        let read = unsafe {
            QueryFullProcessImageNameW(
                process,
                PROCESS_NAME_WIN32,
                windows::core::PWSTR(buffer.as_mut_ptr()),
                &mut length,
            )
        };
        // SAFETY: the handle was opened above and is closed once.
        let _ = unsafe { CloseHandle(process) };
        read.ok()?;
        Some(String::from_utf16_lossy(&buffer[..length as usize]))
    }

    unsafe extern "system" fn visit(hwnd: HWND, lparam: LPARAM) -> BOOL {
        // SAFETY: lparam is the pointer to the vector passed below, alive for the call.
        let found = &mut *(lparam.0 as *mut Vec<HWND>);
        found.push(hwnd);
        BOOL(1)
    }

    let mut handles: Vec<HWND> = Vec::new();
    // SAFETY: the callback only pushes into the vector this stack owns.
    let _ = unsafe { EnumWindows(Some(visit), LPARAM(&mut handles as *mut Vec<HWND> as isize)) };

    let screens = window::monitors();
    let own = std::process::id();
    let mut out = Vec::new();
    for hwnd in handles {
        // SAFETY: every call below only reads properties of a window handle
        // Windows just enumerated; a window that closed since answers with an
        // error or zero, and is skipped.
        unsafe {
            if !IsWindowVisible(hwnd).as_bool() {
                continue;
            }
            if GetWindow(hwnd, GW_OWNER)
                .map(|h| !h.0.is_null())
                .unwrap_or(false)
            {
                continue;
            }
            let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
            if ex_style & WS_EX_TOOLWINDOW.0 != 0 {
                continue;
            }
            let mut cloaked = 0u32;
            let _ = DwmGetWindowAttribute(
                hwnd,
                DWMWA_CLOAKED,
                &mut cloaked as *mut u32 as *mut core::ffi::c_void,
                std::mem::size_of::<u32>() as u32,
            );
            if cloaked != 0 {
                continue;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == own {
                continue;
            }
            let (title, class_name) = window::title_and_class(hwnd);
            if title.trim().is_empty() {
                continue;
            }

            let state = if IsIconic(hwnd).as_bool() {
                "minimized"
            } else if IsZoomed(hwnd).as_bool() {
                "maximized"
            } else {
                "normal"
            };

            // Where it is: the window's rectangle when it is shown normally;
            // the place it would be restored to otherwise, to find its screen.
            let mut shown = RECT::default();
            let _ = GetWindowRect(hwnd, &mut shown);
            let mut placement = WINDOWPLACEMENT {
                length: std::mem::size_of::<WINDOWPLACEMENT>() as u32,
                ..Default::default()
            };
            let _ = GetWindowPlacement(hwnd, &mut placement);
            let basis = if state == "normal" {
                shown
            } else {
                placement.rcNormalPosition
            };
            let (cx, cy) = (
                (basis.left + basis.right) / 2,
                (basis.top + basis.bottom) / 2,
            );
            let screen = screen_of(&screens, cx, cy);
            let rect = match (state, screen) {
                ("normal", Some(m)) if shown.right > shown.left && shown.bottom > shown.top => {
                    Some(CapturedRect {
                        x: shown.left - m.x,
                        y: shown.top - m.y,
                        width: shown.right - shown.left,
                        height: shown.bottom - shown.top,
                    })
                }
                _ => None,
            };

            out.push(Captured {
                program: program_of(pid),
                title,
                class_name,
                monitor: screen.map(|m| m.number),
                rect,
                state: state.to_string(),
            });
        }
    }
    out
}

#[cfg(not(windows))]
pub fn windows() -> Vec<Captured> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn screen(number: i64, x: i32, primary: bool) -> window::Monitor {
        window::Monitor {
            number,
            name: String::new(),
            x,
            y: 0,
            width: 1920,
            height: 1040,
            primary,
        }
    }

    #[test]
    fn a_point_belongs_to_the_screen_whose_working_area_holds_it() {
        let screens = [screen(1, 0, true), screen(2, 1920, false)];
        assert_eq!(screen_of(&screens, 100, 100).map(|m| m.number), Some(1));
        assert_eq!(screen_of(&screens, 2000, 500).map(|m| m.number), Some(2));
    }

    #[test]
    fn a_point_off_every_screen_is_given_the_primary() {
        let screens = [screen(2, -1920, false), screen(1, 0, true)];
        assert_eq!(screen_of(&screens, 9000, 9000).map(|m| m.number), Some(1));
        assert_eq!(screen_of(&[], 0, 0), None);
    }

    #[test]
    #[cfg(windows)]
    fn reading_the_desktop_never_lists_this_process_or_a_window_without_a_title() {
        for found in windows() {
            assert!(!found.title.trim().is_empty());
            assert!(["normal", "maximized", "minimized"].contains(&found.state.as_str()));
            if found.state != "normal" {
                assert!(found.rect.is_none());
            }
        }
    }
}
