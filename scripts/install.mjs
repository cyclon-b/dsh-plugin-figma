#!/usr/bin/env node
// Required Notice: Copyright (c) 2026 Gennady Artamonov
// Installs dsh-plugin-figma into a DeepSeek Harness profile and the harness home.
//
// The harness has no plugin registry for MCP servers or skills, so the install
// has three parts:
//   1. the bundle package is linked into `profiles/<name>/node_modules` and
//      enabled in the profile manifest (`dsh.profile.bundles`) — its patch row
//      mounts @deepseek-ai/dsh-mcp-client against the Figma remote server;
//   2. Figma's Agent Skills are copied into `$DSH_HOME/skills`, the user skill
//      root every profile discovers;
//   3. `$DSH_HOME/figma.yml` is created for the Figma OAuth access token.
//
// Existing skills with the same names are moved to
// `$DSH_HOME/.dsh-figma-plugin-backup/<timestamp>/` before being replaced, so
// --uninstall can restore them.
//
// Usage:
//   node scripts/install.mjs [--profile <name>] [--dsh-home <path>] [--dsh <command>]
//   node scripts/install.mjs --uninstall [--profile <name>] [--dsh-home <path>]
//   node scripts/install.mjs --help

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = 'dsh-plugin-figma';
const DEFAULT_PROFILE = 'web';
const CONFIG_FILENAME = 'figma.yml';
const MANIFEST_FILENAME = '.dsh-figma-plugin.json';
const BACKUP_DIRNAME = '.dsh-figma-plugin-backup';
const FIGMA_MCP_URL = 'https://mcp.figma.com/mcp';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = readJson(path.join(repoRoot, 'package.json'), 'package.json плагина');

const HELP = `dsh-plugin-figma installer

  node scripts/install.mjs [options]              install
  node scripts/install.mjs --uninstall [options]  remove

Options:
  --profile <name>   dsh profile to install into (default: ${DEFAULT_PROFILE}, env DSH_PROFILE)
  --dsh-home <path>  harness home (default: $DSH_HOME or ~/.dsh)
  --dsh <command>    dsh executable (default: $DSH_BIN or "dsh" on PATH)
  --uninstall        remove the bundle, the link and the installed skills
  -h, --help         show this help

The Figma token belongs in $DSH_HOME/${CONFIG_FILENAME} (access_token:).
The environment variables FIGMA_ACCESS_TOKEN, FIGMA_API_KEY and FIGMA_TOKEN
override it. mcp.figma.com accepts only an OAuth access token (figu_...).`;

function fail(message) {
  console.error(`\nОшибка: ${message}\n`);
  process.exit(1);
}

function info(message = '') {
  console.log(message);
}

function warn(message) {
  console.warn(`Предупреждение: ${message}`);
}

function parseArgs(argv) {
  const args = { profile: '', dshHome: '', dsh: '', uninstall: false, help: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const equals = arg.indexOf('=');
    const name = equals === -1 ? arg : arg.slice(0, equals);
    const inline = equals === -1 ? undefined : arg.slice(equals + 1);
    const value = () => {
      if (inline !== undefined) return inline;
      if (index + 1 >= argv.length) fail(`для ${name} нужно значение`);
      return argv[++index];
    };
    switch (name) {
      case '--profile':
        args.profile = value();
        break;
      case '--dsh-home':
        args.dshHome = value();
        break;
      case '--dsh':
        args.dsh = value();
        break;
      case '--uninstall':
        args.uninstall = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        fail(`неизвестный аргумент ${arg} (см. --help)`);
    }
  }
  return args;
}

