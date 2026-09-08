//! The Windows Task Scheduler, asked through `schtasks.exe` (F9, ADR-017).
//!
//! A schedule is not kept by Deskstart: it is handed to the scheduler Windows
//! already runs, which fires it whether or not Deskstart is open, and starts
//! `deskstart.exe --run <id> --trigger schedule` at the minute set. A running
//! instance is handed the request; otherwise one opens.
//!
//! Every task this product makes lives in a folder of its own name, and is
//! named by the profile's id — a UUID this product generated, checked here
//! before it is used. The action is this executable, by its absolute path, and
//! two arguments. Nothing a person typed reaches `schtasks`: the time of day
//! and the days are validated into the scheduler's own vocabulary here, from
//! the stored schedule, and the profile id is ours.
//!
//! `schtasks` is a command like a hypervisor's tool: it does one thing, says
//! whether it could, and exits. So it is run to its end within a budget and
//! what it said is the reason (ADR-023).

use std::path::PathBuf;
use std::time::Duration;

use serde::Deserialize;

use crate::os::process::{run_bounded, Launch, LaunchFailure};

/// How long `schtasks` gets to answer. It answers in well under a second.
const BUDGET: Duration = Duration::from_secs(30);

/// The stored schedule, as the domain wrote it: a time of day, and the days
/// it applies to (none means every day).
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct Schedule {
    pub at: String,
    #[serde(default)]
    pub days: Vec<String>,
}

const DAYS: [&str; 7] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/// Read a stored `schedule_json`; `{}` and empty are "none".
pub fn read(json: &str) -> Result<Option<Schedule>, String> {
    let trimmed = json.trim();
    if trimmed.is_empty() || trimmed == "{}" {
        return Ok(None);
    }
    let schedule: Schedule =
        serde_json::from_str(trimmed).map_err(|_| "the stored schedule could not be read")?;
    validate(&schedule)?;
    Ok(Some(schedule))
}

/// `HH:MM`, 24-hour, and days from the week — nothing else goes near `schtasks`.
fn validate(schedule: &Schedule) -> Result<(), String> {
    let bytes = schedule.at.as_bytes();
    let well_formed = bytes.len() == 5
        && bytes[2] == b':'
        && bytes[0].is_ascii_digit()
        && bytes[1].is_ascii_digit()
        && bytes[3].is_ascii_digit()
        && bytes[4].is_ascii_digit();
    let hour: u32 = schedule
        .at
        .get(0..2)
        .and_then(|h| h.parse().ok())
        .unwrap_or(99);
    let minute: u32 = schedule
        .at
        .get(3..5)
        .and_then(|m| m.parse().ok())
        .unwrap_or(99);
    if !well_formed || hour > 23 || minute > 59 {
        return Err("a time of day is written HH:MM, 24-hour".to_string());
    }
    for day in &schedule.days {
        if !DAYS.contains(&day.as_str()) {
            return Err(format!("{day} is not a day of the week this product knows"));
        }
    }
    Ok(())
}

/// The scheduler's own words for this schedule.
fn arguments(schedule: &Schedule) -> Vec<String> {
    if schedule.days.is_empty() {
        return vec![
            "/SC".into(),
            "DAILY".into(),
            "/ST".into(),
            schedule.at.clone(),
        ];
    }
    let days = schedule
        .days
        .iter()
        .map(|day| day.to_ascii_uppercase())
        .collect::<Vec<_>>()
        .join(",");
    vec![
        "/SC".into(),
        "WEEKLY".into(),
        "/D".into(),
        days,
        "/ST".into(),
        schedule.at.clone(),
    ]
}

/// A profile id as this product makes them: a UUID, lower-case. Anything
/// else does not become part of a task name or an action.
pub fn is_profile_id(id: &str) -> bool {
    id.len() == 36
        && id.bytes().enumerate().all(|(at, byte)| match at {
            8 | 13 | 18 | 23 => byte == b'-',
            _ => byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase(),
        })
}

/// The task's name in the scheduler: a folder of this product's, then the id.
pub fn task_name(profile_id: &str) -> String {
    format!("Deskstart\\{profile_id}")
}

fn schtasks() -> Result<PathBuf, String> {
    let system = std::env::var_os("SYSTEMROOT").ok_or("SYSTEMROOT is not set")?;
    let path = PathBuf::from(system).join(r"System32\schtasks.exe");
    if !path.is_file() {
        return Err("the Task Scheduler's command is not where Windows keeps it".to_string());
    }
    Ok(path)
}

