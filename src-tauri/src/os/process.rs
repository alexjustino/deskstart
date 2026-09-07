//! Starting a program — the only way this product ever does it (ADR-014).
//!
//! A program path and an argument **vector**, handed to `std::process::Command`,
//! which on Windows calls `CreateProcessW` with the arguments quoted one by one.
//! No string is ever composed for `cmd.exe` or PowerShell to interpret: an
//! argument that contains `&&` arrives in the child as an argument that
//! contains `&&`, and the test below proves it.
//!
//! A launch that fails is not an error that crosses the command boundary; it
//! is a reason, written for a person, that becomes a `failed` line in the run
//! log (ADR-011). The profile continues.

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

/// What to start, resolved by the domain and re-checked here.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Launch {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub working_dir: Option<PathBuf>,
}

/// A process that was started. The handle is kept by the caller for as long as
/// it needs it; dropping it does not end the process.
#[derive(Debug)]
pub struct Spawned {
    pub pid: u32,
    pub child: Child,
}

/// Why a program could not be started. Each variant reads as a sentence.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LaunchFailure {
    /// The path is relative: the domain must have resolved it, and did not.
    NotAbsolute(PathBuf),
    NotFound(PathBuf),
    NotAFile(PathBuf),
    WorkingDirMissing(PathBuf),
    /// Windows refused because the program needs administrator rights
    /// (`ERROR_ELEVATION_REQUIRED`). Never retried silently.
    ElevationRequired,
    /// A tool this product knows how to call is not installed here (F7).
    /// Not a path: it was looked for in every place it is normally installed.
    ToolMissing(&'static str),
    Os {
        code: Option<i32>,
        message: String,
    },
}

impl LaunchFailure {
    /// The sentence that goes into the log and onto the screen.
    pub fn reason(&self) -> String {
        match self {
            LaunchFailure::NotAbsolute(path) => {
                format!("the program path is not absolute: {}", path.display())
            }
            LaunchFailure::NotFound(path) => {
                format!("the program was not found at {}", path.display())
            }
            LaunchFailure::NotAFile(path) => {
                format!("the program path is not a file: {}", path.display())
            }
            LaunchFailure::WorkingDirMissing(path) => {
                format!("the working directory does not exist: {}", path.display())
            }
            LaunchFailure::ElevationRequired => {
                "the program needs administrator rights; Deskstart does not elevate on its own"
                    .to_string()
            }
            LaunchFailure::ToolMissing(name) => {
                format!("{name} is not installed where this product looks for it")
            }
            LaunchFailure::Os { code, message } => match code {
                Some(code) => format!("Windows could not start it (error {code}): {message}"),
                None => format!("Windows could not start it: {message}"),
            },
        }
    }
}

const ERROR_ELEVATION_REQUIRED: i32 = 740;

/// Check what can be checked before asking the operating system.
fn check(launch: &Launch) -> Result<(), LaunchFailure> {
    let program = &launch.program;
    if !program.is_absolute() {
        return Err(LaunchFailure::NotAbsolute(program.clone()));
    }
    if !program.exists() {
        return Err(LaunchFailure::NotFound(program.clone()));
    }
    if !program.is_file() {
        return Err(LaunchFailure::NotAFile(program.clone()));
    }
    if let Some(dir) = &launch.working_dir {
        if !dir.is_dir() {
            return Err(LaunchFailure::WorkingDirMissing(dir.clone()));
        }
    }
    Ok(())
}

/// The command, built and not yet run. Shared by `spawn` and the tests, so
/// what the tests prove about arguments is what the product does.
fn command(launch: &Launch) -> Command {
    let mut command = Command::new(&launch.program);
    command.args(&launch.args);
    if let Some(dir) = &launch.working_dir {
        command.current_dir(dir);
    }
    // The child owns its own console and windows; nothing is captured.
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    command
}