function readJson(file, label) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    fail(`не удалось прочитать ${label} (${file}): ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${label} (${file}) содержит некорректный JSON: ${error.message}`);
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function lstatOrNull(target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function removeFileOrLink(target) {
  const stat = lstatOrNull(target);
  if (stat === null) return;
  if (stat.isSymbolicLink()) {
    // A Windows directory junction is a symlink to lstat but must be removed
    // with rmdir; unlink fails on it, and rm -r would risk following the link.
    if (process.platform === 'win32') fs.rmdirSync(target);
    else fs.unlinkSync(target);
    return;
  }
  fs.rmSync(target, { recursive: true, force: true });
}

function samePath(left, right) {
  try {
    return path.resolve(fs.realpathSync(left)) === path.resolve(fs.realpathSync(right));
  } catch {
    return path.resolve(left) === path.resolve(right);
  }
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
}

function resolveContext(args) {
  const homeEnv = (process.env.DSH_HOME ?? '').trim();
  const dshHome = path.resolve(args.dshHome.trim() || homeEnv || path.join(os.homedir(), '.dsh'));
  const profile = (args.profile.trim() || (process.env.DSH_PROFILE ?? '').trim() || DEFAULT_PROFILE).trim();
  if (!/^[A-Za-z0-9._-]+$/.test(profile)) {
    fail(`недопустимое имя профиля "${profile}": разрешены буквы, цифры, точка, дефис и подчёркивание`);
  }
  return {
    dshHome,
    profile,
    profileDir: path.join(dshHome, 'profiles', profile),
    configPath: path.join(dshHome, CONFIG_FILENAME),
    skillsDir: path.join(dshHome, 'skills'),
    manifestPath: path.join(dshHome, MANIFEST_FILENAME),
  };
}

function profileManifestPath(context) {
  return path.join(context.profileDir, 'package.json');
}

function runProcess(command, args, env) {
  // On Windows the dsh shim is a .cmd, which CreateProcess cannot start
  // directly. Go through cmd.exe instead of shell: true: Node deprecates
  // shell: true with an argument list (DEP0190) because it only concatenates.
  // The command line is passed verbatim with the extra outer quote pair cmd /s
  // expects, so paths with spaces (the Desktop runtime) survive.
  if (process.platform === 'win32') {
    const line = [command, ...args]
      .map((part) => (/[\s"]/.test(part) ? `"${part.replaceAll('"', '\\"')}"` : part))
      .join(' ');
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], {
      encoding: 'utf8',
      env,
      windowsVerbatimArguments: true,
    });
  }
  return spawnSync(command, args, { encoding: 'utf8', env });
}

function dshCommand(args) {
  const explicit = (args.dsh.trim() || (process.env.DSH_BIN ?? '').trim()).trim();
  if (explicit) return explicit;
  const probe = runProcess('dsh', ['--version'], process.env);
  if (probe.error || probe.status !== 0) {
    fail('CLI dsh не найден в PATH. Укажи его через --dsh <путь> или переменную DSH_BIN.');
  }
  return 'dsh';
}

function runDsh(command, dshArgs, dshHome) {
  return runProcess(command, dshArgs, { ...process.env, DSH_HOME: dshHome });
}

function ensureProfile(context, command) {
  if (fs.existsSync(profileManifestPath(context))) return;
  if (!fs.existsSync(context.dshHome)) {
    fail(`каталог DSH_HOME не найден: ${context.dshHome}. Запусти dsh хотя бы один раз, чтобы он создал домашний каталог.`);
  }
  info(`Профиль ${context.profile} отсутствует — создаю его из шаблона dsh…`);
  const result = runDsh(command, ['--profile', context.profile, '--dump-config'], context.dshHome);
  if (!fs.existsSync(profileManifestPath(context))) {
    const details = (result.stderr || result.stdout || '').trim().split('\n').slice(-3).join('\n');
    fail(
      `не удалось создать профиль ${context.profile}${details ? `:\n${details}` : ''}\n` +
        `Создай профиль вручную (например, запусти "dsh ${context.profile}") и повтори установку.`,
    );
  }
}

function readManifest(context) {
  const fallback = { version: packageJson.version, repo: repoRoot, profiles: [], skills: {} };
  if (!fs.existsSync(context.manifestPath)) return fallback;
  const manifest = readJson(context.manifestPath, MANIFEST_FILENAME);
  return {
    version: typeof manifest.version === 'string' ? manifest.version : packageJson.version,
    repo: typeof manifest.repo === 'string' ? manifest.repo : repoRoot,
    profiles: Array.isArray(manifest.profiles) ? manifest.profiles.filter((name) => typeof name === 'string') : [],
    skills: manifest.skills && typeof manifest.skills === 'object' && !Array.isArray(manifest.skills) ? manifest.skills : {},
  };
}

function writeManifest(context, manifest) {
  if (manifest.profiles.length === 0 && Object.keys(manifest.skills).length === 0) {
    removeFileOrLink(context.manifestPath);
    return;
  }
  writeJson(context.manifestPath, {
    version: manifest.version,
    repo: manifest.repo,
    profiles: [...new Set(manifest.profiles)].sort(),
    skills: manifest.skills,
  });
}

function ensureBundle(context) {
  const manifestPath = profileManifestPath(context);
  const manifest = readJson(manifestPath, `манифест профиля ${context.profile}`);
  manifest.dependencies = manifest.dependencies && typeof manifest.dependencies === 'object' ? manifest.dependencies : {};
  manifest.dependencies[PACKAGE_NAME] = `link:${repoRoot.replaceAll('\\', '/')}`;
  manifest.dsh = manifest.dsh && typeof manifest.dsh === 'object' ? manifest.dsh : {};
  manifest.dsh.profile = manifest.dsh.profile && typeof manifest.dsh.profile === 'object' ? manifest.dsh.profile : {};
  const bundles = Array.isArray(manifest.dsh.profile.bundles) ? manifest.dsh.profile.bundles : [];
  if (!bundles.includes(PACKAGE_NAME)) bundles.push(PACKAGE_NAME);
  manifest.dsh.profile.bundles = bundles;
  writeJson(manifestPath, manifest);

  const nodeModules = path.join(context.profileDir, 'node_modules');
  fs.mkdirSync(nodeModules, { recursive: true });
  const linkPath = path.join(nodeModules, PACKAGE_NAME);
  const stat = lstatOrNull(linkPath);
  if (stat !== null) {
    if (!stat.isSymbolicLink()) {
      fail(
        `в профиле уже есть каталог ${linkPath}, и это не ссылка на плагин. ` +
          'Удали его вручную (возможно, плагин стоял через npm/pnpm) и повтори установку.',
      );
    }
    if (samePath(linkPath, repoRoot)) return;
    removeFileOrLink(linkPath);
  }
  fs.symlinkSync(repoRoot, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
}

function removeBundle(context) {
  const manifestPath = profileManifestPath(context);
  if (!fs.existsSync(manifestPath)) return;
  const manifest = readJson(manifestPath, `манифест профиля ${context.profile}`);
  if (manifest.dependencies && typeof manifest.dependencies === 'object') {
    const current = manifest.dependencies[PACKAGE_NAME];
    if (typeof current === 'string' && current.startsWith('link:')) delete manifest.dependencies[PACKAGE_NAME];
  }
  const bundles = manifest.dsh?.profile?.bundles;
  if (Array.isArray(bundles)) {
    manifest.dsh.profile.bundles = bundles.filter((name) => name !== PACKAGE_NAME);
  }
  writeJson(manifestPath, manifest);

  const linkPath = path.join(context.profileDir, 'node_modules', PACKAGE_NAME);
  const stat = lstatOrNull(linkPath);
  if (stat !== null) {
    if (stat.isSymbolicLink() && samePath(linkPath, repoRoot)) removeFileOrLink(linkPath);
    else if (!stat.isSymbolicLink()) warn(`${linkPath} — не ссылка на плагин, оставляю как есть.`);
  }
}

function skillDirectories() {
  const root = path.join(repoRoot, 'skills');
  if (!fs.existsSync(root)) fail(`каталог скиллов не найден: ${root}`);
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
}

function uniqueBackupDir(dshHome) {
  const base = path.join(dshHome, BACKUP_DIRNAME);
  const stamp = timestamp();
  let candidate = path.join(base, stamp);
  for (let index = 2; lstatOrNull(candidate) !== null; index++) candidate = path.join(base, `${stamp}-${index}`);
  return candidate;
}

function installSkills(context, manifest) {
  const sourceRoot = path.join(repoRoot, 'skills');
  const targetRoot = context.skillsDir;
  fs.mkdirSync(targetRoot, { recursive: true });
  manifest.skills = manifest.skills && typeof manifest.skills === 'object' ? manifest.skills : {};

  const replaced = [];
  const installed = [];
  let backupRoot;

  for (const name of skillDirectories()) {
    const source = path.join(sourceRoot, name);
    const target = path.join(targetRoot, name);
    const managed = Object.hasOwn(manifest.skills, name);
    const existing = lstatOrNull(target);

    if (existing !== null) {
      if (managed) {
        removeFileOrLink(target);
      } else {
        backupRoot = backupRoot ?? uniqueBackupDir(context.dshHome);
        fs.mkdirSync(backupRoot, { recursive: true });
        const backup = path.join(backupRoot, name);
        try {
          fs.renameSync(target, backup);
        } catch (error) {
          if (error.code !== 'EXDEV') throw error;
          fs.cpSync(target, backup, { recursive: true });
          removeFileOrLink(target);
        }
        manifest.skills[name] = { backup };
        replaced.push(name);
      }
    }

    fs.cpSync(source, target, { recursive: true });
    if (!Object.hasOwn(manifest.skills, name)) manifest.skills[name] = {};
    installed.push(name);
  }

  return { installed, replaced, backupRoot };
}

function restoreSkills(context, manifest) {
  const restored = [];
  const removed = [];
  for (const [name, record] of Object.entries(manifest.skills)) {
    const target = path.join(context.skillsDir, name);
    if (lstatOrNull(target) !== null) {
      removeFileOrLink(target);
      removed.push(name);
    }
    const backup = record && typeof record === 'object' && typeof record.backup === 'string' ? record.backup : '';
    if (backup && lstatOrNull(backup) !== null) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(backup, target);
      restored.push(name);
    }
  }
  return { removed, restored };
}

function ensureConfig(context) {
  if (fs.existsSync(context.configPath)) return false;
  const prepared = path.join(repoRoot, CONFIG_FILENAME);
  const template = fs.existsSync(prepared) ? prepared : path.join(repoRoot, 'figma.example.yml');
  fs.mkdirSync(path.dirname(context.configPath), { recursive: true });
  fs.copyFileSync(template, context.configPath);
  return true;
}

function readToken(context) {
  const fromEnv = (process.env.FIGMA_ACCESS_TOKEN || process.env.FIGMA_API_KEY || process.env.FIGMA_TOKEN || '').trim();
  if (fromEnv) return { token: fromEnv, source: 'переменная окружения FIGMA_ACCESS_TOKEN/FIGMA_API_KEY/FIGMA_TOKEN' };
  let text;
  try {
    text = fs.readFileSync(context.configPath, 'utf8');
  } catch {
    return { token: '', source: null };
  }
  const clean = (match) =>
    match
      ? match[1]
          .replace(/[ \t]+#.*$/, '')
          .trim()
          .replace(/^["'](.*)["']$/, '$1')
          .trim()
      : '';
  const token =
    clean(text.match(/^[ \t]*access_token[ \t]*:[ \t]*(.*)$/m)) ||
    clean(text.match(/^[ \t]*api_key[ \t]*:[ \t]*(.*)$/m));
  return token ? { token, source: context.configPath } : { token: '', source: null };
}

async function verifyToken(token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(FIGMA_MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(token.startsWith('figu_') ? { Authorization: `Bearer ${token}` } : { 'X-Figma-Token': token }),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'dsh-plugin-figma-installer', version: packageJson.version },
        },
      }),
      signal: controller.signal,
    });
    return { status: response.status };
  } catch (error) {
    return { error: error.name === 'AbortError' ? 'таймаут 15 с' : error.message };
  } finally {
    clearTimeout(timer);
  }
}

