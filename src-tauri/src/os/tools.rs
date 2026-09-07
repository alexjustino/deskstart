//! The tools this product knows how to call (F7, ADR-022).
//!
//! Four of them: Chrome, Edge, Windows Terminal and VS Code. Each is found in
//! **known install locations only** — never by searching `PATH`. Two reasons,
//! both worth the inconvenience:
//!
//! - `PATH` is a list anything on the machine can add to. A product that starts
//!   whatever `code` resolves to today is a product that can be pointed at
//!   something else tomorrow.
//! - What is on `PATH` for VS Code is `code.cmd`, a batch file, and a batch
//!   file cannot be started without a shell — which this product does not use
//!   (ADR-014). The real executable is `Code.exe`, and that is what is looked
//!   for.
//!
//! A tool that is not installed is not an error here: it is a `Tool` that says
//! `found: false`, which the editor shows and the run records as the reason a
//! step did not start (ADR-016).
//!
//! Bookmarks live beside the browser, in its own user data. Only the `Default`
//! profile is read, which is the one nearly everybody has; another profile is a
//! field this slice did not add rather than a guess it makes.

use std::path::PathBuf;

use serde::Serialize;

/// One tool, as the interface and the log talk about it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Tool {
    /// The id a launch names: `chrome`, `edge`, `terminal`, `editor`.
    pub id: &'static str,
    /// What a person calls it.
    pub name: &'static str,
    pub found: bool,
    /// Where it was found, so a person can see which one would run.
    pub path: Option<String>,
}

/// The ids a launch may name, with what they are called.
const TOOLS: [(&str, &str); 4] = [
    ("chrome", "Google Chrome"),
    ("edge", "Microsoft Edge"),
    ("terminal", "Windows Terminal"),
    ("editor", "VS Code"),
];

fn env_path(variable: &str, tail: &str) -> Option<PathBuf> {
    let base = std::env::var_os(variable)?;
    Some(PathBuf::from(base).join(tail))
}

/// Where each tool is looked for, in order. The first that exists wins.
fn candidates(id: &str) -> Vec<PathBuf> {
    let places: &[(&str, &str)] = match id {
        "chrome" => &[
            ("PROGRAMFILES", r"Google\Chrome\Application\chrome.exe"),
            ("PROGRAMFILES(X86)", r"Google\Chrome\Application\chrome.exe"),
            ("LOCALAPPDATA", r"Google\Chrome\Application\chrome.exe"),
        ],
        "edge" => &[
            (
                "PROGRAMFILES(X86)",
                r"Microsoft\Edge\Application\msedge.exe",
            ),
            ("PROGRAMFILES", r"Microsoft\Edge\Application\msedge.exe"),
        ],
        // The execution alias Windows installs for Windows Terminal. It is a
        // real entry point: `CreateProcess` follows it.
        "terminal" => &[("LOCALAPPDATA", r"Microsoft\WindowsApps\wt.exe")],
        "editor" => &[
            ("LOCALAPPDATA", r"Programs\Microsoft VS Code\Code.exe"),
            ("PROGRAMFILES", r"Microsoft VS Code\Code.exe"),
            ("PROGRAMFILES(X86)", r"Microsoft VS Code\Code.exe"),
        ],
        _ => &[],
    };
    places
        .iter()
        .filter_map(|(variable, tail)| env_path(variable, tail))
        .collect()
}

/// Where this tool is on this machine, if it is anywhere.
pub fn find(id: &str) -> Option<PathBuf> {
    candidates(id).into_iter().find(|path| path.is_file())
}

/// What a person calls this tool, whether or not it is installed.
pub fn name_of(id: &str) -> &'static str {
    TOOLS
        .iter()
        .find(|(known, _)| *known == id)
        .map(|(_, name)| *name)
        .unwrap_or("that tool")
}

/// Every tool, found or not — what Diagnostics and the editor show.
pub fn all() -> Vec<Tool> {
    TOOLS
        .iter()
        .map(|(id, name)| {
            let path = find(id);
            Tool {
                id,
                name,
                found: path.is_some(),
                path: path.map(|p| p.display().to_string()),
            }
        })
        .collect()
}

/// Where a browser keeps the bookmarks of its `Default` profile.
pub fn bookmarks_file(browser: &str) -> Option<PathBuf> {
    let tail = match browser {
        "chrome" => r"Google\Chrome\User Data\Default\Bookmarks",
        "edge" => r"Microsoft\Edge\User Data\Default\Bookmarks",
        _ => return None,
    };
    env_path("LOCALAPPDATA", tail)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_tool_has_somewhere_to_be_looked_for() {
        for (id, _) in TOOLS {
            assert!(
                !candidates(id).is_empty(),
                "{id} is a tool nothing knows where to find"
            );
        }
    }

    #[test]
    fn a_tool_nobody_declared_is_not_found_and_is_not_a_panic() {
        assert!(find("firefox").is_none());
        assert_eq!(name_of("firefox"), "that tool");
        assert!(bookmarks_file("firefox").is_none());
    }

    #[test]
    fn nothing_is_looked_for_on_path() {
        // The whole point of ADR-022: every candidate is an absolute path under
        // a directory Windows itself names.
        for (id, _) in TOOLS {
            for path in candidates(id) {
                assert!(
                    path.is_absolute(),
                    "{id}: {} is not absolute",
                    path.display()
                );
            }
        }
    }

    #[test]
    fn the_list_says_where_each_tool_is_or_that_it_is_not_here() {
        for tool in all() {
            assert_eq!(tool.found, tool.path.is_some());
            assert!(!tool.name.is_empty());
        }
    }

    #[test]
    fn a_browser_keeps_its_bookmarks_beside_itself() {
        let chrome = bookmarks_file("chrome").expect("a path for Chrome");
        assert!(chrome.ends_with("Bookmarks"));
        assert!(chrome.to_string_lossy().contains("Chrome"));
        let edge = bookmarks_file("edge").expect("a path for Edge");
        assert!(edge.to_string_lossy().contains("Edge"));
    }
}
