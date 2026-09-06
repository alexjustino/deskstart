//! The operating-system surface: everything only the host can do.
//!
//! Windows-only paths are behind `cfg(windows)` and every one of them has a
//! declared fallback. A native capability that is unavailable must degrade
//! visibly — the frontend is told, and the user sees a plain surface instead of
//! Mica rather than a mysteriously wrong colour, and a step that could not be
//! started says why rather than vanishing.

pub mod accent;
pub mod close;
pub mod open;
pub mod process;
