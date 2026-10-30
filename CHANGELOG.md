# Changelog

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
