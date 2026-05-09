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
    show_audio_output_selector: bool,
    show_audio_switch: bool,
    has_reliable_system_audio: bool,
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
fn list_audio_outputs() -> Result<Vec<ScreenShareAudioOutput>, String> {
    #[cfg(target_os = "linux")]
    {
        use serde_json::Value;
        use std::process::Command;

        let output = Command::new("pactl")
            .args(["--format=json", "list", "sinks"])
            .output()
            .map_err(|error| error.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }

        let default_sink = Command::new("pactl")
            .arg("get-default-sink")
            .output()
            .ok()
            .filter(|result| result.status.success())
            .map(|result| String::from_utf8_lossy(&result.stdout).trim().to_string());

        let sinks: Value = serde_json::from_slice(&output.stdout).map_err(|error| error.to_string())?;
        let sink_entries = sinks
            .as_array()
            .ok_or_else(|| "Unexpected pactl sink response".to_string())?;

        let mut outputs = Vec::new();

        for sink in sink_entries {
            let Some(index) = sink.get("index").and_then(Value::as_i64) else {
                continue;
            };

            let Some(name) = sink.get("name").and_then(Value::as_str) else {
                continue;
            };

            let description = sink
                .get("description")
                .and_then(Value::as_str)
                .or_else(|| {
                    sink.get("properties")
                        .and_then(|properties| properties.get("device.description"))
                        .and_then(Value::as_str)
                })
                .unwrap_or(name)
                .to_string();

            let is_default = default_sink.as_deref() == Some(name);

            outputs.push(ScreenShareAudioOutput {
                id: index.to_string(),
                name: description,
                is_default,
            });
        }

        outputs.sort_by_key(|output| !output.is_default);

        return Ok(outputs);
    }

    #[allow(unreachable_code)]
    Ok(Vec::new())
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
        show_audio_output_selector: cfg!(target_os = "linux"),
        show_audio_switch: cfg!(any(target_os = "windows", target_os = "macos")),
        has_reliable_system_audio: cfg!(target_os = "windows"),
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

    #[cfg(any(target_os = "ios", target_os = "android"))]
    let builder = builder.plugin(tauri_plugin_app_events::init());

    if let Err(error) = builder
        .setup(|_app| {
            #[cfg(any(target_os = "linux", windows))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;

                if let Err(error) = _app.deep_link().register_all() {
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
            list_audio_outputs,
            get_screen_share_capabilities
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("error while running tauri application: {error}");
        panic!("error while running tauri application: {error}");
    }
}
