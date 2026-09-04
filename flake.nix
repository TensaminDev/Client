{
  description = "Tensamin Client";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    rust-overlay.url = "github:oxalica/rust-overlay";
  };

  outputs =
    {
      self,
      nixpkgs,
      rust-overlay,
      ...
    }:
    let
      systems = [ "x86_64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      version = "0.0.11";
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
            overlays = [ (import rust-overlay) ];
            config = {
              allowUnfree = true;
              android_sdk.accept_license = true;
            };
          };
          electronRuntimeLibs = with pkgs; [
            alsa-lib
            at-spi2-atk
            at-spi2-core
            atk
            cairo
            cups
            dbus
            expat
            fontconfig
            freetype
            gdk-pixbuf
            glib
            gtk3
            libdrm
            libgbm
            libglvnd
            libnotify
            libpulseaudio
            libsecret
            libuuid
            libxkbcommon
            mesa
            nspr
            nss
            pango
            pipewire
            systemd
            wayland
            libX11
            libXScrnSaver
            libXcomposite
            libXcursor
            libXdamage
            libXext
            libXfixes
            libXi
            libXrandr
            libXtst
            libxcb
          ];
          electron = pkgs.electron;
          pnpm = pkgs.pnpm;
          mtpTypeMaps = pkgs.fetchgit {
            url = "https://git.methanium.net/tensamin/mtp-type-maps";
            rev = "6e5122fe44f793c0e0d3229b3d34145ce17c2d31";
            hash = "sha256-/4n8F0YLJaLncefKL907P5l+en1CTjpgdFmLBF3gbiQ=";
          };
          mtpSource = pkgs.fetchzip {
            url = "https://git.methanium.net/methanium/mtp/releases/download/0.3.0-dev-c7c7afe/mtp-0.3.0.tgz";
            hash = "sha256-XLTa8DxP93Q4hBHRCLUzCPOqkbdb4V3aZxE5Iuq+kW0=";
          };
          mtpCargoDeps = pkgs.rustPlatform.fetchCargoVendor {
            src = mtpSource;
            hash = "sha256-8MZ65N/EtWPAggal0JkGDx3WSn+LxWQORinkqVbsrys=";
          };
          wasmBindgenCliSource = pkgs.fetchCrate {
            pname = "wasm-bindgen-cli";
            version = "0.2.127";
            hash = "sha256-di+qBAdd7pENLiIB9CoZoab+W5xeDoByMREcCGTSzWo=";
          };
          wasmBindgenCli = pkgs.buildWasmBindgenCli {
            src = wasmBindgenCliSource;
            cargoDeps = pkgs.rustPlatform.fetchCargoVendor {
              src = wasmBindgenCliSource;
              hash = "sha256-FTv2GZIAQs0ePdIZXIXil7JbZ6kIT05VG6vqC1qNFxQ=";
            };
          };
          desktopItem = pkgs.makeDesktopItem {
            name = "tensamin";
            desktopName = "Tensamin";
            exec = "tensamin";
            icon = "tensamin";
            startupWMClass = "Tensamin";
            categories = [ "Network" ];
          };
          defaultPackage = pkgs.stdenv.mkDerivation (finalAttrs: {
            pname = "tensamin";
            inherit version;
            src = self;

            pnpmDeps = pkgs.fetchPnpmDeps {
              inherit (finalAttrs) pname version src;
              inherit pnpm;
              fetcherVersion = 4;
              hash = "sha256-imP3MTr1YLc28Z9n617m0Wt/6vPirFznzoriKzojlEg=";
            };

            nativeBuildInputs = with pkgs; [
              copyDesktopItems
              makeWrapper
              nodejs_22
              pnpm
              pnpmConfigHook
              cargo
              lld
              rustc
              wasm-pack
              wasmBindgenCli
              binaryen
            ];

            env.ELECTRON_SKIP_BINARY_DOWNLOAD = 1;

            postPatch = ''
              rm -rf mtp-type-maps
              ln -s ${mtpTypeMaps} mtp-type-maps

              node -e '
                const fs = require("fs");
                const path = "apps/electron/package.json";
                const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
                pkg.version = "${version}";
                fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
              '
            '';

            buildPhase = ''
              runHook preBuild

              mkdir -p "$HOME/.cargo"
              substitute ${mtpCargoDeps}/.cargo/config.toml "$HOME/.cargo/config.toml" \
                --replace-fail @vendor@ ${mtpCargoDeps}

              pnpm run copy-licenses
              pnpm run build:packages
              pnpm run build:web
              pnpm --dir apps/tauri run gen-icons
              pnpm --dir apps/electron run build
              pnpm --dir apps/electron exec electron-builder --dir --linux --publish never \
                --config.electronDist=${electron.dist} \
                --config.electronVersion=${electron.version}

              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall

              mkdir -p "$out/lib/tensamin" "$out/bin"
              cp -r apps/electron/release/linux-unpacked/. "$out/lib/tensamin/"

              makeWrapper "$out/lib/tensamin/tensamin" "$out/bin/tensamin" \
                --prefix LD_LIBRARY_PATH : "${pkgs.lib.makeLibraryPath electronRuntimeLibs}"

              install -Dm644 apps/electron/build/icons/icon.png \
                "$out/share/icons/hicolor/512x512/apps/tensamin.png"

              runHook postInstall
            '';

            desktopItems = [ desktopItem ];

            meta = {
              description = "Tensamin desktop client";
              homepage = "https://git.methanium.net/tensamin/client";
              mainProgram = "tensamin";
              platforms = pkgs.lib.platforms.linux;
            };
          });
        in
        {
          default = defaultPackage;
          tensamin = defaultPackage;
          electron = defaultPackage;
        }
      );

      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
            overlays = [ (import rust-overlay) ];
            config = {
              allowUnfree = true;
              android_sdk.accept_license = true;
            };
          };

          electronRuntimeLibs = with pkgs; [
            alsa-lib
            at-spi2-atk
            at-spi2-core
            atk
            cairo
            cups
            dbus
            expat
            fontconfig
            freetype
            gdk-pixbuf
            glib
            gtk3
            libdrm
            libgbm
            libglvnd
            libnotify
            libpulseaudio
            libsecret
            libuuid
            libxkbcommon
            mesa
            nspr
            nss
            pango
            pipewire
            systemd
            wayland
            libX11
            libXScrnSaver
            libXcomposite
            libXcursor
            libXdamage
            libXext
            libXfixes
            libXi
            libXrandr
            libXtst
            libxcb
          ];

          buildToolsVersion = "35.0.0";
          ndkVersion = "29.0.14206865";
          android = pkgs.androidenv.composeAndroidPackages {
            cmdLineToolsVersion = "8.0";
            toolsVersion = "26.1.1";
            platformToolsVersion = "35.0.2";
            buildToolsVersions = [ buildToolsVersion ];
            platformVersions = [
              "35"
              "36"
            ];
            includeSources = false;
            includeSystemImages = false;
            includeNDK = true;
            ndkVersions = [ ndkVersion ];
            useGoogleAPIs = false;
          };
          rustToolchain = pkgs.rust-bin.stable.latest.default.override {
            extensions = [
              "rust-src"
              "rust-analyzer"
            ];
            targets = [
              "aarch64-linux-android"
              "armv7-linux-androideabi"
              "i686-linux-android"
              "x86_64-linux-android"
              "wasm32-unknown-unknown"
            ];
          };

          commonDeps = [
            rustToolchain
            pkgs.wasm-pack
            pkgs.lld
          ];
          appImageToolsArchive = pkgs.fetchurl {
            url = "https://github.com/electron-userland/electron-builder-binaries/releases/download/appimage@1.0.3/appimage-tools-runtime-20251108.tar.gz";
            hash = "sha256-hAIaeO4hSub9M6LWKpK6JVQt0QvIa/EXqbLQu6ROdmU=";
          };
          appImageTools =
            pkgs.runCommand "electron-builder-appimage-tools-nix"
              {
                nativeBuildInputs = [
                  pkgs.gnutar
                  pkgs.gzip
                ];
              }
              ''
                mkdir -p "$out"
                tar -xzf ${appImageToolsArchive} --strip-components=1 -C "$out"
                rm -f "$out/mksquashfs" "$out/desktop-file-validate"
                ln -s ${pkgs.squashfsTools}/bin/mksquashfs "$out/mksquashfs"
                ln -s ${pkgs.desktop-file-utils}/bin/desktop-file-validate "$out/desktop-file-validate"
              '';
        in
        rec {
          default = electron;

          electron = pkgs.mkShell {
            packages =
              with pkgs;
              [
                nodejs_22
                corepack_22
                coreutils
                pnpm
                pkgs.electron
                pkg-config
                python3
                gcc
                gnumake
                git
                jq
                patchelf
                dpkg
                rpm
                fpm
                curl
                fakeroot
                rsync
                xz
                p7zip
              ]
              ++ electronRuntimeLibs
              ++ commonDeps;

            shellHook = ''
              export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath electronRuntimeLibs}:$LD_LIBRARY_PATH"
              export ELECTRON_ENABLE_LOGGING=1
              export ELECTRON_OZONE_PLATFORM_HINT="''${ELECTRON_OZONE_PLATFORM_HINT:-auto}"
              export NPM_CONFIG_TARGET_ARCH="''${NPM_CONFIG_TARGET_ARCH:-x64}"
              export npm_config_build_from_source=true
              export USE_SYSTEM_FPM=true
              export ELECTRON_BUILDER_7ZIP_PATH="${pkgs.p7zip}/bin/7za"
              export APPIMAGE_TOOLS_PATH="${appImageTools}"

              alias electron-install='cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" && pnpm install'
              alias electron-build-web='cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" && pnpm run build:web'
              alias electron-dev='pnpm run dev'
              alias electron-package='pnpm run package:linux'
              alias electron-validate='pnpm run validate'
            '';
          };

          tauri = pkgs.mkShell {
            buildInputs =
              with pkgs;
              [
                jdk17
                gradle
                pnpm
                bun
                nodejs
                corepack_22
                coreutils
                pkg-config
                git
                jq
                curl
                wget
                file
                webkitgtk_4_1
                libsoup_3
                gtk3
                glib
                openssl
                librsvg
                libayatana-appindicator
              ]
              ++ [
                android.androidsdk
                android-studio-tools
              ]
              ++ commonDeps;

            shellHook = ''
              sdkSource="${android.androidsdk}/libexec/android-sdk"
              if [ -d apps/tauri/src-tauri ]; then
                projectRoot="$PWD/apps/tauri"
              else
                projectRoot="$PWD"
              fi
              androidHome="$projectRoot/.android"
              sdkRoot="$androidHome/sdk"

              mkdir -p "$androidHome"
              if [ -L "$sdkRoot" ]; then
                rm -f "$sdkRoot"
              fi
              mkdir -p "$sdkRoot"

              ln -sfn "$sdkSource/build-tools" "$sdkRoot/build-tools"
              ln -sfn "$sdkSource/cmake" "$sdkRoot/cmake"
              ln -sfn "$sdkSource/licenses" "$sdkRoot/licenses"
              ln -sfn "$sdkSource/ndk" "$sdkRoot/ndk"
              ln -sfn "$sdkSource/ndk-bundle" "$sdkRoot/ndk-bundle"
              ln -sfn "$sdkSource/platforms" "$sdkRoot/platforms"
              ln -sfn "$sdkSource/platform-tools" "$sdkRoot/platform-tools"
              ln -sfn "$sdkSource/tools" "$sdkRoot/tools"

              mkdir -p "$sdkRoot/cmdline-tools"
              ln -sfn "$sdkSource/cmdline-tools/8.0" "$sdkRoot/cmdline-tools/8.0"
              ln -sfn "8.0" "$sdkRoot/cmdline-tools/latest"

              sdkRootAbs="$(realpath "$sdkRoot")"
              ndkRootAbs="''${sdkRootAbs}/ndk/${ndkVersion}"

              export PATH="''${sdkRootAbs}/cmdline-tools/latest/bin:''${sdkRootAbs}/platform-tools:''${ndkRootAbs}:${pkgs.android-studio-tools}/bin:$PATH"
              export ANDROID_HOME="''${sdkRootAbs}"
              export ANDROID_SDK_ROOT="''${sdkRootAbs}"
              export ANDROID_NDK_ROOT="''${ndkRootAbs}"
              export ANDROID_NDK_HOME="$ANDROID_NDK_ROOT"
              export NDK_HOME="$ANDROID_NDK_ROOT"
              export NDK_PATH="$ANDROID_NDK_ROOT"
              export JAVA_HOME="${pkgs.jdk17}"

              aapt2Path="''${sdkRootAbs}/build-tools/${buildToolsVersion}/aapt2"
              if [ -x "$aapt2Path" ]; then
                mkdir -p "$HOME/.gradle"
                gradleProperties="$HOME/.gradle/gradle.properties"
                touch "$gradleProperties"
                if grep -q '^android\.aapt2FromMavenOverride=' "$gradleProperties"; then
                  sed -i "s|^android\.aapt2FromMavenOverride=.*|android.aapt2FromMavenOverride=$aapt2Path|" "$gradleProperties"
                else
                  printf '\nandroid.aapt2FromMavenOverride=%s\n' "$aapt2Path" >> "$gradleProperties"
                fi
              fi

              adb devices
            '';
          };
        }
      );
    };
}
