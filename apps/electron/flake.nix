{
  description = "Electron Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {nixpkgs, flake-utils, ...}:
    flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {inherit system; config.allowUnfree = true;};
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
        # xorg
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
    in {
      devShells.default = pkgs.mkShell {
        packages = with pkgs; [
          nodejs_22
          corepack_22
          bun
          electron
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
          jq
          fakeroot
          xz-utils
        ] ++ electronRuntimeLibs;

        shellHook = ''
          export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath electronRuntimeLibs}:$LD_LIBRARY_PATH"
          export ELECTRON_ENABLE_LOGGING=1
          export ELECTRON_OZONE_PLATFORM_HINT="''${ELECTRON_OZONE_PLATFORM_HINT:-auto}"
          export NPM_CONFIG_TARGET_ARCH="''${NPM_CONFIG_TARGET_ARCH:-x64}"
          export npm_config_build_from_source=true
          export USE_SYSTEM_FPM=true

          alias electron-install='cd ../.. && bun install'
          alias electron-build-web='cd ../.. && bun run build:web'
          alias electron-dev='bun run dev'
          alias electron-package='bun run package:linux'
          alias electron-validate='bun run validate'
        '';
      };
    });
}
