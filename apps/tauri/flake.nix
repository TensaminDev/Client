{
  description = "Tauri development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    rust-overlay.url = "github:oxalica/rust-overlay";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    rust-overlay,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (
      system: let
        overlays = [(import rust-overlay)];
        pkgs = import nixpkgs {
          inherit system overlays;
          config = {
            allowUnfree = true;
            android_sdk.accept_license = true;
          };
        };

        projectRoot = ".";
        androidHome = "${projectRoot}/.android";
        sdkRoot = "${androidHome}/sdk";
        ndkVersion = "29.0.14206865";

        android = pkgs.androidenv.composeAndroidPackages {
          cmdLineToolsVersion = "8.0";
          toolsVersion = "26.1.1";
          platformToolsVersion = "35.0.2";
          buildToolsVersions = ["35.0.0"];
          platformVersions = ["35" "36"];
          includeSources = false;
          includeSystemImages = false;
          includeNDK = true;
          ndkVersions = [ndkVersion];
          useGoogleAPIs = false;
        };

        rustToolchain = pkgs.rust-bin.stable.latest.default.override {
          extensions = ["rust-src" "rust-analyzer"];
          targets = [
            "aarch64-linux-android"
            "armv7-linux-androideabi"
            "i686-linux-android"
            "x86_64-linux-android"
            "wasm32-unknown-unknown"
          ];
        };

        desktopRuntimeLibs = with pkgs; [
          glib
          gtk3
          gdk-pixbuf
          pango
          cairo
          atk
          at-spi2-atk
          alsa-lib
          dbus
          cups
          expat
          libdrm
          libgbm
          libglvnd
          mesa
          libxkbcommon
          libx11
          libxcomposite
          libxdamage
          libxext
          libxfixes
          libxrandr
          libxcb
          systemd
          nspr
          nss
        ];
      in {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs;
            [
              jdk17
              rustToolchain
              gradle
              nodejs
              pkg-config
            ]
            ++ desktopRuntimeLibs
            ++ [
              android.androidsdk
              pkgs.android-studio-tools
            ];

          shellHook = ''
            sdkSource="${android.androidsdk}/libexec/android-sdk"

            mkdir -p "${androidHome}"
            if [ -L "${sdkRoot}" ]; then
              rm -f "${sdkRoot}"
            fi
            mkdir -p "${sdkRoot}"

            ln -sfn "$sdkSource/build-tools" "${sdkRoot}/build-tools"
            ln -sfn "$sdkSource/cmake" "${sdkRoot}/cmake"
            ln -sfn "$sdkSource/licenses" "${sdkRoot}/licenses"
            ln -sfn "$sdkSource/ndk" "${sdkRoot}/ndk"
            ln -sfn "$sdkSource/ndk-bundle" "${sdkRoot}/ndk-bundle"
            ln -sfn "$sdkSource/platforms" "${sdkRoot}/platforms"
            ln -sfn "$sdkSource/platform-tools" "${sdkRoot}/platform-tools"
            ln -sfn "$sdkSource/tools" "${sdkRoot}/tools"

            mkdir -p "${sdkRoot}/cmdline-tools"
            ln -sfn "$sdkSource/cmdline-tools/8.0" "${sdkRoot}/cmdline-tools/8.0"
            ln -sfn "8.0" "${sdkRoot}/cmdline-tools/latest"

            sdkRootAbs="$(realpath "${sdkRoot}")"
            ndkRootAbs="''${sdkRootAbs}/ndk/${ndkVersion}"

            export PATH="''${sdkRootAbs}/cmdline-tools/latest/bin:''${sdkRootAbs}/platform-tools:''${ndkRootAbs}:${pkgs.android-studio-tools}/bin:$PATH"
            export ANDROID_HOME="''${sdkRootAbs}"
            export ANDROID_SDK_ROOT="''${sdkRootAbs}"
            export ANDROID_NDK_ROOT="''${ndkRootAbs}"
            export ANDROID_NDK_HOME="$ANDROID_NDK_ROOT"
            export NDK_HOME="$ANDROID_NDK_ROOT"
            export NDK_PATH="$ANDROID_NDK_ROOT"
            export JAVA_HOME="${pkgs.jdk17}"
            export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath desktopRuntimeLibs}:$LD_LIBRARY_PATH"
          '';
        };
      }
    );
}
