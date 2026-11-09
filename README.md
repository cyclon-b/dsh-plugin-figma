# dsh-plugin-figma

[Русская версия](README.ru.md)

Figma for [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) — the
DSH counterpart of the official Figma plugin. It connects the Figma remote MCP
server and installs Figma's Agent Skills for design-to-code workflows.

## What it gives you

| Part | What it does |
|---|---|
| MCP server `figma` | Connects `https://mcp.figma.com/mcp` — the endpoint from Figma's own MCP configuration — through the harness-native `@deepseek-ai/dsh-mcp-client`. Tools reach the model as `mcp__figma__get_design_context`, `mcp__figma__get_screenshot`, `mcp__figma__use_figma`, and so on, discovered from the server at startup |
| 16 Agent Skills | The official Figma skills (`figma-use`, `figma-design-to-code`, `figma-generate-design`, `figma-generate-library`, `figma-code-connect`, `figma-spec`, `figma-swiftui`, shaders, motion, FigJam, Slides, …) copied unmodified from the official plugin bundle 2.2.157 |
| `figma.yml` | The plugin's YAML config; set the Figma OAuth access token once, in one file outside the repository |

The plugin does not implement Figma tools itself: the server publishes them and
the harness MCP client registers them. A Figma update adds tools without a
plugin update.

## Requirements

- `dsh` **0.2.1-rc.2** (tested) with a base-backed profile — `web`, `acp`,
  `headless`, `desktop`.
- Node.js **≥ 22.3** — the harness requirement; the bundle patch reads the
  config file with `process.getBuiltinModule`.
- A Figma account. The bundled `auth.ps1` / `auth.sh` command obtains the OAuth
  access token (`figu_…`) through the browser. The remote server does **not**
  accept a personal access token (`figd_…`): that token works with the Figma REST
  API only, and the MCP endpoint rejects it with `401`.
- Windows PowerShell 5.1+ or any POSIX `sh`.

## Install

```powershell
git clone https://github.com/cyclon-b/dsh-plugin-figma.git
cd dsh-plugin-figma
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

```sh
git clone https://github.com/cyclon-b/dsh-plugin-figma.git
cd dsh-plugin-figma
./install.sh
```

Then authorize in the browser and restart the harness:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\auth.ps1
```

```sh
./auth.sh
```

The command registers a local OAuth client, opens the Figma consent page, waits
for the localhost callback, and writes the OAuth access token to
`$DSH_HOME/figma.yml`. It finishes with a live check against
`https://mcp.figma.com/mcp`.

```sh
dsh web
```

The installer creates `figma.yml` from `figma.example.yml` on first install (the
token file is kept on uninstall). To supply a token without the browser flow, put
it into `figma.yml` manually; `api_key:` works as an alias for `access_token:`.
For an unattended install, you can also put a filled `figma.yml` next to the
installer before running it; the installer copies it into `$DSH_HOME`.

The installer can target another profile, home or `dsh` executable:

```
install.ps1 -Profile acp -DshHome D:\dsh -Dsh "C:\path\dsh.cmd"
./install.sh --profile acp --dsh-home /home/me/.dsh --dsh /usr/local/bin/dsh
```

## What the installer changes

| Path | Change |
|---|---|
| `profiles/<name>/package.json` | Adds `"dsh-plugin-figma": "link:<repo>"` to `dependencies` and `dsh-plugin-figma` to `dsh.profile.bundles` |
| `profiles/<name>/node_modules/dsh-plugin-figma` | Junction (Windows) or symlink (POSIX) to this repository |
| `$DSH_HOME/skills/<name>` | The 16 Figma skills. A skill with the same name that was not installed by this plugin is moved to `$DSH_HOME/.dsh-figma-plugin-backup/<timestamp>/` first |
| `$DSH_HOME/figma.yml` | Created from `figma.example.yml` if absent; kept on uninstall |
| `$DSH_HOME/.dsh-figma-plugin.json` | Manifest of installed skills and profiles, used by uninstall |

Re-running the installer is idempotent. Skills are copied, not linked, so run the
installer again after `git pull` to refresh them; the bundle itself is linked and
picks up patch changes on the next harness start.

## Authorization

`auth.ps1` / `auth.sh` runs the OAuth authorization-code flow with PKCE:

1. starts a callback server on `127.0.0.1` and registers it as the redirect URI;
2. registers the OAuth client at `https://api.figma.com/v1/oauth/mcp/register`;
3. opens `https://www.figma.com/oauth/mcp`; approve the request in the browser;
4. exchanges the callback code for access and refresh tokens;
5. writes the access token to `figma.yml` (`access_token:`) and the client
   registration plus refresh token to `$DSH_HOME/figma-oauth.json`;
6. calls `initialize` on the MCP endpoint and reports `HTTP 200` or `401`.

Options: `--no-browser` prints the URL instead of opening it, `--client-name`
changes the registration name, `--status` prints the saved token and expiry,
`--refresh` renews the access token without a browser.

> **Figma gates this endpoint to a client-name allow-list.** Dynamic client
> registration answers `403` for every name Figma has not admitted; the command
> defaults to the allow-listed name `Claude Code`, so the consent page shows that
> name. This is a workaround for a beta gate, not an official integration: Figma
> may change or revoke it, and using it is at your own risk. If a name is
> rejected, `auth` fails with the registration error before opening the browser.

Tokens last about 90 days. `--refresh` uses the saved refresh token; if the
refresh token is gone, run `auth` again.

