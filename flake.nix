{
  description = "Tensamin desktop client";

  inputs.nixpkgs.url = "nixpkgs/nixos-unstable";

  outputs = {nixpkgs, ...}: let
    systems = ["x86_64-linux" "aarch64-linux"];
    forAllSystems = nixpkgs.lib.genAttrs systems;
    version = "0.0.4";
    forgejoBaseUrl = "https://git.methanium.net/tensamin/client/releases/download/${version}";
  in {
    packages = forAllSystems (system: let
      pkgs = import nixpkgs {inherit system;};
      artifact = if system == "aarch64-linux" then "Tensamin-${version}-linux-arm64.AppImage" else "Tensamin-${version}-linux-x86_64.AppImage";

    appImagePath = /. + builtins.getEnv "TENSAMIN_APPIMAGE";
    in {
      default = pkgs.appimageTools.wrapType2 {
        pname = "tensamin";
        inherit version;
        src = pkgs.fetchurl {
          url = "${forgejoBaseUrl}/${artifact}";
          hash = "sha256-aiApiDSx5CycLbWnYIborQWbBq12MEuArZLLvw6m64s=";
        };
      };

      localPathForDev = pkgs.appimageTools.wrapType2 {
        pname = "tensamin";
        inherit version;

        src = appImagePath;
      };
    });
  };
}
