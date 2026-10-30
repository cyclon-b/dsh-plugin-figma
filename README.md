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
| `figma.yml` | The plugin's YAML config; set the Figma personal access token once, in one file outside the repository |

The plugin does not implement Figma tools itself: the server publishes them and
the harness MCP client registers them. A Figma update adds tools without a
plugin update.

## Requirements

- `dsh` **0.2.1-rc.2** (tested) with a base-backed profile — `web`, `acp`,
  `headless`, `desktop`.
- Node.js **≥ 22.3** — the harness requirement; the bundle patch reads the
  config file with `process.getBuiltinModule`.
- A Figma account and a **personal access token** (`figd_…`) from
  [figma.com/settings](https://www.figma.com/settings) → **Security** →
  **Personal access tokens**. Reading designs needs the **File content → Read**
  scope; the write-to-canvas tools need the scopes Figma lists for them.
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

Then put the token into the config and restart the harness:

```yaml
# %USERPROFILE%\.dsh\figma.yml   ($DSH_HOME/figma.yml)
api_key: "figd_your_token_here"
```

```sh
dsh web
```

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

## Configuration

`$DSH_HOME/figma.yml` is read every time the MCP row activates:

```yaml
api_key: "figd_..."
```

`FIGMA_API_KEY` or `FIGMA_TOKEN` in the environment takes precedence. The token
is sent in the `X-Figma-Token` header. With no token the header is omitted, the
server answers `401`, and the harness still starts; only the Figma tools are
missing.

### Why a personal access token and not OAuth

The remote Figma MCP server protects itself with OAuth. The MCP client shipped
with the harness speaks plain Streamable HTTP without an OAuth handshake, and
Figma refuses dynamic client registration for arbitrary clients
(`POST https://api.figma.com/v1/oauth/mcp/register` → `403`), so a profile cannot
register itself the way a registered client is. Figma's server
accepts a personal access token in `X-Figma-Token` — a header it advertises
itself (`access-control-allow-headers: Content-Type, X-Figma-Token,
Authorization`) — so that is the authentication path this plugin uses. A `figd_`
token must go in `X-Figma-Token`; `Authorization: Bearer` is rejected.

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
| `401 Unauthorized` | Token missing, wrong, expired, or lacks the `File content → Read` scope. Recheck `api_key`; environment variables override the file |
| `figd_ tokens must be passed via X-Figma-Token` | A proxy rewrote the header into `Authorization`; the row already uses `X-Figma-Token` |
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
  scripts/install.mjs  shared installer implementation
  skills/              official Figma Agent Skills (see NOTICE)
```

## Limitations

- OAuth is not performed; only a personal access token is supported.
- Figma applies rate limits to tools that read designs, depending on the account
  plan and seat; write tools are exempt.
- The plugin does not install or launch the Figma desktop app and does not add
  its local MCP server. The official Figma plugin uses the remote server; add a
  separate `@deepseek-ai/dsh-mcp-client` row if you want the desktop endpoint.
- The skills under `skills/` are Figma's content, not this project's; see
  [NOTICE](NOTICE).

## License

MIT for the bundle patch, installer and documentation. The skills are Figma's
and are excluded from that license — see [NOTICE](NOTICE).
