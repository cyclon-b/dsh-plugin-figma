#!/usr/bin/env node
// Required Notice: Copyright (c) 2026 Gennady Artamonov
// Browser OAuth for the Figma remote MCP server.
//
// The MCP client in the harness does not perform an OAuth handshake, so this
// command does it once and stores the resulting OAuth access token (figu_...)
// where the bundle reads it: $DSH_HOME/figma.yml (`access_token:`).
//
// The flow is authorization code + PKCE with a localhost callback:
//   1. a local HTTP server picks a free port and becomes the redirect URI;
//   2. dynamic client registration registers that URI;
//   3. the browser opens the Figma consent page;
//   4. the callback code is exchanged for access and refresh tokens;
//   5. tokens and the client registration are stored under $DSH_HOME.
//
// Figma allow-lists MCP clients by the dynamic-registration `client_name`.
// Every other name gets HTTP 403 from the registration endpoint, so the
// default is the allow-listed name "Claude Code"; --client-name overrides it.
//
// Usage:
//   node scripts/auth.mjs [--dsh-home <path>] [--client-name <name>] [--no-browser]
//   node scripts/auth.mjs --refresh [--dsh-home <path>]
//   node scripts/auth.mjs --status  [--dsh-home <path>]

import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const CONFIG_FILENAME = 'figma.yml';
const OAUTH_FILENAME = 'figma-oauth.json';
const DEFAULT_CLIENT_NAME = 'Claude Code';
const SCOPE = 'mcp:connect';
const RESOURCE = 'https://mcp.figma.com/mcp';
const REGISTER_URL = 'https://api.figma.com/v1/oauth/mcp/register';
const AUTHORIZE_URL = 'https://www.figma.com/oauth/mcp';
const TOKEN_URL = 'https://api.figma.com/v1/oauth/token';
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

const HELP = `Figma OAuth for dsh-plugin-figma

  node scripts/auth.mjs              authorize in the browser and save the token
  node scripts/auth.mjs --refresh    refresh the saved access token
  node scripts/auth.mjs --status     show the saved token state

Options:
  --dsh-home <path>    harness home (default: $DSH_HOME or ~/.dsh)
  --client-name <name> dynamic-registration client name (default: "${DEFAULT_CLIENT_NAME}")
  --no-browser         do not open the browser; print the URL instead
  -h, --help           show this help

Figma allows MCP only to clients on a fixed name allow-list. The default name
is the allow-listed "Claude Code"; any other name is rejected with HTTP 403.`;

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
  const args = { dshHome: '', clientName: '', noBrowser: false, refresh: false, status: false, help: false };
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
      case '--dsh-home':
        args.dshHome = value();
        break;
      case '--client-name':
        args.clientName = value();
        break;
      case '--no-browser':
        args.noBrowser = true;
        break;
      case '--refresh':
        args.refresh = true;
        break;
      case '--status':
        args.status = true;
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

function resolveHome(options) {
  const homeEnv = (process.env.DSH_HOME ?? '').trim();
  const dshHome = path.resolve(options.dshHome.trim() || homeEnv || path.join(os.homedir(), '.dsh'));
  return {
    dshHome,
    configPath: path.join(dshHome, CONFIG_FILENAME),
    oauthPath: path.join(dshHome, OAUTH_FILENAME),
  };
}

function clientName(options) {
  return (options.clientName.trim() || (process.env.FIGMA_OAUTH_CLIENT_NAME ?? '').trim() || DEFAULT_CLIENT_NAME).trim();
}

function base64url(buffer) {
  return buffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
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

function writePrivateJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Windows has no POSIX mode; the profile directory ACL applies instead.
  }
}

async function postForm(url, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: params,
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`token endpoint returned non-JSON: ${text.slice(0, 200)}`);
  }
}

function startCallbackServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        redirectUri: `http://127.0.0.1:${port}/callback`,
      });
    });
  });
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function page(title, message) {
  return `<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
    '<body style="font-family:system-ui,sans-serif;max-width:34rem;margin:4rem auto;line-height:1.5">' +
    `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></body>`;
}

function waitForCallback(server, expectedState, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('истекло время ожидания callback (5 минут)')), timeoutMs);

    server.on('request', (request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/callback') {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }
      const error = url.searchParams.get('error');
      const description = url.searchParams.get('error_description');
      const state = url.searchParams.get('state');
      const code = url.searchParams.get('code');

      if (state !== expectedState) {
        response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(page('Авторизация не удалась', 'Параметр state не совпал. Начните заново.'));
        finish(new Error('state mismatch'));
        return;
      }
      if (error) {
        response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(page('Авторизация не удалась', description || error));
        finish(new Error(`${error}${description ? `: ${description}` : ''}`));
        return;
      }
      if (!code) {
        response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(page('Авторизация не удалась', 'Figma не вернула код авторизации.'));
        finish(new Error('callback without code'));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(page('Авторизация завершена', 'Можно закрыть вкладку и вернуться в терминал.'));
      finish(undefined, { code });
    });
  });
}

async function registerClient(redirectUri, name) {
  const response = await fetch(REGISTER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_name: name,
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
      scope: SCOPE,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  if (response.status === 403) {
    throw new Error(
      `Figma отклонила регистрацию клиента "${name}" (HTTP 403). ` +
        'Figma пускает в MCP только имена из allow-list; произвольное имя отклоняется.',
    );
  }
  if (!response.ok) {
    throw new Error(`регистрация клиента: HTTP ${response.status}: ${text.slice(0, 400)}`);
  }
  const registration = JSON.parse(text);
  if (!registration.client_id) throw new Error('регистрация клиента не вернула client_id');
  return registration;
}

function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `start "" "${url.replaceAll('"', '%22')}"`], {
        windowsVerbatimArguments: true,
        detached: true,
        stdio: 'ignore',
      }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
    return true;
  } catch {
    return false;
  }
}

function saveTokens(home, registration, tokens) {
  const expiresAt = new Date(Date.now() + (Number(tokens.expires_in) || 3600) * 1000).toISOString();
  const stored = {
    client_id: registration.client_id,
    client_secret: registration.client_secret ?? '',
    client_name: registration.client_name ?? '',
    redirect_uri: registration.redirect_uris?.[0] ?? '',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? '',
    token_type: tokens.token_type ?? 'bearer',
    scope: tokens.scope ?? '',
    expires_at: expiresAt,
  };
  writePrivateJson(home.oauthPath, stored);

  let text = '';
  try {
    text = fs.readFileSync(home.configPath, 'utf8');
  } catch {
    text = '# Figma plugin configuration for DeepSeek Harness.\n\n';
  }
  const line = `access_token: ${JSON.stringify(tokens.access_token)}`;
  const pattern = /^[ \t]*access_token[ \t]*:[ \t]*.*$/m;
  if (pattern.test(text)) text = text.replace(pattern, () => line);
  else text = `${text}${text.endsWith('\n') ? '' : '\n'}${line}\n`;
  fs.writeFileSync(home.configPath, text, 'utf8');

  return { expiresAt, stored };
}

async function probe(token) {
  const response = await fetch(RESOURCE, {
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
        clientInfo: { name: 'dsh-plugin-figma-auth', version: '1.1.0' },
      },
    }),
    signal: AbortSignal.timeout(20000),
  });
  return response.status;
}

async function reportProbe(token) {
  try {
    const status = await probe(token);
    if (status === 200) info('Сервер принял access-токен (HTTP 200).');
    else warn(`сервер ответил HTTP ${status}; проверь токен и повтори авторизацию.`);
  } catch (error) {
    warn(`проверить токен не удалось (${error.message}); соединение проверится при старте dsh.`);
  }
}

function printStored(home) {
  if (!fs.existsSync(home.oauthPath)) return false;
  const stored = readJson(home.oauthPath, OAUTH_FILENAME);
  const expiresAt = stored.expires_at ?? '';
  const expired = expiresAt ? Date.parse(expiresAt) <= Date.now() : false;
  info(`  access token : сохранён в ${home.configPath}`);
  info(`  expires_at   : ${expiresAt || '—'}${expired ? ' (истёк)' : ''}`);
  info(`  refresh token: ${stored.refresh_token ? 'есть' : 'нет'}`);
  info(`  client       : ${stored.client_name || '—'}`);
  return true;
}

