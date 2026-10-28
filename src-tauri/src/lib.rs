use serde::Deserialize;
use std::{
    sync::{Arc, Mutex},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, State,
};
use tauri_plugin_notification::NotificationExt;

#[derive(Clone, Default)]
struct NotificationSchedule(Arc<Mutex<Vec<ScheduledNotification>>>);

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScheduledNotification {
    id: String,
    at_millis: i64,
    title: String,
    body: String,
}

#[tauri::command]
fn set_notification_schedule(
    schedule: Vec<ScheduledNotification>,
    state: State<'_, NotificationSchedule>,
) -> Result<(), String> {
    let mut pending = state
        .0
        .lock()
        .map_err(|error| format!("Impossible de mettre à jour les alertes : {error}"))?;
    *pending = schedule;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(NotificationSchedule::default())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![set_notification_schedule])
        .setup(|app| {
            let app_handle = app.handle().clone();
            let schedule = app.state::<NotificationSchedule>().inner().clone();
            thread::spawn(move || loop {
                let now_millis = match SystemTime::now().duration_since(UNIX_EPOCH) {
                    Ok(duration) => duration.as_millis() as i64,
                    Err(error) => {
                        eprintln!("Impossible de lire l’heure système pour les alertes : {error}");
                        thread::sleep(Duration::from_secs(1));
                        continue;
                    }
                };

                let due = match schedule.0.lock() {
                    Ok(mut pending) => {
                        let mut due = Vec::new();
                        pending.retain(|item| {
                            if item.at_millis <= now_millis {
                                due.push(item.clone());
                                false
                            } else {
                                true
                            }
                        });
                        due
                    }
                    Err(error) => {
                        eprintln!("Impossible de lire les alertes planifiées : {error}");
                        thread::sleep(Duration::from_secs(1));
                        continue;
                    }
                };

                for item in due {
                    if let Err(error) = app_handle
                        .notification()
                        .builder()
                        .title(item.title)
                        .body(item.body)
                        .show()
                    {
                        eprintln!("Échec de la notification {} : {error}", item.id);
                    }
                }
                thread::sleep(Duration::from_millis(500));
            });

            let show_i = MenuItem::with_id(app, "show", "Afficher", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let icon = app
                .default_window_icon()
                .ok_or_else(|| tauri::Error::FailedToReceiveMessage)?;

            let _tray = TrayIconBuilder::new()
                .icon(icon.clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("KronoJ")
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            if std::env::args().any(|arg| arg == "--minimized") {
                if let Some(window) = app.get_webview_window("main") {
                    window.hide()?;
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
