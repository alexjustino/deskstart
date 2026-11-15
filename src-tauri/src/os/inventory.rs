//! Asking a hypervisor what machines it has (1.1).
//!
//! Each hypervisor is asked, on this machine, for its inventory — a **local
//! read**, never a network call. The host runs the list command (or reads the
//! inventory file) because only it may touch a process or a disk; what the
//! output means is the domain's (`domain/vminventory`). What comes back here is
//! raw text, handed up untouched.
//!
//! A hypervisor that is not installed is not an error to shout about: it is the
//! same "not found" the editor already shows for a tool (ADR-022), so the
//! caller gets a `ToolMissing` and the screen says which.

use std::path::PathBuf;
use std::time::Duration;

use serde::Serialize;

use crate::os::process::{capture_stdout, Launch, LaunchFailure};
use crate::os::tools;

/// How long a list command gets to answer. Listing is near-instant; this is a
/// ceiling against a tool that wedges, not a wait anyone should feel.
const BUDGET: Duration = Duration::from_secs(15);

/// The raw text the domain reader needs for one hypervisor. `running` is a
/// second listing for VirtualBox and empty for the others, which report the
/// running state inline.
#[derive(Debug, Clone, Serialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Raw {
    pub primary: String,
    pub running: String,
}

fn run(program: PathBuf, args: &[&str]) -> Result<String, LaunchFailure> {
    capture_stdout(
        &Launch {
            program,
            args: args.iter().map(|a| a.to_string()).collect(),
            working_dir: None,
            env: Vec::new(),
        },
        BUDGET,
    )
}

/// The inventory text for a hypervisor, or why it could not be read.
pub fn read(hypervisor: &str) -> Result<Raw, LaunchFailure> {
    match hypervisor {
        "virtualbox" => {
            let exe = tools::find("virtualbox")
                .ok_or(LaunchFailure::ToolMissing(tools::name_of("virtualbox")))?;
            let all = run(exe.clone(), &["list", "vms"])?;
            // The running list is a convenience; if it fails, the inventory is
            // still worth showing, just without the running marks.
            let running = run(exe, &["list", "runningvms"]).unwrap_or_default();
            Ok(Raw {
                primary: all,
                running,
            })
        }
        "hyperv" => {
            // Hyper-V has no list tool of its own; PowerShell answers, as JSON,
            // with a constant command — nothing a person typed is in it.
            let system =
                std::env::var_os("SYSTEMROOT").ok_or(LaunchFailure::ToolMissing("Hyper-V"))?;
            let powershell =
                PathBuf::from(system).join(r"System32\WindowsPowerShell\v1.0\powershell.exe");
            if !powershell.is_file() || tools::find("hyperv").is_none() {
                return Err(LaunchFailure::ToolMissing(tools::name_of("hyperv")));
            }
            let json = run(
                powershell,
                &[
                    "-NoProfile",
                    "-NonInteractive",
                    "-NoLogo",
                    "-Command",
                    "Get-VM | Select-Object Name, State | ConvertTo-Json -Compress",
                ],
            )?;
            Ok(Raw {
                primary: json,
                running: String::new(),
            })
        }
        "vmware" => {
            // VMware Workstation has no clean list command; its registered
            // machines live in inventory.vmls, read the way F7 reads bookmarks.
            if tools::find("vmware").is_none() {
                return Err(LaunchFailure::ToolMissing(tools::name_of("vmware")));
            }
            let appdata = std::env::var_os("APPDATA")
                .ok_or(LaunchFailure::ToolMissing("VMware Workstation"))?;
            let path = PathBuf::from(appdata).join(r"VMware\inventory.vmls");
            let vmls = std::fs::read_to_string(&path).unwrap_or_default();
            Ok(Raw {
                primary: vmls,
                running: String::new(),
            })
        }
        _ => Err(LaunchFailure::ToolMissing("that hypervisor")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_hypervisor_nobody_declared_is_tool_missing() {
        assert!(matches!(
            read("parallels"),
            Err(LaunchFailure::ToolMissing(_))
        ));
    }

    #[test]
    fn a_hypervisor_that_is_not_installed_here_is_tool_missing_not_a_panic() {
        // On a machine without a given hypervisor the answer is ToolMissing, the
        // same the editor shows — never a crash, never a hang.
        for id in ["virtualbox", "vmware", "hyperv"] {
            if tools::find(id).is_none() {
                assert!(
                    matches!(read(id), Err(LaunchFailure::ToolMissing(_))),
                    "{id}"
                );
            }
        }
    }
}
