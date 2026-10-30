# Changelog

## 1.0.0 — 2026-10-30

- Initial release.
- Mounts the Figma remote MCP server (`https://mcp.figma.com/mcp`) through
  `@deepseek-ai/dsh-mcp-client`; tools appear as `mcp__figma__*`.
- Reads the Figma personal access token from `$DSH_HOME/figma.yml`
  (`api_key:`), with `FIGMA_API_KEY` / `FIGMA_TOKEN` as environment overrides.
- Installs the 16 official Figma Agent Skills from
  `figma@claude-plugins-official` 2.2.157.
- PowerShell and POSIX installers: profile bundle link, skill copy with backup
  and restore, idempotent reinstall, and a clean uninstall.
