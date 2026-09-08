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
    /// Variables set for the child only. How a value reaches a program without
    /// ever being part of a command line (ADR-023): the child reads a
    /// variable, and a variable is never parsed as code.
    pub env: Vec<(String, String)>,
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
    /// A command ran to its end and said no (F8): its exit code, and the first
    /// line it wrote to stderr, which is usually the sentence that matters.
    Refused {
        code: Option<i32>,
        said: String,
    },
    /// A command did not finish inside its budget and was ended (F8). The one
    /// thing a hypervisor is never allowed to do to a run is hang it.
    TimedOut(u64),
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
            LaunchFailure::Refused { code, said } => match (code, said.is_empty()) {
                (Some(code), false) => format!("it answered (exit {code}): {said}"),
                (Some(code), true) => format!("it answered with exit code {code} and said nothing"),
                (None, false) => format!("it was ended before answering: {said}"),
                (None, true) => "it was ended before answering".to_string(),
            },
            LaunchFailure::TimedOut(seconds) => {
                format!("it did not finish within {seconds} s and was ended")
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
    for (name, value) in &launch.env {
        command.env(name, value);
    }
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

/// What a command that ran to its end came back with.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Finished {
    pub code: Option<i32>,
    /// The first non-empty line of stderr, trimmed to a sentence's length.
    pub said: String,
}

/// Run a program to its end, within a budget, and report what it said.
///
/// The other way this product starts things — `spawn` — hands the program a
/// desktop and walks away. A hypervisor's command-line tool is not that kind
/// of program: it does one thing, says whether it could, and exits, and what
/// it says is the reason a person needs. So it is waited for — up to `budget`,
/// after which it is ended and the budget is the reason (F8, ADR-023).
pub fn run_bounded(
    launch: &Launch,
    budget: std::time::Duration,
) -> Result<Finished, LaunchFailure> {
    use std::io::Read;
    use std::time::Instant;

    check(launch)?;
    let mut command = command(launch);
    command.stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| classify(error, &launch.program))?;

    // Drained on a thread of its own: a child that fills the pipe would
    // otherwise block on write while this side blocks on wait. And never
    // joined without a deadline: a grandchild that inherited the pipe — the
    // console a hypervisor's tool opened and left running — would hold it open
    // for as long as it lives, which is exactly the hang F8 forbids.
    let stderr = child.stderr.take();
    let (sender, receiver) = std::sync::mpsc::channel::<String>();
    std::thread::spawn(move || {
        let mut text = String::new();
        if let Some(mut pipe) = stderr {
            let _ = pipe.read_to_string(&mut text);
        }
        let _ = sender.send(text);
    });

    let deadline = Instant::now() + budget;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if Instant::now() < deadline => {
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
            Err(error) => {
                log::warn!("waiting for {}: {error}", launch.program.display());
                let _ = child.kill();
                break None;
            }
        }
    };
    let said = first_line(
        &receiver
            .recv_timeout(std::time::Duration::from_millis(500))
            .unwrap_or_default(),
    );

    match status {
        None => Err(LaunchFailure::TimedOut(budget.as_secs())),
        Some(status) if status.success() => Ok(Finished {
            code: status.code(),
            said,
        }),
        Some(status) => Err(LaunchFailure::Refused {
            code: status.code(),
            said,
        }),
    }
}

/// The first line that says anything, cut to a sentence's length.
fn first_line(text: &str) -> String {
    let line = text
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("");
    if line.chars().count() > 200 {
        let cut: String = line.chars().take(197).collect();
        format!("{cut}…")
    } else {
        line.to_string()
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
            env: Vec::new(),
        }
    }

    #[test]
    fn a_command_that_succeeds_is_finished_and_quiet() {
        let finished = run_bounded(
            &launch(&cmd(), &["/d", "/c", "exit", "0"]),
            std::time::Duration::from_secs(10),
        )
        .unwrap();
        assert_eq!(finished.code, Some(0));
        assert_eq!(finished.said, "");
    }

    #[test]
    fn a_command_that_says_no_is_a_reason_with_what_it_said() {
        let failure = run_bounded(
            &launch(
                &cmd(),
                &["/d", "/c", "echo the machine is not there 1>&2 & exit 3"],
            ),
            std::time::Duration::from_secs(10),
        )
        .unwrap_err();
        assert_eq!(
            failure,
            LaunchFailure::Refused {
                code: Some(3),
                said: "the machine is not there".to_string()
            }
        );
        assert_eq!(
            failure.reason(),
            "it answered (exit 3): the machine is not there"
        );
    }

    #[test]
    fn a_command_that_does_not_finish_is_ended_and_the_budget_is_the_reason() {
        // ping to nowhere: a command that would take seconds, given half of one.
        let started = std::time::Instant::now();
        let failure = run_bounded(
            &launch(&cmd(), &["/d", "/c", "ping -n 6 127.0.0.1 > nul"]),
            std::time::Duration::from_millis(500),
        )
        .unwrap_err();
        assert_eq!(failure, LaunchFailure::TimedOut(0));
        assert!(started.elapsed() < std::time::Duration::from_secs(4));
        assert!(failure.reason().contains("did not finish"));
    }

    #[test]
    fn a_value_reaches_the_child_through_its_environment_not_its_command_line() {
        let mut launch = launch(&cmd(), &["/d", "/c", "exit %DESKSTART_PROBE%"]);
        launch
            .env
            .push(("DESKSTART_PROBE".to_string(), "7".to_string()));
        let failure = run_bounded(&launch, std::time::Duration::from_secs(10)).unwrap_err();
        assert!(matches!(
            failure,
            LaunchFailure::Refused { code: Some(7), .. }
        ));
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
            env: Vec::new(),
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
