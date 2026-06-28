{
  description = "Tensamin Client";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    rust-overlay.url = "github:oxalica/rust-overlay";
  };

  outputs = {
    self,
    nixpkgs,
    rust-overlay,
    ...
  }: let
    systems = ["x86_64-linux"];
    forAllSystems = nixpkgs.lib.genAttrs systems;
    version = "0.0.10";
    x86_64DebHash = "sha256-VVKkZ9yQ7BoLnYnCf5OSHcrakoBNfUx/uWxBmm3gBZE=";
    forgejoBaseUrl = "https://git.methanium.net/tensamin/client/releases/download/${version}";
  in {
    packages = forAllSystems (system: let
      pkgs = import nixpkgs {
        inherit system;
        overlays = [(import rust-overlay)];
        config = {
          allowUnfree = true;
          android_sdk.accept_license = true;
        };
      };
      debArtifact = "Tensamin-${version}-linux-amd64.deb";

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
      packageDeb = src:
        pkgs.stdenv.mkDerivation {
          pname = "tensamin";
          inherit version src;

          nativeBuildInputs = with pkgs; [
            autoPatchelfHook
            dpkg
            makeWrapper
          ];
          buildInputs = electronRuntimeLibs;

          dontConfigure = true;
          dontBuild = true;

          unpackPhase = ''
            runHook preUnpack
            dpkg-deb -x "$src" .
            runHook postUnpack
          '';

          installPhase = ''
            runHook preInstall

            mkdir -p "$out"
            cp -r opt "$out/"
            cp -r usr/* "$out/"

            mkdir -p "$out/bin"
            makeWrapper "$out/opt/Tensamin/tensamin" "$out/bin/tensamin"

            substituteInPlace "$out/share/applications/tensamin.desktop" \
              --replace-fail "Exec=/opt/Tensamin/tensamin" "Exec=tensamin"

            runHook postInstall
          '';
        };
      defaultPackage = packageDeb (pkgs.fetchurl {
        url = "${forgejoBaseUrl}/${debArtifact}";
        hash = x86_64DebHash;
      });
      localDebPath = builtins.getEnv "TENSAMIN_DEB";
      localPathPackage =
        if localDebPath == ""
        then
          pkgs.writeShellScriptBin "tensamin" ''
            echo "Set TENSAMIN_DEB to a local .deb path and run with --impure." >&2
            exit 1
          ''
        else
          packageDeb (builtins.path {
            path = localDebPath;
            name = debArtifact;
          });
    in {
      default = defaultPackage;
      tensamin = defaultPackage;
      electron = defaultPackage;
      localPathForDev = localPathPackage;
    });

    devShells = forAllSystems (system: let
      pkgs = import nixpkgs {
        inherit system;
        overlays = [(import rust-overlay)];
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
    in rec {
      default = electron;

      electron = pkgs.mkShell {
          packages = with pkgs;
          [
            nodejs_22
            corepack_22
            coreutils
            bun
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
            sudo
            curl
            fakeroot
            rsync
            xz
          ]
          ++ electronRuntimeLibs;

        shellHook = ''
          export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath electronRuntimeLibs}:$LD_LIBRARY_PATH"
          export ELECTRON_ENABLE_LOGGING=1
          export ELECTRON_OZONE_PLATFORM_HINT="''${ELECTRON_OZONE_PLATFORM_HINT:-auto}"
          export NPM_CONFIG_TARGET_ARCH="''${NPM_CONFIG_TARGET_ARCH:-x64}"
          export npm_config_build_from_source=true
          export USE_SYSTEM_FPM=true

          alias electron-install='cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" && bun install'
          alias electron-build-web='cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" && bun run build:web'
          alias electron-dev='bun run dev'
          alias electron-package='bun run package:linux'
          alias electron-validate='bun run validate'
        '';
      };

      tauri = pkgs.mkShell {
        buildInputs = with pkgs;
          [
            jdk17
            rustToolchain
            gradle
            bun
            nodejs
            coreutils
            pkg-config
            git
            jq
            curl
          ]
          ++ [
            android.androidsdk
            android-studio-tools
          ];

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
        '';
      };
    });
  };
}