## Configuration

`$DSH_HOME/figma.yml` is read every time the MCP row activates:

```yaml
access_token: "figu_..."
```

`auth.ps1` / `auth.sh` writes this value. `api_key:` is accepted as an alias for
the same value. `FIGMA_ACCESS_TOKEN`, `FIGMA_API_KEY` or `FIGMA_TOKEN` in the
environment takes precedence. The header is selected by the token prefix:
`figu_…` → `Authorization: Bearer`, `figd_…` → `X-Figma-Token` (REST/local
servers; the remote MCP endpoint rejects it). With no token the header is
omitted, the server answers `401`, and the harness still starts; only the Figma
tools are missing.

### Authentication model

The remote Figma MCP server is OAuth-only. The MCP client shipped with the
harness speaks plain Streamable HTTP without an OAuth handshake, so the plugin
performs the authorization-code flow itself (`auth.ps1` / `auth.sh`) and stores
the resulting OAuth access token (`figu_…`) in `figma.yml`. The MCP row sends it
as `Authorization: Bearer`.

A personal access token (`figd_…`) is not a substitute: the REST API accepts it
(`GET https://api.figma.com/v1/me` succeeds), but `https://mcp.figma.com/mcp`
answers `401 Unauthorized` when the token is sent in `X-Figma-Token`. The row
still supports that header shape for local or REST-backed MCP servers, selected
by the token prefix.

## Verify

The installer probes `https://mcp.figma.com/mcp` with the token when one is
present and prints `HTTP 200` (accepted) or `HTTP 401/403` (rejected). Without
network access it only warns: installation does not depend on the probe.

Check the composed profile without starting it:

```sh
dsh --profile web --dump-config | grep -A8 mcp-figma-remote
```

## Use

After a restart the model sees `mcp__figma__*` tools, and the skills appear in
the skill catalog under their official names. Ask for a Figma link or a design
task; the Figma skills trigger themselves (`figma-design-to-code` before
`get_design_context`, `figma-use` before `use_figma`, and so on).

## Profiles

`web` is the default. `acp`, `headless` and any custom base-backed profile work
the same way. The `desktop` profile is owned by the DeepSeek Harness Desktop
application: the npm CLI refuses plugin operations for it and may rewrite the
profile, so treat changes there as the Desktop app's business.

## Uninstall

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall.ps1
```

```sh
./uninstall.sh
```

It removes the bundle from `dsh.profile.bundles`, deletes the profile link, and
removes the installed skills — restoring the backed-up originals where they
exist. `figma.yml` is kept because it holds the token. Skills stay installed
while another profile still uses the plugin.

## Troubleshooting

| Symptom | What to check |
|---|---|
| No `mcp__figma__*` tools | Restart the harness. Check `dsh --profile web --dump-config \| grep mcp-figma-remote`. Check the harness log for `figma` connection errors |
| `401 Unauthorized` | The token is missing, expired, or is a `figd_` personal token. Run `auth.ps1 --refresh` (or `auth.sh --refresh`); if there is no refresh token, run `auth` again. The remote MCP server accepts only `figu_` OAuth access tokens |
| `figd_ tokens must be passed via X-Figma-Token` | A `figd_` token was sent as `Authorization: Bearer`. The remote endpoint needs a `figu_` OAuth token; leave `figd_` for local/REST servers |
| Skills were replaced | Restore from `$DSH_HOME/.dsh-figma-plugin-backup/<timestamp>/`, or run the uninstaller |
| Node older than 22.3 | The patch cannot read `figma.yml`; export `FIGMA_API_KEY` instead, or upgrade Node |
| Two Figma rows / old prototype | Remove the earlier `dsh-plugin-figma` link and bundle from the profile before installing this one |

## Layout

```
dsh-plugin-figma/
  package.json         dsh.bundle.patch -> cordis.patch.yml
  cordis.patch.yml     one insert row: @deepseek-ai/dsh-mcp-client -> Figma MCP
  figma.example.yml    token config template
  install.ps1/.sh      CLI installer wrappers
  uninstall.ps1/.sh    removal wrappers
  auth.ps1/.sh         browser OAuth wrappers
  scripts/install.mjs  shared installer implementation
  scripts/auth.mjs     OAuth authorization-code flow with PKCE
  skills/              official Figma Agent Skills (see NOTICE)
```

## Limitations

- The OAuth handshake uses a client-name allow-list workaround (see
  [Authorization](#authorization)); access tokens expire and need `--refresh`.
- Figma applies rate limits to tools that read designs, depending on the account
  plan and seat; write tools are exempt.
- The plugin does not install or launch the Figma desktop app and does not add
  its local MCP server. The official Figma plugin uses the remote server; add a
  separate `@deepseek-ai/dsh-mcp-client` row if you want the desktop endpoint.
- The skills under `skills/` are Figma's content, not this project's; see
  [NOTICE](NOTICE).

## License

[PolyForm Noncommercial 1.0.0](LICENSE) for the bundle patch, installer and
documentation. Commercial use is not permitted: neither this project nor works
based on it may be used, modified for, or distributed for a commercial purpose.
Turning it into a paid product, a paid service or a closed commercial tool is a
licence violation.

The skills under `skills/` are Figma's and are excluded from this license — see
[NOTICE](NOTICE).

Releases up to and including 1.1.0 were published under MIT and remain
available under those terms to everyone who received them.
