# Changelog

## 1.1.0 — 2026-10-30

- Browser OAuth: `auth.ps1` / `auth.sh` run authorization code + PKCE with a
  localhost callback, register the client, and save the `figu_` access token to
  `figma.yml` plus the refresh token to `$DSH_HOME/figma-oauth.json`.
- `--refresh` renews the access token without a browser; `--status` shows the
  saved token and expiry.
- Document Figma's client-name allow-list: the default registration name is the
  allow-listed `Claude Code`, because Figma rejects every other name.

## 1.0.1 — 2026-10-30

- Support an OAuth access token (`figu_…`) in `figma.yml` (`access_token:`) and
  send it as `Authorization: Bearer`, which is what the remote MCP server
  accepts. `api_key:` remains as an alias; the header is selected by prefix.
- Correct the authentication documentation: the remote MCP endpoint rejects a
  personal access token (`figd_…`) with `401`; that token is REST-only.

## 1.0.0 — 2026-10-30

- Initial release.
- Mounts the Figma remote MCP server (`https://mcp.figma.com/mcp`) through
  `@deepseek-ai/dsh-mcp-client`; tools appear as `mcp__figma__*`.
- Reads the Figma token from `$DSH_HOME/figma.yml`, with environment overrides.
- Installs the 16 official Figma Agent Skills from
  `figma@claude-plugins-official` 2.2.157.
- PowerShell and POSIX installers: profile bundle link, skill copy with backup
  and restore, idempotent reinstall, and a clean uninstall.