/// Start the program. The child is returned running; the caller decides how
/// long to hold the handle.
pub fn spawn(launch: &Launch) -> Result<Spawned, LaunchFailure> {
    check(launch)?;
    match command(launch).spawn() {
        Ok(child) => Ok(Spawned {
            pid: child.id(),
            child,
        }),
        Err(error) => Err(classify(error, &launch.program)),
    }
}

fn classify(error: std::io::Error, program: &Path) -> LaunchFailure {
    match error.raw_os_error() {
        Some(ERROR_ELEVATION_REQUIRED) => LaunchFailure::ElevationRequired,
        Some(2) | Some(3) => LaunchFailure::NotFound(program.to_path_buf()),
        code => LaunchFailure::Os {
            code,
            message: error.to_string(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn launch(program: &str, args: &[&str]) -> Launch {
        Launch {
            program: PathBuf::from(program),
            args: args.iter().map(|a| a.to_string()).collect(),
            working_dir: None,
        }
    }

    #[test]
    fn a_relative_program_is_refused_before_the_os_is_asked() {
        let failure = spawn(&launch("notepad.exe", &[])).unwrap_err();
        assert_eq!(
            failure,
            LaunchFailure::NotAbsolute(PathBuf::from("notepad.exe"))
        );
        assert!(failure.reason().contains("not absolute"));
    }

    #[test]
    fn a_missing_program_is_a_reason_not_a_panic() {
        let path = std::env::temp_dir().join("deskstart-no-such-program.exe");
        let failure = spawn(&launch(&path.to_string_lossy(), &[])).unwrap_err();
        assert_eq!(failure, LaunchFailure::NotFound(path));
        assert!(failure.reason().starts_with("the program was not found"));
    }

    #[test]
    fn a_missing_working_directory_is_a_reason() {
        let program = std::env::current_exe().unwrap();
        let dir = std::env::temp_dir().join("deskstart-no-such-directory");
        let failure = spawn(&Launch {
            program,
            args: vec![],
            working_dir: Some(dir.clone()),
        })
        .unwrap_err();
        assert_eq!(failure, LaunchFailure::WorkingDirMissing(dir));
    }

    #[test]
    fn every_reason_is_a_sentence_without_os_jargon() {
        let reasons = [
            LaunchFailure::ElevationRequired.reason(),
            LaunchFailure::Os {
                code: Some(5),
                message: "Access is denied.".into(),
            }
            .reason(),
        ];
        for reason in reasons {
            assert!(!reason.is_empty());
            assert!(!reason.contains("ERROR_"), "{reason}");
        }
    }

    #[cfg(windows)]
    fn cmd() -> String {
        let system = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
        format!(r"{system}\System32\cmd.exe")
    }

    #[cfg(windows)]
    #[test]
    fn a_program_starts_and_reports_its_pid() {
        let spawned = spawn(&launch(&cmd(), &["/d", "/c", "exit", "0"])).unwrap();
        assert!(spawned.pid > 0);
        let mut child = spawned.child;
        let status = child.wait().unwrap();
        assert!(status.success());
    }

    #[cfg(windows)]
    #[test]
    fn the_exit_code_proves_the_arguments_reached_the_child() {
        let spawned = spawn(&launch(&cmd(), &["/d", "/c", "exit", "42"])).unwrap();
        let mut child = spawned.child;
        assert_eq!(child.wait().unwrap().code(), Some(42));
    }

    #[cfg(windows)]
    #[test]
    fn an_argument_with_shell_operators_arrives_as_one_argument() {
        // `echo` prints its argument back; if `&&` had been interpreted, cmd
        // would have tried to run a program called `goodbye` and complained.
        let hostile = "hello && goodbye | more";
        let output = command(&launch(&cmd(), &["/d", "/c", "echo", hostile]))
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .unwrap();
        let printed = String::from_utf8_lossy(&output.stdout);
        assert!(printed.contains(hostile), "printed: {printed}");
        assert!(
            !printed.contains("not recognized") && output.stderr.is_empty(),
            "the shell interpreted the argument: {printed}"
        );
    }
}
