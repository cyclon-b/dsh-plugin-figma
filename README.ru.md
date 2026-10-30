# dsh-plugin-figma

[English version](README.md)

Figma для [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) —
DSH-аналог официального плагина Figma. Подключает удалённый Figma MCP-сервер и
прикладывает официальные Agent Skills Figma для сценариев «макет → код».

## Что даёт плагин

| Часть | Что делает |
|---|---|
| MCP-сервер `figma` | Подключает `https://mcp.figma.com/mcp` — эндпоинт из конфигурации MCP самой Figma — через штатный `@deepseek-ai/dsh-mcp-client`. Инструменты приходят модели как `mcp__figma__get_design_context`, `mcp__figma__get_screenshot`, `mcp__figma__use_figma` и остальные; список опрашивается у сервера на старте |
| 16 Agent Skills | Официальные скиллы Figma (`figma-use`, `figma-design-to-code`, `figma-generate-design`, `figma-generate-library`, `figma-code-connect`, `figma-spec`, `figma-swiftui`, шейдеры, motion, FigJam, Slides и другие), скопированные без изменений из официального бандла плагина 2.2.157 |
| `figma.yml` | YAML-конфиг плагина: персональный токен Figma задаётся в одном файле вне репозитория |

Плагин не реализует инструменты Figma сам: их публикует сервер, а клиент MCP в
харнессе регистрирует их как обычные инструменты. Обновление Figma добавляет
инструменты без обновления плагина.

## Требования

- `dsh` **0.2.1-rc.2** (проверено) с профилем на базе `@deepseek-ai/dsh-base` —
  `web`, `acp`, `headless`, `desktop`.
- Node.js **≥ 22.3** — требование харнесса; выражение в патче читает файл
  конфигурации через `process.getBuiltinModule`.
- Аккаунт Figma. Входящая в комплект команда `auth.ps1` / `auth.sh` получает
  OAuth access token (`figu_…`) через браузер. Удалённый сервер **не принимает**
  персональный токен (`figd_…`): он работает только с REST API Figma, а
  MCP-эндпоинт отвечает на него `401`.
- Windows PowerShell 5.1+ или любой POSIX `sh`.

## Установка

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

Затем авторизуйся в браузере и перезапусти харнесс:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\auth.ps1
```

```sh
./auth.sh
```

Команда регистрирует локальный OAuth-клиент, открывает страницу согласия Figma,
ждёт callback на localhost и записывает OAuth access token в
`$DSH_HOME/figma.yml`. В конце она проверяет токен запросом к
`https://mcp.figma.com/mcp`.

```sh
dsh web
```

Установщик создаёт `figma.yml` из `figma.example.yml` при первой установке (при
удалении плагина файл с токеном остаётся). Без браузерного потока токен можно
вписать в `figma.yml` вручную; `api_key:` работает как псевдоним
`access_token:`. Для неинтерактивной установки можно заранее положить
заполненный `figma.yml` рядом с установщиком — он скопируется в `$DSH_HOME`.

Установщик умеет ставить плагин в другой профиль, домашний каталог и через
другой исполняемый файл `dsh`:

```
install.ps1 -Profile acp -DshHome D:\dsh -Dsh "C:\path\dsh.cmd"
./install.sh --profile acp --dsh-home /home/me/.dsh --dsh /usr/local/bin/dsh
```

## Что меняет установщик

| Путь | Изменение |
|---|---|
| `profiles/<имя>/package.json` | Добавляет `"dsh-plugin-figma": "link:<репозиторий>"` в `dependencies` и `dsh-plugin-figma` в `dsh.profile.bundles` |
| `profiles/<имя>/node_modules/dsh-plugin-figma` | Junction (Windows) или symlink (POSIX) на этот репозиторий |
| `$DSH_HOME/skills/<имя>` | 16 скиллов Figma. Скилл с тем же именем, установленный не этим плагином, сначала переносится в `$DSH_HOME/.dsh-figma-plugin-backup/<timestamp>/` |
| `$DSH_HOME/figma.yml` | Создаётся из `figma.example.yml`, если его нет; при удалении плагина остаётся |
| `$DSH_HOME/.dsh-figma-plugin.json` | Манифест установленных скиллов и профилей, по нему работает удаление |

