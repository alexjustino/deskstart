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
//!
//! F8 adds three hypervisors, and a distinction the first four tools did not
//! need: a **launcher** (Windows Terminal, VS Code, a browser) is handed a
//! desktop and left alone, while a **command** (`VBoxManage`, `vmrun`, the
//! PowerShell that asks Hyper-V) does one thing, says whether it could, and
//! exits — so it is waited for, within a budget, and what it said is the
//! reason a person reads. Hyper-V has no command-line tool of its own: it is
//! asked through PowerShell, with a **constant** command and the machine's
//! name in the child's environment, never in the command line (ADR-023).

use std::path::PathBuf;

use serde::Serialize;

use crate::os::process::Launch;

/// How a tool is run once found.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    /// Handed a desktop and left alone; the process is held by the run.
    Launcher,
    /// Run to its end within a budget; what it says is the reason.
    Command,
}

/// The variable a machine's name travels in, for Hyper-V (ADR-023).
pub const VM_NAME_VARIABLE: &str = "DESKSTART_VM";

/// What PowerShell is asked, verbatim and always the same. The name is read
/// from the environment inside PowerShell, as a string; nothing a person typed
/// is ever part of this text.
const HYPERV_COMMAND: &str = "$ErrorActionPreference = 'Stop'; \
     Start-VM -Name $env:DESKSTART_VM; \
     & (Join-Path $env:SystemRoot 'System32\\vmconnect.exe') localhost $env:DESKSTART_VM";

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
const TOOLS: [(&str, &str); 7] = [
    ("chrome", "Google Chrome"),
    ("edge", "Microsoft Edge"),
    ("terminal", "Windows Terminal"),
    ("editor", "VS Code"),
    ("hyperv", "Hyper-V"),
    ("virtualbox", "VirtualBox"),
    ("vmware", "VMware Workstation"),
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
        // Hyper-V is "installed" when its console is: `vmconnect.exe` arrives
        // with the management tools and with nothing else. PowerShell, which
        // does the asking, is on every Windows and is not what is looked for.
        "hyperv" => &[("SYSTEMROOT", r"System32\vmconnect.exe")],
        "virtualbox" => &[
            ("PROGRAMFILES", r"Oracle\VirtualBox\VBoxManage.exe"),
            ("PROGRAMFILES(X86)", r"Oracle\VirtualBox\VBoxManage.exe"),
        ],
        "vmware" => &[
            ("PROGRAMFILES(X86)", r"VMware\VMware Workstation\vmrun.exe"),
            ("PROGRAMFILES", r"VMware\VMware Workstation\vmrun.exe"),
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

/// Launcher or command: what happens after the tool is found.
pub fn mode(id: &str) -> Mode {
    match id {
        "hyperv" | "virtualbox" | "vmware" => Mode::Command,
        _ => Mode::Launcher,
    }
}

/// The exact process to start for this tool with these arguments, or None
/// when the tool is not installed here.
///
/// For every tool but one this is the tool itself and the arguments as given.
/// Hyper-V is asked through PowerShell: a constant command, and the machine's
/// name — the one argument the domain sent — in the child's environment.
pub fn invocation(id: &str, args: &[String]) -> Option<Launch> {
    let found = find(id)?;
    if id == "hyperv" {
        let system = std::env::var_os("SYSTEMROOT")?;
        let powershell =
            PathBuf::from(system).join(r"System32\WindowsPowerShell\v1.0\powershell.exe");
        if !powershell.is_file() {
            return None;
        }
        return Some(Launch {
            program: powershell,
            args: vec![
                "-NoProfile".into(),
                "-NonInteractive".into(),
                "-NoLogo".into(),
                "-Command".into(),
                HYPERV_COMMAND.into(),
            ],
            working_dir: None,
            env: vec![(
                VM_NAME_VARIABLE.to_string(),
                args.first().cloned().unwrap_or_default(),
            )],
        });
    }
    Some(Launch {
        program: found,
        args: args.to_vec(),
        working_dir: None,
        env: Vec::new(),
    })
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
    fn a_hypervisor_is_a_command_and_everything_else_is_a_launcher() {
        for id in ["hyperv", "virtualbox", "vmware"] {
            assert_eq!(mode(id), Mode::Command, "{id}");
        }
        for id in ["chrome", "edge", "terminal", "editor"] {
            assert_eq!(mode(id), Mode::Launcher, "{id}");
        }
    }

    #[test]
    fn the_hyperv_command_carries_no_machine_name_and_reads_it_from_the_environment() {
        assert!(HYPERV_COMMAND.contains("$env:DESKSTART_VM"));
        // Nothing in it is a placeholder for text: it is the same string every
        // time, whatever the machine is called.
        assert!(!HYPERV_COMMAND.contains("{}"));
        assert!(!HYPERV_COMMAND.contains("{name}"));
    }

    #[test]
    fn a_tool_that_is_not_here_has_no_invocation() {
        // On a machine without VirtualBox there is nothing to invoke, and the
        // answer is None rather than a path that would fail later.
        if find("virtualbox").is_none() {
            assert!(invocation("virtualbox", &["startvm".into()]).is_none());
        }
        assert!(invocation("firefox", &[]).is_none());
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