fn ask(args: Vec<String>) -> Result<String, String> {
    let launch = Launch {
        program: schtasks()?,
        args,
        working_dir: None,
        env: Vec::new(),
    };
    match run_bounded(&launch, BUDGET) {
        Ok(finished) => Ok(finished.said),
        Err(LaunchFailure::Refused { said, .. }) if !said.is_empty() => Err(said),
        Err(failure) => Err(failure.reason()),
    }
}

/// Register the task for this profile, replacing one that exists.
///
/// The action is this very executable — whichever build is running — so a
/// task made by a debug build starts the debug build. That is what a person
/// testing wants, and it is written on the Diagnostics page.
pub fn register(profile_id: &str, schedule: &Schedule) -> Result<(), String> {
    if !is_profile_id(profile_id) {
        return Err("that is not a profile id this product made".to_string());
    }
    validate(schedule)?;
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    let action = format!(
        "\"{}\" --run {profile_id} --trigger schedule",
        exe.display()
    );
    let mut args: Vec<String> = vec![
        "/Create".into(),
        "/F".into(),
        "/RL".into(),
        "LIMITED".into(),
        "/TN".into(),
        task_name(profile_id),
        "/TR".into(),
        action,
    ];
    args.extend(arguments(schedule));
    ask(args).map(|_| ())
}

/// Remove the task for this profile. A task that is not there is not an error.
pub fn unregister(profile_id: &str) -> Result<(), String> {
    if !is_profile_id(profile_id) {
        return Err("that is not a profile id this product made".to_string());
    }
    match ask(vec![
        "/Delete".into(),
        "/F".into(),
        "/TN".into(),
        task_name(profile_id),
    ]) {
        Ok(_) => Ok(()),
        Err(said) if said.contains("cannot find") || said.contains("does not exist") => Ok(()),
        Err(said) => Err(said),
    }
}

/// Is a task registered for this profile right now?
pub fn exists(profile_id: &str) -> bool {
    is_profile_id(profile_id)
        && ask(vec![
            "/Query".into(),
            "/TN".into(),
            task_name(profile_id),
            "/FO".into(),
            "LIST".into(),
        ])
        .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_schedule_becomes_the_schedulers_own_words() {
        let daily = Schedule {
            at: "07:30".into(),
            days: vec![],
        };
        assert_eq!(arguments(&daily), ["/SC", "DAILY", "/ST", "07:30"]);
        let weekly = Schedule {
            at: "07:30".into(),
            days: vec!["mon".into(), "wed".into()],
        };
        assert_eq!(
            arguments(&weekly),
            ["/SC", "WEEKLY", "/D", "MON,WED", "/ST", "07:30"]
        );
    }

    #[test]
    fn nothing_but_a_time_and_days_of_the_week_is_read() {
        assert_eq!(read("{}").unwrap(), None);
        assert_eq!(read("").unwrap(), None);
        assert!(read(r#"{"at":"07:30"}"#).unwrap().is_some());
        for bad in [
            r#"{"at":"7:30"}"#,
            r#"{"at":"24:00"}"#,
            r#"{"at":"07:60"}"#,
            r#"{"at":"07:30 & whoami"}"#,
            r#"{"at":"07:30","days":["monday"]}"#,
            r#"{"at":"07:30","days":["MON /F"]}"#,
            "not json",
        ] {
            assert!(read(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn only_an_id_this_product_made_names_a_task() {
        assert!(is_profile_id("01927f7e-cafe-7000-8000-000000000001"));
        assert!(!is_profile_id("01927F7E-CAFE-7000-8000-000000000001"));
        assert!(!is_profile_id("../Microsoft/Windows/Defrag"));
        assert!(!is_profile_id("01927f7e-cafe-7000-8000-00000000000\""));
        assert!(!is_profile_id(""));
        assert_eq!(
            task_name("01927f7e-cafe-7000-8000-000000000001"),
            r"Deskstart\01927f7e-cafe-7000-8000-000000000001"
        );
    }

    #[test]
    fn a_task_that_was_never_made_does_not_exist_and_is_not_an_error_to_remove() {
        let id = "01927f7e-cafe-7000-8000-0000000000ee";
        assert!(!exists(id));
        assert_eq!(unregister(id), Ok(()));
    }

    #[test]
    fn something_that_is_not_an_id_is_refused_before_the_scheduler_is_asked() {
        let schedule = Schedule {
            at: "07:30".into(),
            days: vec![],
        };
        assert!(register("not-an-id", &schedule).is_err());
        assert!(unregister("not-an-id").is_err());
        assert!(!exists("not-an-id"));
    }
}
