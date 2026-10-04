use std::{
    future::Future,
    pin::Pin,
    sync::{Arc, OnceLock},
    time::Duration,
};

use mtp::{
    codec::{CommunicationType, CommunicationValue, DataType, DataValue},
    common::CommunicationError,
};
use tauri_plugin_mtp::{Endpoint, HostCallbacks, Manager, Session};

pub const CONNECTION_NAME: &str = "mtp:credentials";
static MANAGER: OnceLock<Arc<Manager>> = OnceLock::new();

pub fn manager() -> Arc<Manager> {
    MANAGER
        .get_or_init(|| {
            let manager = Manager::new(Arc::new(Callbacks));
            // Tensamin's password enrollment and device backups require serialization.
            // The separate export-credentials capability still gates every JS export.
            manager.set_credential_export(true);
            tauri_plugin_mtp::mobile::install(manager.clone()).expect("install MTP lifecycle");
            let observer = manager.clone();
            crate::mtp_backend::spawn_plugin_observer(observer);
            manager
        })
        .clone()
}

// Android also loads this cdylib in a boot-started service, before Tauri runs.
#[cfg(target_os = "android")]
#[used]
#[link_section = ".init_array"]
static INITIALIZE: extern "C" fn() = {
    extern "C" fn initialize() {
        let _ = manager();
    }
    initialize
};

struct Callbacks;

impl HostCallbacks for Callbacks {
    fn resolve<'a>(
        &'a self,
        name: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<Endpoint, CommunicationError>> + Send + 'a>> {
        Box::pin(async move {
            crate::mtp_backend::resolve_plugin_endpoint(name)
                .await
                .map_err(CommunicationError::Other)
        })
    }

    fn message<'a>(
        &'a self,
        name: &'a str,
        session: Arc<Session>,
        frame: CommunicationValue,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
        Box::pin(async move {
            if name != CONNECTION_NAME {
                return;
            }
            crate::mtp_backend::handle_plugin_message(session, frame).await;
        })
    }
}

pub async fn synchronize(session: &Session) -> Result<serde_json::Value, String> {
    let request = CommunicationValue::new(CommunicationType::AccountStateRequest)
        .add_typed_default(DataType::DeviceClass, DataValue::Str("mobile".into()))
        .add_typed_default(DataType::NotificationCapable, DataValue::Bool(true));
    let state = session
        .request(
            request,
            Some(CommunicationType::AccountStateSnapshot),
            Duration::from_secs(30),
        )
        .await
        .map_err(|e| e.to_string())?;
    let state = crate::mtp_backend::validated_plugin_state(&state)?;
    session
        .request(
            CommunicationValue::new(CommunicationType::AccountStateApplied),
            None,
            Duration::from_secs(30),
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(state)
}
