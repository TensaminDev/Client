{
  description = "Tensamin client development and verification";

  inputs.prod-pins.url = "git+ssh://git@methanium.net/tensamin/prod-pins?ref=main";

  outputs = { self, prod-pins, ... }:
    let
      forSystems = prod-pins.inputs.nixpkgs.lib.genAttrs [ "x86_64-linux" "aarch64-linux" ];
      project = system: prod-pins.lib.mkPackages {
        inherit system;
        sources.client = self;
      };
    in {
      checks = forSystems (system: {
        inherit ((project system).packages) client client-web;
      });
      devShells = forSystems (system:
        let
          shared = project system;
          pkgs = import prod-pins.inputs.nixpkgs {
            inherit system;
            overlays = [ prod-pins.inputs.rust-overlay.overlays.default ];
            config = { allowUnfree = true; android_sdk.accept_license = true; };
          };
          electronArch = if pkgs.stdenv.hostPlatform.isAarch64 then "arm64" else "x64";
          electronRuntimeLibs = with pkgs; [
            alsa-lib at-spi2-atk at-spi2-core atk cairo cups dbus expat fontconfig
            freetype gdk-pixbuf glib gtk3 libdrm libgbm libglvnd libnotify
            libpulseaudio libsecret libuuid libxkbcommon mesa nspr nss pango
            pipewire systemd wayland libX11 libXScrnSaver libXcomposite libXcursor
            libXdamage libXext libXfixes libXi libXrandr libXtst libxcb
          ];
          buildToolsVersion = "35.0.0";
          ndkVersion = "29.0.14206865";
          android = pkgs.androidenv.composeAndroidPackages {
            cmdLineToolsVersion = "8.0";
            toolsVersion = "26.1.1";
            buildToolsVersions = [ buildToolsVersion ];
            platformVersions = [ "35" "36" ];
            includeSources = false;
            includeSystemImages = false;
            includeNDK = true;
            ndkVersions = [ ndkVersion ];
            useGoogleAPIs = false;
          };
          rustToolchain = pkgs.rust-bin.stable.latest.default.override {
            extensions = [ "rust-src" "rust-analyzer" "rustfmt" "clippy" ];
            targets = [
              "aarch64-linux-android" "armv7-linux-androideabi"
              "i686-linux-android" "x86_64-linux-android" "wasm32-unknown-unknown"
            ];
          };
          commonDeps = [ rustToolchain pkgs.wasm-pack pkgs.lld ];
          appImageToolsArchive = pkgs.fetchurl {
            url = "https://github.com/electron-userland/electron-builder-binaries/releases/download/appimage@1.0.3/appimage-tools-runtime-20251108.tar.gz";
            hash = "sha256-hAIaeO4hSub9M6LWKpK6JVQt0QvIa/EXqbLQu6ROdmU=";
          };
          appImageTools = pkgs.runCommand "electron-builder-appimage-tools-nix" {
            nativeBuildInputs = [ pkgs.gnutar pkgs.gzip ];
          } ''
            mkdir -p "$out"
            tar -xzf ${appImageToolsArchive} --strip-components=1 -C "$out"
            rm -f "$out/mksquashfs" "$out/desktop-file-validate"
            ln -s ${pkgs.squashfsTools}/bin/mksquashfs "$out/mksquashfs"
            ln -s ${pkgs.desktop-file-utils}/bin/desktop-file-validate "$out/desktop-file-validate"
          '';
          stageSource = ''
            # Match the relative native MTP paths, and share installs across CI steps.
            export TENSAMIN_CHECKOUT="$PWD"
            workRoot="/tmp/tensamin-dev-$UID/$(basename "$TENSAMIN_SOURCE")-$(basename ${shared.packages.mtp-sdk})"
            if [ ! -d "$workRoot" ]; then
              mkdir -p "$(dirname "$workRoot")"
              stage="$(mktemp -d "$workRoot.XXXXXX")"
              mkdir -p "$stage/tensamin/client"
              cp -R "$TENSAMIN_SOURCE/." "$stage/tensamin/client/" &&
                cp -R ${shared.packages.mtp-source} "$stage/mtp" &&
                chmod -R u+w "$stage" &&
                cp -R ${shared.packages.mtp-sdk}/. "$stage/tensamin/client/.mtp-sdk/" &&
                chmod -R u+w "$stage" &&
                mv -T "$stage" "$workRoot" || exit 1
            fi
            cd "$workRoot/tensamin/client"
          '';
          sourceEnv = {
            TENSAMIN_SOURCE = shared.packages.client-source;
            MTP_TYPE_MAPS = "${prod-pins.inputs.mtp-type-maps}/type-maps.yaml";
          };
        in rec {
          default = electron;
          electron = pkgs.mkShell (sourceEnv // {
            packages = (with pkgs; [
              nodejs_22 corepack_22 coreutils pnpm pkgs.electron pkg-config python3 gcc
              gnumake git jq patchelf dpkg rpm fpm curl fakeroot rsync xz p7zip
            ]) ++ electronRuntimeLibs ++ commonDeps;
            shellHook = stageSource + ''
              export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath electronRuntimeLibs}:$LD_LIBRARY_PATH"
              export ELECTRON_ENABLE_LOGGING=1
              export ELECTRON_OZONE_PLATFORM_HINT="''${ELECTRON_OZONE_PLATFORM_HINT:-auto}"
              export NPM_CONFIG_TARGET_ARCH="''${NPM_CONFIG_TARGET_ARCH:-${electronArch}}"
              export npm_config_build_from_source=true
              export USE_SYSTEM_FPM=true
              export ELECTRON_BUILDER_7ZIP_PATH="${pkgs.p7zip}/bin/7za"
              export APPIMAGE_TOOLS_PATH="${appImageTools}"
              alias electron-install='pnpm install'
              alias electron-build-web='pnpm run build:web'
              alias electron-dev='pnpm run dev'
              alias electron-package='pnpm run package:linux'
              alias electron-validate='pnpm run validate'
            '';
          });
          tauri = pkgs.mkShell (sourceEnv // {
            buildInputs = (with pkgs; [
              jdk17 gradle pnpm bun nodejs corepack_22 coreutils pkg-config git jq
              curl wget file webkitgtk_4_1 libsoup_3 gtk3 glib openssl librsvg
              libayatana-appindicator android-studio-tools
            ]) ++ [ android.androidsdk ] ++ commonDeps;
            shellHook = stageSource + ''
              sdkSource="${android.androidsdk}/libexec/android-sdk"
              projectRoot="$PWD/apps/tauri"
              androidHome="$projectRoot/.android"
              sdkRoot="$androidHome/sdk"
              mkdir -p "$sdkRoot/cmdline-tools"
              for component in build-tools cmake licenses ndk ndk-bundle platforms platform-tools tools; do
                if [ ! -e "$sdkRoot/$component" ] && [ ! -L "$sdkRoot/$component" ]; then
                  ln -s "$sdkSource/$component" "$sdkRoot/$component"
                fi
              done
              if [ ! -e "$sdkRoot/cmdline-tools/8.0" ]; then
                ln -s "$sdkSource/cmdline-tools/8.0" "$sdkRoot/cmdline-tools/8.0"
              fi
              if [ ! -e "$sdkRoot/cmdline-tools/latest" ]; then
                ln -s "8.0" "$sdkRoot/cmdline-tools/latest"
              fi
              sdkRootAbs="$(realpath "$sdkRoot")"
              ndkRootAbs="''${sdkRootAbs}/ndk/${ndkVersion}"
              export PATH="''${sdkRootAbs}/cmdline-tools/latest/bin:''${sdkRootAbs}/platform-tools:''${ndkRootAbs}:${pkgs.android-studio-tools}/bin:$PATH"
              export ANDROID_HOME="$sdkRootAbs"
              export ANDROID_SDK_ROOT="$sdkRootAbs"
              export ANDROID_NDK_ROOT="$ndkRootAbs"
              export ANDROID_NDK_HOME="$ANDROID_NDK_ROOT"
              export NDK_HOME="$ANDROID_NDK_ROOT"
              export NDK_PATH="$ANDROID_NDK_ROOT"
              export JAVA_HOME="${pkgs.jdk17}"
              # Keep Gradle configuration inside the staged workspace.
              export GRADLE_USER_HOME="$androidHome/gradle"
              mkdir -p "$GRADLE_USER_HOME"
              printf 'android.aapt2FromMavenOverride=%s\n' \
                "$sdkRootAbs/build-tools/${buildToolsVersion}/aapt2" > "$GRADLE_USER_HOME/gradle.properties"
              adb devices
            '';
          });
        });
    };
}