Повторный запуск установщика идемпотентен. Скиллы копируются, а не линкуются,
поэтому после `git pull` установщик нужно запустить снова; сам бандл связан
ссылкой и подхватывает изменения патча при следующем старте харнесса.

## Авторизация

`auth.ps1` / `auth.sh` выполняет OAuth authorization-code flow с PKCE:

1. поднимает callback-сервер на `127.0.0.1` и регистрирует его как redirect URI;
2. регистрирует OAuth-клиент на `https://api.figma.com/v1/oauth/mcp/register`;
3. открывает `https://www.figma.com/oauth/mcp`; подтверди доступ в браузере;
4. меняет код из callback на access- и refresh-токены;
5. записывает access token в `figma.yml` (`access_token:`), а регистрацию клиента
   и refresh token — в `$DSH_HOME/figma-oauth.json`;
6. вызывает `initialize` на MCP-эндпоинте и печатает `HTTP 200` или `401`.

Опции: `--no-browser` печатает ссылку вместо открытия браузера, `--client-name`
меняет имя регистрации, `--status` показывает сохранённый токен и срок,
`--refresh` обновляет access token без браузера.

> **Figma пускает в этот эндпоинт только имена клиентов из allow-list.**
> Динамическая регистрация отвечает `403` на любое имя, которое Figma не
> допустила; команда по умолчанию использует разрешённое имя `Claude Code`,
> поэтому страница согласия показывает именно его. Это обход beta-ограничения, а
> не официальная интеграция: Figma может изменить или отозвать его, использование
> — на твой риск. Если имя отклонено, `auth` падает с ошибкой регистрации ещё до
> открытия браузера.

Токены живут около 90 дней. `--refresh` использует сохранённый refresh token;
если его нет, запусти `auth` заново.

## Конфигурация

`$DSH_HOME/figma.yml` читается каждый раз, когда активируется MCP-строка:

```yaml
access_token: "figu_..."
```

Это значение записывает `auth.ps1` / `auth.sh`. `api_key:` принимается как
псевдоним того же значения. Переменные окружения `FIGMA_ACCESS_TOKEN`,
`FIGMA_API_KEY` или `FIGMA_TOKEN` имеют приоритет. Заголовок выбирается по
префиксу токена: `figu_…` → `Authorization: Bearer`, `figd_…` → `X-Figma-Token`
(REST/локальные серверы; удалённый MCP-эндпоинт его отклоняет). Без токена
заголовок не подставляется, сервер отвечает `401`, харнесс всё равно стартует —
просто без инструментов Figma.

### Модель авторизации

Удалённый Figma MCP-сервер работает только через OAuth. Клиент MCP в харнессе
говорит по обычному Streamable HTTP и не выполняет OAuth-рукопожатие, поэтому
плагин проходит authorization-code flow сам (`auth.ps1` / `auth.sh`) и сохраняет
полученный OAuth access token (`figu_…`) в `figma.yml`. MCP-строка отправляет
его как `Authorization: Bearer`.

Персональный токен (`figd_…`) не заменяет его: REST API его принимает
(`GET https://api.figma.com/v1/me` проходит), но `https://mcp.figma.com/mcp`
отвечает `401 Unauthorized`, если передать его в `X-Figma-Token`. Форма с этим
заголовком в строке остаётся для локальных и REST-серверов и выбирается по
префиксу токена.

## Проверка

Если токен уже задан, установщик сам проверяет `https://mcp.figma.com/mcp` и
печатает `HTTP 200` (токен принят) или `HTTP 401/403` (токен отклонён). Без сети
он только предупреждает: установка от проверки не зависит.

