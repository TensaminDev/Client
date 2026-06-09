{
  description = "Tensamin desktop client";

  inputs.nixpkgs.url = "nixpkgs/nixos-unstable";

  outputs = {nixpkgs, ...}: let
    systems = ["x86_64-linux"];
    forAllSystems = nixpkgs.lib.genAttrs systems;
    version = "0.0.9";
    x86_64DebHash = "sha256-8rVb12SGGSac6l1NVPGyRLsAKAGDAOJVUwG8l+hoRCU=";
    forgejoBaseUrl = "https://git.methanium.net/tensamin/client/releases/download/${version}";
  in {
    packages = forAllSystems (system: let
      pkgs = import nixpkgs {inherit system;};
      debArtifact = "Tensamin-${version}-linux-amd64.deb";
      localDebPath = builtins.getEnv "TENSAMIN_DEB";
      debPath = /. + localDebPath;
      electronRuntimeLibs = with pkgs; [
        alsa-lib
        at-spi2-atk
        at-spi2-core
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
        libnotify
        libpulseaudio
        libuuid
        libxkbcommon
        mesa
        nspr
        nss
        pango
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
          inherit version;

          inherit src;
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
            dpkg-deb -x $src .
            runHook postUnpack
          '';

          installPhase = ''
            runHook preInstall

            mkdir -p $out
            cp -r opt $out/
            cp -r usr/* $out/

            mkdir -p $out/bin
            makeWrapper $out/opt/Tensamin/tensamin $out/bin/tensamin

            substituteInPlace $out/share/applications/tensamin.desktop \
              --replace-fail "Exec=/opt/Tensamin/tensamin" "Exec=tensamin"

            runHook postInstall
          '';
        };
      defaultPackage = packageDeb (pkgs.fetchurl {
        url = "${forgejoBaseUrl}/${debArtifact}";
        hash = x86_64DebHash;
      });
    in {
      default = defaultPackage;

      localPathForDev = if localDebPath == "" then defaultPackage else packageDeb debPath;
    });
  };
}
