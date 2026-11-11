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
use tauri_plugin_notification::{Action, ActionType, NotificationExt};

#[derive(Default)]
struct PendingNotifications {
    scheduled: Vec<ScheduledNotification>,
    snoozed: Vec<ScheduledNotification>,
}

#[derive(Clone, Default)]
struct NotificationSchedule(Arc<Mutex<PendingNotifications>>);

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScheduledNotification {
    id: String,
    at_millis: i64,
    title: String,
    body: String,
    #[serde(default)]
    action_type_id: Option<String>,
}

fn take_due(
    pending: &mut Vec<ScheduledNotification>,
    now_millis: i64,
) -> Vec<ScheduledNotification> {
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

#[tauri::command]
fn set_notification_schedule(
    schedule: Vec<ScheduledNotification>,
    state: State<'_, NotificationSchedule>,
) -> Result<(), String> {
    let mut pending = state
        .0
        .lock()
        .map_err(|error| format!("Impossible de mettre à jour les alertes : {error}"))?;
    pending.scheduled = schedule;
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
            let notification = app_handle.notification();
            notification.register_action_types(vec![
                ActionType::builder("rosh-hodesh-fr")
                    .actions(vec![Action::builder("snooze", "Rappeler dans 2 heures").build()])
                    .build(),
                ActionType::builder("rosh-hodesh-he")
                    .actions(vec![Action::builder("snooze", "תזכיר לי בעוד שעתיים").build()])
                    .build(),
            ])?;
            let snooze_schedule = schedule.clone();
            notification.on_action(move |performed| {
                if performed.action_id() != "snooze" {
                    return;
                }

                let now_millis = match SystemTime::now().duration_since(UNIX_EPOCH) {
                    Ok(duration) => duration.as_millis() as i64,
                    Err(error) => {
                        eprintln!("Impossible de lire l’heure pour le rappel différé : {error}");
                        return;
                    }
                };
                let notification = performed.notification();
                let title = notification
                    .and_then(|item| item.title())
                    .unwrap_or("KronoJ · Roch Hodech")
                    .to_owned();
                let body = notification
                    .and_then(|item| item.body())
                    .unwrap_or("Rappel : ce soir, c’est Roch Hodech.")
                    .to_owned();
                let postponed = ScheduledNotification {
                    id: "rosh-hodesh-snoozed".to_owned(),
                    at_millis: now_millis + Duration::from_secs(2 * 60 * 60).as_millis() as i64,
                    title,
                    body,
                    action_type_id: None,
                };

                match snooze_schedule.0.lock() {
                    Ok(mut pending) => pending.snoozed.push(postponed),
                    Err(error) => {
                        eprintln!("Impossible de reporter le rappel de Roch Hodech : {error}");
                    }
                }
            })?;

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
                        let mut due = take_due(&mut pending.scheduled, now_millis);
                        due.extend(take_due(&mut pending.snoozed, now_millis));
                        due
                    }
                    Err(error) => {
                        eprintln!("Impossible de lire les alertes planifiées : {error}");
                        thread::sleep(Duration::from_secs(1));
                        continue;
                    }
                };

                for item in due {
                    if now_millis.saturating_sub(item.at_millis) > 60_000 {
                        eprintln!(
                            "Notification {} ignorée car son échéance est dépassée.",
                            item.id
                        );
                        continue;
                    }

                    let mut builder = app_handle
                        .notification()
                        .builder()
                        .title(item.title)
                        .body(item.body);
                    if let Some(action_type_id) = item.action_type_id {
                        builder = builder.action_type_id(action_type_id);
                    }
                    if let Err(error) = builder.show() {
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
