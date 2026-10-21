// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn validate_sync_file_path(file_path: &str) -> Result<std::path::PathBuf, String> {
    let path = std::path::PathBuf::from(file_path.trim());
    for comp in path.components() {
        if matches!(comp, std::path::Component::ParentDir) {
            return Err("Invalid sync file path: parent directory traversal is not allowed.".into());
        }
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    if ext != "rmsync" && ext != "rmvault" {
        return Err("Access denied: only .rmsync and .rmvault sync files are permitted.".into());
    }
    Ok(path)
}

#[tauri::command]
fn read_sync_file(file_path: String) -> Result<String, String> {
    let valid_path = validate_sync_file_path(&file_path)?;
    std::fs::read_to_string(&valid_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_sync_file(file_path: String, contents: String) -> Result<bool, String> {
    let valid_path = validate_sync_file_path(&file_path)?;
    if let Some(parent) = valid_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&valid_path, contents).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
fn get_sync_file_modified_time(file_path: String) -> Result<u64, String> {
    let valid_path = validate_sync_file_path(&file_path)?;
    let metadata = std::fs::metadata(&valid_path).map_err(|e| e.to_string())?;
    let modified = metadata.modified().map_err(|e| e.to_string())?;
    let duration = modified.duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?;
    Ok(duration.as_secs())
}

#[tauri::command]
fn pick_sync_folder() -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let script = r#"
            Add-Type -AssemblyName System.Windows.Forms
            $f = New-Object System.Windows.Forms.FolderBrowserDialog
            $f.Description = "Select your Cloud Sync Folder (Dropbox, iCloud, Google Drive, OneDrive, etc.)"
            $f.ShowNewFolderButton = $true
            if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
                Write-Output $f.SelectedPath
            }
        "#;
        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", script])
            .output()
            .map_err(|e| e.to_string())?;
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            Ok(None)
        } else {
            Ok(Some(path))
        }
    }
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let output = Command::new("osascript")
            .args([
                "-e",
                r#"POSIX path of (choose folder with prompt "Select your Cloud Sync Folder (iCloud Drive, Dropbox, Google Drive, etc.)")"#,
            ])
            .output()
            .map_err(|e| e.to_string())?;
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            Ok(None)
        } else {
            Ok(Some(path))
        }
    }
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        if let Ok(output) = Command::new("zenity")
            .args(["--file-selection", "--directory", "--title=Select Cloud Sync Folder"])
            .output()
        {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Ok(Some(path));
            }
        }
        Ok(None)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Ok(None)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notification::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            greet,
            read_sync_file,
            write_sync_file,
            get_sync_file_modified_time,
            pick_sync_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
