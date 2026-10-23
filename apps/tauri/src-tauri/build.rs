fn main() {
    tauri_build::build();

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        // JNI must match the Kotlin namespace, not the channel-specific application ID.
        println!("cargo:rustc-env=TAURI_ANDROID_PACKAGE_NAME_PREFIX=net_tensamin");
        println!("cargo:rustc-env=TAURI_ANDROID_PACKAGE_NAME_APP_NAME=client");
    }
}
