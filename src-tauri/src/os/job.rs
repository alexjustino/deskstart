//! A Job Object per run: the net under everything a run started (ADR-015).
//!
//! Every process the host spawns for a run is assigned to the run's job, so a
//! Stop can reach not only the processes we hold handles of but also whatever
//! they spawned in turn — a launcher's child, a helper. The job is created
//! without `KILL_ON_JOB_CLOSE`: when a run finishes on its own, the job handle
//! is simply closed and the programs the run left open stay open. Only a Stop
//! terminates the job, and only after every held process was asked politely.
//!
//! A process that broke away from the job (`CREATE_BREAKAWAY_FROM_JOB`, or one
//! the shell started for us — the Store Notepad the stub handed off to) is not
//! in it and is not reached; the log says so rather than pretending.

use std::process::Child;

#[derive(Debug)]
pub struct Job {
    #[cfg(windows)]
    handle: windows::Win32::Foundation::HANDLE,
}

// A job handle is a kernel object usable from any thread; the only thing that
// must not happen is closing it twice, and `Drop` is the one place that does.
#[cfg(windows)]
unsafe impl Send for Job {}
#[cfg(windows)]
unsafe impl Sync for Job {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JobFailure(pub String);

impl Job {
    /// Create an anonymous job for one run.
    #[cfg(windows)]
    pub fn create() -> Result<Self, JobFailure> {
        use windows::Win32::System::JobObjects::CreateJobObjectW;
        // SAFETY: no security attributes, no name: a plain anonymous job.
        let handle =
            unsafe { CreateJobObjectW(None, None) }.map_err(|error| JobFailure(error.message()))?;
        Ok(Self { handle })
    }

    #[cfg(not(windows))]
    pub fn create() -> Result<Self, JobFailure> {
        Err(JobFailure("job objects exist only on Windows".into()))
    }

    /// Put a process the host just started into the job.
    #[cfg(windows)]
    pub fn assign(&self, child: &Child) -> Result<(), JobFailure> {
        use std::os::windows::io::AsRawHandle;
        use windows::Win32::Foundation::HANDLE;
        use windows::Win32::System::JobObjects::AssignProcessToJobObject;
        let process = HANDLE(child.as_raw_handle());
        // SAFETY: both handles are valid for the duration of the call.
        unsafe { AssignProcessToJobObject(self.handle, process) }
            .map_err(|error| JobFailure(error.message()))
    }

    #[cfg(not(windows))]
    pub fn assign(&self, _child: &Child) -> Result<(), JobFailure> {
        Err(JobFailure("job objects exist only on Windows".into()))
    }

    /// End every process still in the job. The last resort of a Stop, after
    /// the held processes were asked and given their grace.
    #[cfg(windows)]
    pub fn terminate(&self) -> Result<(), JobFailure> {
        use windows::Win32::System::JobObjects::TerminateJobObject;
        // SAFETY: a valid job handle we own.
        unsafe { TerminateJobObject(self.handle, 1) }.map_err(|error| JobFailure(error.message()))
    }

    #[cfg(not(windows))]
    pub fn terminate(&self) -> Result<(), JobFailure> {
        Err(JobFailure("job objects exist only on Windows".into()))
    }
}

#[cfg(windows)]
impl Drop for Job {
    fn drop(&mut self) {
        use windows::Win32::Foundation::CloseHandle;
        // Closing the handle does not end the job's processes: the job was
        // created without KILL_ON_JOB_CLOSE, on purpose (ADR-015).
        // SAFETY: the handle is ours and closed exactly once.
        let _ = unsafe { CloseHandle(self.handle) };
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use crate::os::process::{spawn, Launch};
    use std::path::PathBuf;
    use std::time::{Duration, Instant};

    fn cmd() -> PathBuf {
        let system = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
        PathBuf::from(format!(r"{system}\System32\cmd.exe"))
    }

    #[test]
    fn a_process_in_the_job_ends_when_the_job_is_terminated() {
        let job = Job::create().expect("a job");
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
        job.assign(&spawned.child).expect("assigned");
        job.terminate().expect("terminated");
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if matches!(spawned.child.try_wait(), Ok(Some(_))) {
                return;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        panic!("the process outlived the job");
    }

    #[test]
    fn closing_the_job_handle_leaves_its_processes_alone() {
        let mut spawned = spawn(&Launch {
            program: cmd(),
            args: vec![
                "/d".into(),
                "/c".into(),
                "ping".into(),
                "-n".into(),
                "3".into(),
                "127.0.0.1".into(),
            ],
            working_dir: None,
            env: Vec::new(),
        })
        .unwrap();
        {
            let job = Job::create().expect("a job");
            job.assign(&spawned.child).expect("assigned");
            drop(job);
        }
        std::thread::sleep(Duration::from_millis(200));
        assert!(
            matches!(spawned.child.try_wait(), Ok(None)),
            "dropping the job must not end the process"
        );
        let _ = spawned.child.kill();
    }
}