async function reportToken(context) {
  const { token, source } = readToken(context);
  if (!token) {
    info('');
    info(`Токен Figma пока не задан. Запусти авторизацию в браузере: auth.ps1 или ./auth.sh.`);
    info('Она сохранит OAuth access token (figu_…) в ' + context.configPath + '.');
    return;
  }
  info('');
  info(`Токен Figma найден (${source}).`);
  if (token.startsWith('figd_')) {
    warn(
      'это персональный токен (figd_). REST API Figma его принимает, но удалённый MCP-сервер — ' +
        'только OAuth access token (figu_…). Запусти auth.ps1 или ./auth.sh; без этого инструменты mcp__figma__* не появятся.',
    );
    return;
  }
  info(`Проверяю доступ к ${FIGMA_MCP_URL}…`);
  const result = await verifyToken(token);
  if (result.error) {
    warn(`проверить токен не удалось (${result.error}). Плагин установлен; соединение проверится при старте dsh.`);
    return;
  }
  if (result.status === 200) {
    info('Сервер принял access-токен (HTTP 200).');
    return;
  }
  if (result.status === 401 || result.status === 403) {
    warn(
      `сервер отклонил токен (HTTP ${result.status}). Нужен действующий OAuth access token (figu_…); ` +
        'без него инструменты mcp__figma__* не появятся.',
    );
    return;
  }
  warn(`сервер ответил HTTP ${result.status}; это не ошибка установки — проверь соединение при старте dsh.`);
}

