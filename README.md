## Information

All dev releases get deleted upon creation of the latest prod release.

# Build channels

Builds default to `TENSAMIN_CHANNEL=stable`. Set it to `canary` or `dev` for
`net.tensamin.client.canary` or `net.tensamin.client.dev`. Stable retains
`net.tensamin.client`. Canary icons are yellow; dev icons use a blue background
and the outline artwork from `../branding/variants/logo_outline.svg`, vendored
under `utils/icons` so standalone source builds do not need the branding repo.
Local `dev`, `dev:desktop`, and `dev:mobile` commands select dev automatically.

`pnpm run channel <command> [args...]` passes channel identity and Tauri config
to a command. Mobile build scripts already use it. Set
`TENSAMIN_ANDROID_VERSION_CODE` to a positive integer up to 2100000000.
Release automation must supply a value greater than the previous build for
that application ID. Verification uses the GitHub Actions run number. Without an
override, Android uses Tauri's version-derived code.

Hosted web builds use `/`. Electron's `build:web` command uses `./`; callers
can also set `TENSAMIN_WEB_BASE=./` explicitly. Generated icons are rebuilt from
source on each build, without timestamps or Git-dependent inputs.

Run the same verification commands as central CI from the client root:

```sh
git submodule update --init --recursive
nix develop .#electron --command pnpm install --frozen-lockfile
TENSAMIN_CHANNEL=stable nix develop .#electron --command pnpm run ci
TENSAMIN_CHANNEL=stable TENSAMIN_ANDROID_VERSION_CODE=1 nix develop .#tauri --command pnpm --dir apps/tauri run build:mobile:ci
nix develop .#tauri --command cargo test --locked --manifest-path apps/tauri/src-tauri/Cargo.toml
```

Repeat the channel commands with `canary` and `dev`. CI runs on every push and
manual dispatch. It verifies builds without deploying or publishing releases.
