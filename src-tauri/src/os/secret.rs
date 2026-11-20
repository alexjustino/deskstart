//! An encrypted machine's password, for the one moment it is used (1.1, ADR-028).
//!
//! The password arrives with the request to start one step and is gone when
//! that request returns. It is never written to the workspace, never put in
//! the launch the log records, never printed by `Debug`, and text that comes
//! back from the hypervisor is withheld whole from the log when it might hold
//! any of it.
//!
//! What this module cannot do is keep the password out of `vmrun`'s own
//! command line: `-vp <password>` is the only way VMware Workstation takes it.
//! For the second or two `vmrun` runs, a program running as the same Windows
//! user could read that command line. `SECURITY.md` says so; it is the price
//! of the hypervisor's interface, not something this product adds.

use std::fmt;

use serde::Deserialize;

/// A password held for one request. Its `Debug` says nothing, and its bytes
/// are overwritten when it is dropped (best effort: what the OS or the child
/// process copied is out of reach).
#[derive(Deserialize)]
#[serde(transparent)]
pub struct Secret(String);

impl Secret {
    #[cfg(test)]
    pub fn new(text: &str) -> Self {
        Secret(text.to_string())
    }

    /// The text, for the one place that needs it.
    pub fn expose(&self) -> &str {
        &self.0
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Secret(redacted)")
    }
}

impl Drop for Secret {
    fn drop(&mut self) {
        let mut bytes = std::mem::take(&mut self.0).into_bytes();
        bytes.iter_mut().for_each(|b| *b = 0);
        std::hint::black_box(&bytes);
    }
}

/// The `vmrun` vector with `-vp <password>` among its authentication flags —
/// after `-T ws`, before the command — or None when the vector is not the
/// shape the domain resolves a VMware step to.
pub fn vmrun_with_password(args: &[String], secret: &Secret) -> Option<Vec<String>> {
    if args.len() < 3 || args[0] != "-T" || args[1] != "ws" || args[2] != "start" {
        return None;
    }
    let mut out = Vec::with_capacity(args.len() + 2);
    out.extend_from_slice(&args[..2]);
    out.push("-vp".to_string());
    out.push(secret.expose().to_string());
    out.extend_from_slice(&args[2..]);
    Some(out)
}

/// True when the text might give away any of the password.
///
/// Not a search for the whole password: what a hypervisor says is cut to a
/// sentence before it reaches here, so a password repeated across the cut
/// shows only its start; and redacting in place would leave a mark where a
/// short password matched an ordinary word, which says what the password is.
/// So any run of the password's characters — four, or all of it when it is
/// shorter — found in the text, ignoring case, means the whole text is
/// withheld. A false alarm loses a diagnostic; a miss would lose the secret.
pub fn may_reveal(text: &str, secret: &Secret) -> bool {
    let chars: Vec<char> = secret.expose().chars().collect();
    if chars.is_empty() {
        return false;
    }
    let haystack = text.to_lowercase();
    let window = chars.len().min(4);
    chars.windows(window).any(|run| {
        let needle: String = run.iter().collect::<String>().to_lowercase();
        haystack.contains(&needle)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|a| a.to_string()).collect()
    }

    #[test]
    fn the_password_goes_among_the_flags_as_one_whole_argument() {
        let secret = Secret::new("p@ss word; & whoami");
        let out = vmrun_with_password(
            &args(&["-T", "ws", "start", r"C:\VMs\vault\vault.vmx", "gui"]),
            &secret,
        )
        .expect("the VMware shape");
        assert_eq!(
            out,
            args(&[
                "-T",
                "ws",
                "-vp",
                "p@ss word; & whoami",
                "start",
                r"C:\VMs\vault\vault.vmx",
                "gui"
            ])
        );
    }

    #[test]
    fn any_other_vector_is_refused_rather_than_guessed_at() {
        let secret = Secret::new("x");
        assert!(
            vmrun_with_password(&args(&["startvm", "dev", "--type", "gui"]), &secret).is_none()
        );
        assert!(vmrun_with_password(&args(&["-T", "ws", "stop", "a.vmx"]), &secret).is_none());
        assert!(vmrun_with_password(&[], &secret).is_none());
    }

    #[test]
    fn text_that_repeats_the_password_is_flagged_whole() {
        let secret = Secret::new("hunter2");
        assert!(may_reveal("Error: password hunter2 is incorrect", &secret));
        assert!(may_reveal("ERROR: HUNTER2", &secret));
        assert!(!may_reveal("Error: The file is already in use", &secret));
        assert!(!may_reveal("anything", &Secret::new("")));
    }

    #[test]
    fn a_password_cut_off_by_the_sentence_limit_is_still_caught() {
        // What reaches here is the first line, cut at a sentence's length;
        // the password may be only half there.
        let secret = Secret::new("Corr3ct-Horse-Battery");
        assert!(may_reveal("vmrun: bad value 'Corr3ct-Ho", &secret));
    }

    #[test]
    fn a_short_password_that_is_an_ordinary_word_withholds_rather_than_marks() {
        // A password of "vmrun" must not turn a path into "…\[redacted].exe".
        let secret = Secret::new("vmrun");
        assert!(may_reveal(
            r"the program was not found at C:\VMware\vmrun.exe",
            &secret
        ));
    }

    #[test]
    fn debug_never_prints_it() {
        let secret = Secret::new("hunter2");
        assert!(!format!("{secret:?}").contains("hunter2"));
    }

    #[test]
    fn it_reads_from_the_interface_as_a_plain_string() {
        let secret: Secret = serde_json::from_str("\"hunter2\"").unwrap();
        assert_eq!(secret.expose(), "hunter2");
    }
}