function printInstallSummary(context, result, configCreated) {
  info('');
  info('Готово.');
  info(`  профиль : ${context.profile} (${context.profileDir})`);
  info(`  бандл   : ${PACKAGE_NAME} → ${repoRoot}`);
  info(`  скиллы  : ${result.installed.length} в ${context.skillsDir}`);
  if (result.replaced.length > 0) {
    info(`  заменено: ${result.replaced.join(', ')}`);
    info(`  бэкап   : ${result.backupRoot}`);
  }
  if (configCreated) info(`  конфиг  : ${context.configPath} (создан из шаблона)`);
  info('');
  info('Инструменты появятся после перезапуска harness:');
  info(`  dsh ${context.profile}`);
  info('Имена инструментов модели: mcp__figma__get_design_context, mcp__figma__get_screenshot, …');
}

function printUninstallSummary(context, skills) {
  info('');
  info('Готово.');
  info(`  профиль : ${context.profile} — бандл и ссылка удалены`);
  if (skills.removed.length > 0) info(`  скиллы  : удалено ${skills.removed.length}`);
  if (skills.restored.length > 0) info(`  бэкап   : восстановлено ${skills.restored.join(', ')}`);
  info(`  конфиг  : ${context.configPath} оставлен (там может быть токен)`);
}

async function install(args) {
  const context = resolveContext(args);
  const command = dshCommand(args);
  ensureProfile(context, command);

  const manifest = readManifest(context);
  ensureBundle(context);
  const result = installSkills(context, manifest);
  const configCreated = ensureConfig(context);

  manifest.version = packageJson.version;
  manifest.repo = repoRoot;
  manifest.profiles = [...new Set([...manifest.profiles, context.profile])];
  writeManifest(context, manifest);

  await reportToken(context);
  printInstallSummary(context, result, configCreated);
}

function uninstall(args) {
  const context = resolveContext(args);
  removeBundle(context);

  const manifest = readManifest(context);
  manifest.profiles = manifest.profiles.filter((name) => name !== context.profile);
  let skills = { removed: [], restored: [] };
  if (manifest.profiles.length === 0) {
    skills = restoreSkills(context, manifest);
    manifest.skills = {};
  }
  writeManifest(context, manifest);

  if (manifest.profiles.length > 0) {
    info(`Плагин остаётся установленным для профилей: ${manifest.profiles.join(', ')}.`);
  }
  printUninstallSummary(context, skills);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(HELP);
} else if (args.uninstall) {
  uninstall(args);
} else {
  await install(args);
}
