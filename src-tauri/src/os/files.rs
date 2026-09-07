//! Reading and writing one profile file (F5).
//!
//! This is the narrowest file access the product could have and still trade
//! profiles: two functions, one path at a time, given by the person through the
//! system's own picker. There is no filesystem plugin and no allowed directory
//! — nothing here can enumerate, walk or glob, so nothing here can be talked
//! into reading somewhere it was not sent.
//!
//! A file that arrives is hostile until proven otherwise (SECURITY.md):
//!
//! - it must be a file, not a directory or a device;
//! - it must be small — a profile is a page of JSON, and a gigabyte named
//!   `.deskstart.json` is not one;
//! - it must be text. Bytes that are not UTF-8 are refused here rather than
//!   replaced with question marks and handed to a parser as if they were words.
//!
//! What comes back is a string. Nothing in this module decides what it means;
//! that is the domain's job, and the review screen's after it.

use std::fs;
use std::path::Path;

use crate::error::{Error, Result};

/// The most a profile file may be. Ten thousand steps of JSON is under this;
/// anything above it is not a profile.
pub const MAX_BYTES: u64 = 1024 * 1024;

/// The most a browser's bookmarks file may be. It holds everything a person
/// ever kept, so it is allowed to be much larger than a profile — and still
/// bounded, because it is still a file this product did not write.
pub const MAX_BOOKMARKS_BYTES: u64 = 32 * 1024 * 1024;

/// Read a profile file as text, or say why it could not be.
pub fn read_text(path: &Path) -> Result<String> {
    read_text_capped(path, MAX_BYTES)
}

/// The same, with the cap the caller's kind of file deserves.
pub fn read_text_capped(path: &Path, cap: u64) -> Result<String> {
    let metadata = fs::metadata(path).map_err(|error| {
        log::warn!("profile file not readable: {error}");
        Error::File("that file could not be opened")
    })?;
    if !metadata.is_file() {
        return Err(Error::File("that is not a file"));
    }
    if metadata.len() > cap {
        return Err(Error::File("that file is too large to be read"));
    }
    let bytes = fs::read(path).map_err(|error| {
        log::warn!("profile file not readable: {error}");
        Error::File("that file could not be read")
    })?;
    String::from_utf8(bytes).map_err(|_| Error::File("that file is not text"))
}

/// Write a profile file, replacing what is there. The path came from the
/// person, through the system's save dialog; nothing here invents one.
pub fn write_text(path: &Path, contents: &str) -> Result<()> {
    fs::write(path, contents).map_err(|error| {
        log::warn!("profile file not written: {error}");
        Error::File("that file could not be written")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A directory of this test's own, removed when it is done.
    struct Scratch(std::path::PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir().join(format!("deskstart-files-{name}"));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).expect("the scratch directory");
            Self(dir)
        }

        fn join(&self, name: &str) -> std::path::PathBuf {
            self.0.join(name)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn writes_and_reads_the_same_text() {
        let scratch = Scratch::new("round-trip");
        let path = scratch.join("Dev.deskstart.json");
        let text = "{\n  \"schemaVersion\": 1\n}\n";
        write_text(&path, text).expect("the file is written");
        assert_eq!(read_text(&path).expect("the file is read"), text);
    }

    #[test]
    fn refuses_what_is_not_there() {
        let scratch = Scratch::new("missing");
        let error = read_text(&scratch.join("nope.json")).expect_err("no such file");
        assert!(matches!(error, Error::File(_)));
    }

    #[test]
    fn refuses_a_directory() {
        let scratch = Scratch::new("directory");
        assert!(matches!(read_text(&scratch.0), Err(Error::File(_))));
    }

    #[test]
    fn refuses_a_file_too_large_to_be_a_profile() {
        let scratch = Scratch::new("large");
        let path = scratch.join("big.json");
        fs::write(&path, vec![b'a'; MAX_BYTES as usize + 1]).expect("the large file");
        assert!(matches!(read_text(&path), Err(Error::File(_))));
    }

    #[test]
    fn refuses_bytes_that_are_not_text() {
        let scratch = Scratch::new("binary");
        let path = scratch.join("binary.json");
        fs::write(&path, [0x7b, 0xff, 0xfe, 0x00]).expect("the binary file");
        assert!(matches!(read_text(&path), Err(Error::File(_))));
    }
}
