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
- Аккаунт Figma и **персональный токен** (`figd_…`) из
  [figma.com/settings](https://www.figma.com/settings) → **Security** →
  **Personal access tokens**. Для чтения макетов достаточно scope **File content
  → Read**; инструментам записи в холст нужны соответствующие scope.
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

Затем впиши токен в конфиг и перезапусти харнесс:

```yaml
# %USERPROFILE%\.dsh\figma.yml   ($DSH_HOME/figma.yml)
api_key: "figd_твой_токен"
```

```sh
dsh web
```

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

## Конфигурация

`$DSH_HOME/figma.yml` читается каждый раз, когда активируется MCP-строка:

```yaml
api_key: "figd_..."
```

Переменные окружения `FIGMA_API_KEY` или `FIGMA_TOKEN` имеют приоритет. Токен
передаётся в заголовке `X-Figma-Token`. Без токена заголовок не подставляется,
сервер отвечает `401`, харнесс всё равно стартует — просто без инструментов
Figma.

### Почему персональный токен, а не OAuth

Удалённый Figma MCP-сервер защищён OAuth. Клиент MCP в харнессе говорит по
обычному Streamable HTTP и не выполняет OAuth-рукопожатие, а Figma закрыла
динамическую регистрацию клиентов для произвольных приложений
(`POST https://api.figma.com/v1/oauth/mcp/register` → `403`), поэтому профиль не
может зарегистрироваться сам так, как это делает зарегистрированный клиент.
Сервер
Figma принимает персональный токен в заголовке `X-Figma-Token` — он сам его
разрешает (`access-control-allow-headers: Content-Type, X-Figma-Token,
Authorization`), — и плагин использует этот путь. Токен `figd_` обязан идти
именно в `X-Figma-Token`; с `Authorization: Bearer` сервер отвечает ошибкой.

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
| `401 Unauthorized` | Токен не задан, неверный, истёк или без scope `File content → Read`. Перепроверить `api_key`; переменные окружения перекрывают файл |
| `figd_ tokens must be passed via X-Figma-Token` | Прокси переписал заголовок в `Authorization`; строка уже использует `X-Figma-Token` |
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
  scripts/install.mjs  общая реализация установщика
  skills/              официальные Agent Skills Figma (см. NOTICE)
```

## Ограничения

- OAuth не выполняется; поддерживается только персональный токен.
- Figma ограничивает частоту инструментов чтения макетов в зависимости от плана
  и места в аккаунте; инструменты записи под лимит не попадают.
- Плагин не устанавливает и не запускает приложение Figma и не добавляет его
  локальный MCP-сервер. Официальный плагин Figma использует удалённый сервер;
  для локального эндпоинта добавь отдельную строку `@deepseek-ai/dsh-mcp-client`.
- Скиллы в `skills/` — контент Figma, а не этого проекта; см. [NOTICE](NOTICE).

## Лицензия

MIT для патча бандла, установщика и документации. Скиллы принадлежат Figma и
под эту лицензию не попадают — см. [NOTICE](NOTICE).