async function authorize(options) {
  const home = resolveHome(options);
  const name = clientName(options);
  const { server, redirectUri } = await startCallbackServer();
  info(`Callback: ${redirectUri}`);
  info(`Регистрирую OAuth-клиент "${name}"…`);

  let registration;
  try {
    registration = await registerClient(redirectUri, name);
  } catch (error) {
    server.close();
    fail(error.message);
  }

  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(24));
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', registration.client_id);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('resource', RESOURCE);

  info('');
  info('Открой ссылку и подтверди доступ в браузере:');
  info(url.toString());
  info('');
  if (options.noBrowser) {
    info('Браузер не открываю (--no-browser).');
  } else if (openBrowser(url.toString())) {
    info('Браузер открыт. Жду подтверждения…');
  } else {
    warn('не удалось открыть браузер; открой ссылку вручную.');
  }

  const { code } = await waitForCallback(server, state, CALLBACK_TIMEOUT_MS);
  info('Код получен, обмениваю на токены…');

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: registration.client_id,
    client_secret: registration.client_secret ?? '',
    code_verifier: verifier,
    resource: RESOURCE,
  });
  const tokens = await postForm(TOKEN_URL, params).catch((error) => fail(`обмен кода: ${error.message}`));
  if (!tokens.access_token) fail('token endpoint не вернул access_token');

  const saved = saveTokens(home, registration, tokens);
  info('');
  info('Готово.');
  info(`  токен     : сохранён в ${home.configPath}`);
  info(`  истекает  : ${saved.expiresAt}`);
  info(`  регистрация: ${home.oauthPath}`);
  await reportProbe(tokens.access_token);
  info('');
  info('Перезапусти harness, чтобы строка mcp-figma-remote подхватила токен: dsh web');
}

async function refresh(options) {
  const home = resolveHome(options);
  if (!fs.existsSync(home.oauthPath)) {
    fail(`нет сохранённой авторизации (${home.oauthPath}). Сначала выполни auth без --refresh.`);
  }
  const stored = readJson(home.oauthPath, OAUTH_FILENAME);
  if (!stored.refresh_token) fail('в сохранённой авторизации нет refresh_token; выполни auth заново.');

  info('Обновляю access-токен…');
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: stored.refresh_token,
    client_id: stored.client_id,
    client_secret: stored.client_secret ?? '',
  });
  const tokens = await postForm(TOKEN_URL, params).catch((error) => fail(`обновление: ${error.message}`));
  if (!tokens.access_token) fail('token endpoint не вернул access_token');

  const saved = saveTokens(home, {
    client_id: stored.client_id,
    client_secret: stored.client_secret,
    client_name: stored.client_name,
    redirect_uris: stored.redirect_uri ? [stored.redirect_uri] : [],
  }, { ...tokens, refresh_token: tokens.refresh_token || stored.refresh_token });

  info('');
  info('Готово.');
  info(`  токен    : ${home.configPath}`);
  info(`  истекает : ${saved.expiresAt}`);
  await reportProbe(tokens.access_token);
}

async function status(options) {
  const home = resolveHome(options);
  if (!printStored(home)) {
    info(`Сохранённой авторизации нет (${home.oauthPath}).`);
    return;
  }
  let token = storedToken(home);
  if (!token) {
    info(`Токен в ${home.configPath} не найден.`);
    return;
  }
  await reportProbe(token);
}

function storedToken(home) {
  let text;
  try {
    text = fs.readFileSync(home.configPath, 'utf8');
  } catch {
    return '';
  }
  const clean = (match) => (match ? match[1].replace(/[ \t]+#.*$/, '').trim().replace(/^["'](.*)["']$/, '$1').trim() : '');
  return (
    clean(text.match(/^[ \t]*access_token[ \t]*:[ \t]*(.*)$/m)) ||
    clean(text.match(/^[ \t]*api_key[ \t]*:[ \t]*(.*)$/m))
  );
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log(HELP);
} else if (options.refresh) {
  await refresh(options);
} else if (options.status) {
  await status(options);
} else {
  await authorize(options);
}
