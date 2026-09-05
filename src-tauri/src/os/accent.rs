//! The Windows accent colour, read from the system and followed live.
//!
//! Windows exposes an accent *ramp*, not a single colour: the base plus three
//! lighter and three darker steps. A Fluent interface needs the ramp, because
//! the shade that works on a light surface is not the shade that works on a
//! dark one. We hand the whole ramp to the frontend and let the token layer
//! choose per theme.

use serde::Serialize;

/// The accent ramp, as CSS hex strings.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct AccentRamp {
    pub accent: String,
    pub light1: String,
    pub light2: String,
    pub light3: String,
    pub dark1: String,
    pub dark2: String,
    pub dark3: String,
    /// False when the ramp is the built-in Windows default rather than the
    /// user's real setting. The frontend surfaces this in Settings instead of
    /// pretending it succeeded.
    pub from_system: bool,
}

impl Default for AccentRamp {
    /// The Windows 11 default blue. Used when the system cannot be asked.
    fn default() -> Self {
        Self {
            accent: "#0078d4".into(),
            light1: "#0086f0".into(),
            light2: "#4cb3ff".into(),
            light3: "#83ccff".into(),
            dark1: "#006cbe".into(),
            dark2: "#005ba1".into(),
            dark3: "#004377".into(),
            from_system: false,
        }
    }
}

#[cfg(windows)]
pub fn read() -> AccentRamp {
    use windows::UI::ViewManagement::{UIColorType, UISettings};

    let Ok(settings) = UISettings::new() else {
        log::warn!("UISettings unavailable; falling back to the default accent ramp");
        return AccentRamp::default();
    };

    let hex = |kind: UIColorType| -> Option<String> {
        let c = settings.GetColorValue(kind).ok()?;
        Some(format!("#{:02x}{:02x}{:02x}", c.R, c.G, c.B))
    };

    let Some(accent) = hex(UIColorType::Accent) else {
        log::warn!("the accent colour could not be read; falling back to the default ramp");
        return AccentRamp::default();
    };

    let default = AccentRamp::default();
    AccentRamp {
        accent,
        light1: hex(UIColorType::AccentLight1).unwrap_or(default.light1),
        light2: hex(UIColorType::AccentLight2).unwrap_or(default.light2),
        light3: hex(UIColorType::AccentLight3).unwrap_or(default.light3),
        dark1: hex(UIColorType::AccentDark1).unwrap_or(default.dark1),
        dark2: hex(UIColorType::AccentDark2).unwrap_or(default.dark2),
        dark3: hex(UIColorType::AccentDark3).unwrap_or(default.dark3),
        from_system: true,
    }
}

#[cfg(not(windows))]
pub fn read() -> AccentRamp {
    // Not a silent failure: `from_system` is false and the UI says so.
    AccentRamp::default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_default_ramp_is_valid_css() {
        let ramp = AccentRamp::default();
        for hex in [
            &ramp.accent,
            &ramp.light1,
            &ramp.light2,
            &ramp.light3,
            &ramp.dark1,
            &ramp.dark2,
            &ramp.dark3,
        ] {
            assert_eq!(hex.len(), 7, "`{hex}` is not #rrggbb");
            assert!(hex.starts_with('#'), "`{hex}` is not #rrggbb");
            assert!(
                hex[1..].chars().all(|c| c.is_ascii_hexdigit()),
                "`{hex}` is not #rrggbb"
            );
        }
    }

    #[test]
    fn the_default_ramp_declares_it_is_not_from_the_system() {
        // The frontend relies on this to tell the user the truth in Settings.
        assert!(!AccentRamp::default().from_system);
    }

    #[test]
    fn reading_never_panics_and_always_yields_a_usable_ramp() {
        let ramp = read();
        assert_eq!(ramp.accent.len(), 7);
    }
}
