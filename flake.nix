{
  description = "Tensamin desktop client";

  inputs.nixpkgs.url = "nixpkgs/nixos-unstable";

  outputs = {nixpkgs, ...}: let
    systems = ["x86_64-linux" "aarch64-linux"];
    forAllSystems = nixpkgs.lib.genAttrs systems;
    version = "0.0.3";
    forgejoBaseUrl = "https://git.methanium.net/tensamin/client/releases/download/${version}";
  in {
    packages = forAllSystems (system: let
      pkgs = import nixpkgs {inherit system;};
      artifact = if system == "aarch64-linux" then "Tensamin-${version}-linux-arm64.AppImage" else "Tensamin-${version}-linux-x86_64.AppImage";
      appImagePath = /. + builtins.getEnv "TENSAMIN_APPIMAGE";
      desktopItem = pkgs.makeDesktopItem {
        name = "tensamin";
        desktopName = "Tensamin";
        exec = "tensamin %U";
        icon = "tensamin";
        categories = ["Network"];
      };
      wrapAppImage = src:
        pkgs.appimageTools.wrapType2 {
          pname = "tensamin";
          inherit version src;
          extraInstallCommands = ''
            install -Dm444 ${desktopItem}/share/applications/tensamin.desktop $out/share/applications/tensamin.desktop
          '';
        };
    in {
      default = wrapAppImage (pkgs.fetchurl {
        url = "${forgejoBaseUrl}/${artifact}";
        hash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      });

      localPathForDev = wrapAppImage appImagePath;
    });
  };
}