Посмотреть собранный профиль без запуска:

```sh
dsh --profile web --dump-config | grep -A8 mcp-figma-remote
```

## Использование

После перезапуска модель видит инструменты `mcp__figma__*`, а скиллы появляются
в каталоге под официальными именами. Достаточно дать ссылку на Figma или
поставить задачу по макету: скиллы срабатывают сами (`figma-design-to-code`
перед `get_design_context`, `figma-use` перед `use_figma` и так далее).

## Профили

По умолчанию ставится в `web`. `acp`, `headless` и любой кастомный профиль на
базе `dsh-base` работают так же. Профилем `desktop` владеет приложение DeepSeek
Harness Desktop: npm-CLI отказывается управлять его плагинами и может
перезаписать профиль, поэтому изменения там — дело Desktop-приложения.

## Удаление

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall.ps1
```

```sh
./uninstall.sh
```

Удаляет бандл из `dsh.profile.bundles`, ссылку в профиле и установленные скиллы,
восстанавливая сохранённые копии, если они были. `figma.yml` остаётся — в нём
может быть токен. Скиллы не удаляются, пока плагин используется другим профилем.

## Диагностика

| Симптом | Что проверить |
|---|---|
| Нет инструментов `mcp__figma__*` | Перезапустить харнесс. Проверить `dsh --profile web --dump-config \| grep mcp-figma-remote`. Посмотреть в логе ошибку подключения `figma` |
| `401 Unauthorized` | Токен не задан, истёк или это `figd_`-токен. Запусти `auth.ps1 --refresh` (или `auth.sh --refresh`); если refresh-токена нет — `auth` заново. Удалённый MCP-сервер принимает только OAuth access token `figu_` |
| `figd_ tokens must be passed via X-Figma-Token` | В `Authorization: Bearer` отправлен `figd_`-токен. Удалённому эндпоинту нужен `figu_`; `figd_` оставь для локальных/REST-серверов |
| Скиллы заменились | Восстановить из `$DSH_HOME/.dsh-figma-plugin-backup/<timestamp>/` или запустить удаление |
| Node старше 22.3 | Патч не сможет прочитать `figma.yml`; задай `FIGMA_API_KEY` в окружении или обнови Node |
| Две строки Figma / старый прототип | Убрать прежнюю ссылку и бандл `dsh-plugin-figma` из профиля до установки этого плагина |

## Устройство

```
dsh-plugin-figma/
  package.json         dsh.bundle.patch -> cordis.patch.yml
  cordis.patch.yml     одна insert-строка: @deepseek-ai/dsh-mcp-client -> Figma MCP
  figma.example.yml    шаблон конфига с токеном
  install.ps1/.sh      обёртки CLI-установщика
  uninstall.ps1/.sh    обёртки удаления
  auth.ps1/.sh         обёртки браузерной авторизации
  scripts/install.mjs  общая реализация установщика
  scripts/auth.mjs     OAuth authorization-code flow с PKCE
  skills/              официальные Agent Skills Figma (см. NOTICE)
```

## Ограничения

- OAuth-рукопожатие использует обход allow-list по имени клиента (см.
  [Авторизация](#авторизация)); access token истекает и требует `--refresh`.
- Figma ограничивает частоту инструментов чтения макетов в зависимости от плана
  и места в аккаунте; инструменты записи под лимит не попадают.
- Плагин не устанавливает и не запускает приложение Figma и не добавляет его
  локальный MCP-сервер. Официальный плагин Figma использует удалённый сервер;
  для локального эндпоинта добавь отдельную строку `@deepseek-ai/dsh-mcp-client`.
- Скиллы в `skills/` — контент Figma, а не этого проекта; см. [NOTICE](NOTICE).

## Лицензия

MIT для патча бандла, установщика и документации. Скиллы принадлежат Figma и
под эту лицензию не попадают — см. [NOTICE](NOTICE).
