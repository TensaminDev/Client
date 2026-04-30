use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScreenShareSource {
    id: String,
    kind: String,
    name: String,
    subtitle: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScreenShareAudioOutput {
    id: String,
    name: String,
    is_default: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScreenShareCapabilities {
    platform: String,
    #[serde(rename = "usesPipeWireAudioPicker")]
    uses_pipewire_audio_picker: bool,
    #[serde(rename = "supportsSystemAudioSwitch")]
    supports_system_audio_switch: bool,
    #[serde(rename = "supportsReliableSystemAudio")]
    supports_reliable_system_audio: bool,
}

#[tauri::command]
fn list_screen_share_sources() -> Result<Vec<ScreenShareSource>, String> {
    #[cfg(any(target_os = "linux", target_os = "windows", target_os = "macos"))]
    {
        use xcap::{Monitor, Window};

        let mut sources = Vec::new();
        let mut errors = Vec::new();

        match Monitor::all() {
            Ok(monitors) => {
                for (index, monitor) in monitors.into_iter().enumerate() {
                    let mut subtitle = None;

                    if monitor.is_primary().unwrap_or(false) {
                        subtitle = Some("Primary display".to_string());
                    }

                    sources.push(ScreenShareSource {
                        id: format!("screen:{index}"),
                        kind: "screen".to_string(),
                        name: monitor
                            .name()
                            .unwrap_or_else(|_| format!("Display {}", index + 1)),
                        subtitle,
                    });
                }
            }
            Err(error) => errors.push(format!("display listing failed: {error}")),
        }

        match Window::all() {
            Ok(windows) => {
                for (index, window) in windows.into_iter().enumerate() {
                    if window.is_minimized().unwrap_or(false) {
                        continue;
                    }

                    let title = window.title().unwrap_or_default();

                    if title.trim().is_empty() {
                        continue;
                    }

                    sources.push(ScreenShareSource {
                        id: format!("window:{index}"),
                        kind: "window".to_string(),
                        name: title,
                        subtitle: None,
                    });
                }
            }
            Err(error) => errors.push(format!("window listing failed: {error}")),
        }

        if sources.is_empty() {
            if errors.is_empty() {
                return Ok(sources);
            }

            return Err(errors.join("; "));
        }

        return Ok(sources);
    }

    #[allow(unreachable_code)]
    Ok(Vec::new())
}

#[tauri::command]
fn list_screen_share_audio_outputs() -> Result<Vec<ScreenShareAudioOutput>, String> {
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;

        let output = Command::new("pactl")
            .args(["list", "short", "sinks"])
            .output()
            .map_err(|error| error.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }

        let mut outputs = Vec::new();

        for line in String::from_utf8_lossy(&output.stdout).lines() {
            let mut parts = line.split('\t');

            let Some(id) = parts.next() else {
                continue;
            };

            let Some(name) = parts.next() else {
                continue;
            };

            let description = parts.next_back().unwrap_or(name).to_string();

            outputs.push(ScreenShareAudioOutput {
                id: id.to_string(),
                name: description,
                is_default: false,
            });
        }

        return Ok(outputs);
    }

    #[allow(unreachable_code)]
    Ok(Vec::new())
}

#[tauri::command]
fn capture_screen_share_frame(source_id: &str) -> Result<String, String> {
    #[cfg(any(target_os = "linux", target_os = "windows", target_os = "macos"))]
    {
        use base64::Engine;
        use image::{codecs::jpeg::JpegEncoder, DynamicImage};
        use std::io::Cursor;
        use xcap::{Monitor, Window};

        let Some((kind, index)) = source_id.split_once(':') else {
            return Err("Invalid source id".to_string());
        };

        let index = index
            .parse::<usize>()
            .map_err(|_| "Invalid source index".to_string())?;

        let frame = match kind {
            "screen" => Monitor::all()
                .map_err(|error| error.to_string())?
                .into_iter()
                .nth(index)
                .ok_or_else(|| "Screen source not found".to_string())?
                .capture_image()
                .map_err(|error| error.to_string())?,
            "window" => Window::all()
                .map_err(|error| error.to_string())?
                .into_iter()
                .filter(|window| !window.is_minimized().unwrap_or(false))
                .nth(index)
                .ok_or_else(|| "Window source not found".to_string())?
                .capture_image()
                .map_err(|error| error.to_string())?,
            _ => return Err("Unsupported source kind".to_string()),
        };

        let mut buffer = Cursor::new(Vec::new());
        let image = DynamicImage::ImageRgba8(frame);

        JpegEncoder::new_with_quality(&mut buffer, 70)
            .encode_image(&image)
            .map_err(|error| error.to_string())?;

        let encoded = base64::engine::general_purpose::STANDARD.encode(buffer.into_inner());
        return Ok(format!("data:image/jpeg;base64,{encoded}"));
    }

    #[allow(unreachable_code)]
    Err("Screen capture is not supported on this platform".to_string())
}

#[tauri::command]
fn get_screen_share_capabilities() -> ScreenShareCapabilities {
    ScreenShareCapabilities {
        platform: if cfg!(target_os = "linux") {
            "linux"
        } else if cfg!(target_os = "windows") {
            "windows"
        } else if cfg!(target_os = "macos") {
            "macos"
        } else {
            "other"
        }
        .to_string(),
        uses_pipewire_audio_picker: cfg!(target_os = "linux"),
        supports_system_audio_switch: cfg!(any(target_os = "windows", target_os = "macos")),
        supports_reliable_system_audio: cfg!(target_os = "windows"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    let builder = builder.command_line_args([
        ("enable-media-stream", None::<String>),
        ("enable-usermedia-screen-capturing", None::<String>),
        ("allow-http-screen-capture", None::<String>),
        #[cfg(target_os = "linux")]
        (
            "enable-features",
            Some("WebRTCPipeWireCapturer".to_string()),
        ),
    ]);

    let builder = builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(any(target_os = "ios", target_os = "android"))]
    let builder = builder.plugin(tauri_plugin_barcode_scanner::init());

    builder
        .setup(|app| {
            #[cfg(any(target_os = "linux", windows))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;

                if let Err(error) = app.deep_link().register_all() {
                    if cfg!(debug_assertions) {
                        eprintln!("Skipping deep link registration during dev: {error}");
                    } else {
                        return Err(error.into());
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_screen_share_sources,
            list_screen_share_audio_outputs,
            get_screen_share_capabilities,
            capture_screen_share_frame
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
