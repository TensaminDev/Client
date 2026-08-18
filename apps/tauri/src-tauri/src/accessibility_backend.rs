#[cfg(not(target_os = "android"))]
const DEFAULT_INITIAL_SCALE: i32 = 290;
const MIN_INITIAL_SCALE: i32 = 210;
const MAX_INITIAL_SCALE: i32 = 500;

#[tauri::command]
pub fn accessibility_get_initial_scale() -> Result<i32, String> {
    android_get_initial_scale()
}

#[tauri::command]
pub fn accessibility_set_initial_scale(initial_scale: i32) -> Result<(), String> {
    if !(MIN_INITIAL_SCALE..=MAX_INITIAL_SCALE).contains(&initial_scale) {
        return Err(format!(
            "Initial scale must be between {MIN_INITIAL_SCALE} and {MAX_INITIAL_SCALE}"
        ));
    }

    android_set_initial_scale(initial_scale)
}

#[cfg(not(target_os = "android"))]
fn android_get_initial_scale() -> Result<i32, String> {
    Ok(DEFAULT_INITIAL_SCALE)
}

#[cfg(not(target_os = "android"))]
fn android_set_initial_scale(_: i32) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "android")]
mod android {
    use std::sync::OnceLock;

    use jni::{
        jni_sig, jni_str,
        objects::{Global, JClass, JObject, JValue},
        Env, EnvUnowned, JavaVM,
    };

    struct Host {
        vm: JavaVM,
        context: Global<JObject<'static>>,
        bridge: Global<JObject<'static>>,
    }

    static HOST: OnceLock<Host> = OnceLock::new();

    fn attach(env: &mut Env, context: JObject) -> Result<(), String> {
        if HOST.get().is_some() {
            return Ok(());
        }

        let class = env
            .find_class(jni_str!("net/tensamin/client/NativeAccessibilityBridge"))
            .map_err(|error| error.to_string())?;
        let bridge = env
            .get_static_field(
                class,
                jni_str!("INSTANCE"),
                jni_sig!("Lnet/tensamin/client/NativeAccessibilityBridge;"),
            )
            .and_then(|value| value.l())
            .map_err(|error| error.to_string())?;

        HOST.set(Host {
            vm: env.get_java_vm().map_err(|error| error.to_string())?,
            context: env
                .new_global_ref(context)
                .map_err(|error| error.to_string())?,
            bridge: env
                .new_global_ref(bridge)
                .map_err(|error| error.to_string())?,
        })
        .map_err(|_| "Android accessibility host is already attached".to_string())
    }

    fn with_env<T>(call: impl FnOnce(&mut Env, &Host) -> Result<T, String>) -> Result<T, String> {
        let host = HOST
            .get()
            .ok_or("Android accessibility host is not attached")?;
        host.vm
            .attach_current_thread(|env| Ok::<_, jni::errors::Error>(call(env, host)))
            .map_err(|error| error.to_string())?
    }

    pub fn get_initial_scale() -> Result<i32, String> {
        with_env(|env, host| {
            env.call_method(
                host.bridge.as_obj(),
                jni_str!("getInitialScale"),
                jni_sig!("(Landroid/content/Context;)I"),
                &[JValue::Object(host.context.as_obj())],
            )
            .and_then(|value| value.i())
            .map_err(|error| error.to_string())
        })
    }

    pub fn set_initial_scale(initial_scale: i32) -> Result<(), String> {
        with_env(|env, host| {
            env.call_method(
                host.bridge.as_obj(),
                jni_str!("setInitialScale"),
                jni_sig!("(Landroid/content/Context;I)V"),
                &[
                    JValue::Object(host.context.as_obj()),
                    JValue::Int(initial_scale),
                ],
            )
            .map_err(|error| error.to_string())?;
            Ok(())
        })
    }

    #[no_mangle]
    pub extern "system" fn Java_net_tensamin_client_NativeAccessibilityBridge_nativeAttach<
        'caller,
    >(
        mut env: EnvUnowned<'caller>,
        _class: JClass,
        context: JObject<'caller>,
    ) {
        let _ = env.with_env(|env| {
            let _ = attach(env, context);
            Ok::<_, jni::errors::Error>(())
        });
    }
}

#[cfg(target_os = "android")]
use android::{
    get_initial_scale as android_get_initial_scale, set_initial_scale as android_set_initial_scale,
};
