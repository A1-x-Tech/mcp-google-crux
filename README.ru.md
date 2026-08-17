# <img src="./assets/a1-logo.svg" alt="A1" width="40"> Google CrUX MCP

[English](./README.md) | **Русский**

[![npm](https://img.shields.io/npm/v/mcp-google-crux)](https://www.npmjs.com/package/mcp-google-crux)
[![CI](https://github.com/A1-x-Tech/mcp-google-crux/actions/workflows/ci.yml/badge.svg)](https://github.com/A1-x-Tech/mcp-google-crux/actions/workflows/ci.yml)
[![Glama](https://glama.ai/mcp/servers/A1-x-Tech/mcp-google-crux/badges/score.svg)](https://glama.ai/mcp/servers/A1-x-Tech/mcp-google-crux)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**A1 Google CrUX MCP** приносит данные Core Web Vitals от реальных пользователей в AI-приложение. Проверяйте, проходит ли публичный сайт или страница LCP, INP и CLS, сравнивайте мобильные устройства с десктопами и смотрите изменения метрик во времени.

Сервер читает набор данных Chrome UX Report от Google — полевые данные пользователей Chrome, а не синтетический speed test и не способ изменить сайт.

- **6 инструментов только для чтения.** Оценка Core Web Vitals, сравнение устройств, origin и страницы, тренд за 40 недель, latest и historical raw records.
- **Данные реальных пользователей.** Это те же полевые данные CrUX, которые используют PageSpeed Insights и сигналы Google Core Web Vitals.
- **Понятная граница доступности.** Данные есть только для публичных origin и URL с достаточным трафиком; `no_data` — нормальный результат.
- **Известная стоимость квоты.** CrUX разрешает 150 запросов в минуту на проект. Сравнение устройств делает четыре API-вызова, origin и страницы — два.

Начните с запроса, который только читает данные:

> Проходит ли `https://example.com` Core Web Vitals на мобильных устройствах?

[Подключить сервер](#быстрый-старт) · [Посмотреть сценарии](#что-можно-поручить) · [Открыть техническую документацию](#техническая-документация)

---

## Увидеть работу за минуту

> **Вы:** Проходит ли `https://example.com/pricing` Core Web Vitals на мобильных устройствах?
>
> **Ассистент:** Показывает p75 LCP, INP и CLS, оценки good/needs-improvement/poor и общий результат. Ничего не меняется.
>
> **Вы:** Сравни эту страницу со средним по сайту и покажи разницу между мобильными устройствами и десктопом.
>
> **Ассистент:** Сравнивает origin и URL, затем группы устройств и их доли трафика. Все шесть инструментов только читают публичный набор данных CrUX.

## Содержание

- [Быстрый старт](#быстрый-старт)
- [Что можно поручить](#что-можно-поручить)
- [Как читать данные CrUX](#как-читать-данные-crux)
- [Как получить доступ](#как-получить-доступ)
- [Конфигурация](#конфигурация)
- [Данные, лимиты и работа в фоне](#данные-лимиты-и-работа-в-фоне)
- [Техническая документация](#техническая-документация)
- [Поддержка](#поддержка)

## Быстрый старт

Нужны Node.js 20+ и API-ключ Google Cloud с включённым Chrome UX Report API.

1. [Создайте ограниченный API-ключ](#как-получить-доступ).
2. Добавьте сервер в AI-приложение.
3. Отправьте запрос, который только читает данные.

<details open><summary><strong>Codex</strong></summary>

<br>

В **Settings → Plugins → MCP servers** выберите **Add server**, затем добавьте `npx -y mcp-google-crux@latest` с `CRUX_API_KEY`.

```bash
codex mcp add google-crux --env CRUX_API_KEY=your_key -- npx -y mcp-google-crux@latest
codex mcp list
```

[Документация Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)

</details>

<details><summary><strong>Claude Code</strong></summary>

<br>

```bash
claude mcp add --env CRUX_API_KEY=your_key --transport stdio --scope user google-crux -- npx -y mcp-google-crux@latest
claude mcp list
```

[Документация Claude Code MCP](https://code.claude.com/docs/en/mcp)

</details>

<details><summary><strong>Claude Desktop</strong></summary>

<br>

Откройте **Settings → Developer → Edit Config** и добавьте `{"mcpServers":{"google-crux":{"command":"npx","args":["-y","mcp-google-crux@latest"],"env":{"CRUX_API_KEY":"your_key"}}}}`.

Если **Edit Config** недоступна, отредактируйте `~/Library/Application Support/Claude/claude_desktop_config.json` на macOS или `%APPDATA%\Claude\claude_desktop_config.json` на Windows. [Документация Claude Desktop MCP](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)

</details>

<details><summary><strong>Cursor</strong></summary>

<br>

Добавьте `{"mcpServers":{"google-crux":{"type":"stdio","command":"npx","args":["-y","mcp-google-crux@latest"],"env":{"CRUX_API_KEY":"your_key"}}}}` в `~/.cursor/mcp.json` на macOS/Linux или `%USERPROFILE%\.cursor\mcp.json` на Windows. [Документация Cursor MCP](https://cursor.com/docs/mcp)

</details>

<details><summary><strong>VS Code</strong></summary>

<br>

Запустите **MCP: Open User Configuration** и добавьте:

```json
{"servers":{"google-crux":{"type":"stdio","command":"npx","args":["-y","mcp-google-crux@latest"],"env":{"CRUX_API_KEY":"${input:crux_api_key}"}}},"inputs":[{"type":"promptString","id":"crux_api_key","description":"API-ключ Google Cloud","password":true}]}
```

Проверьте сервер командой **MCP: List Servers**. [Документация VS Code MCP](https://code.visualstudio.com/docs/agent-customization/mcp-servers)

</details>

## Что можно поручить

- Проходит ли этот public origin или URL Core Web Vitals?
- Сравни результаты для телефона, десктопа, планшета и всех устройств.
- Эта страница быстрее или медленнее среднего по сайту?
- Как менялись LCP, INP и CLS в последние 25 недель?
- Покажи raw histograms и percentiles CrUX для технической проверки.

## Как читать данные CrUX

CrUX показывает скользящее окно 28 дней, которое обновляется ежедневно. Исторические данные недельные и обновляются по понедельникам. Ключевое значение — p75: 75% визитов не превышают его. `get_core_web_vitals` сам интерпретирует пороги метрик; raw-инструменты показывают полные гистограммы и доли.

Отсутствие данных не означает, что сайт сломан. Это значит, что у Google нет достаточно большой выборки публичных пользователей Chrome для этого origin, URL или группы устройств. Для планшетов и отдельных URL `no_data` встречается часто.

## Как получить доступ

1. В [Google Cloud Console](https://console.cloud.google.com/) создайте или выберите проект; для CrUX не нужен billing account.
2. Включите [Chrome UX Report API](https://console.cloud.google.com/apis/library/chromeuxreport.googleapis.com).
3. Создайте API-ключ в **APIs & Services → Credentials**.
4. Ограничьте ключ только Chrome UX Report API и передайте его как `CRUX_API_KEY`.

Ключ хранится в конфигурации MCP-клиента и передаётся в URL запроса API, поэтому относитесь к нему как к паролю.

## Конфигурация

| Переменная | Обязательна | Описание |
|---|---|---|
| `CRUX_API_KEY` | Да | Ключ Google Cloud с включённым Chrome UX Report API. |
| `CRUX_API_BASE` | Нет | Переопределяет базовый URL API. |
| `CRUX_TIMEOUT_MS` | Нет | Тайм-аут запроса; по умолчанию `30000` мс. |
| `CRUX_MAX_RETRIES` | Нет | Повторы 429, 5xx и сетевых ошибок; по умолчанию `3`. |

## Данные, лимиты и работа в фоне

- **Публичный набор данных только для чтения.** Сервер не меняет сайты, Search Console, записи CrUX или позиции Google.
- **Повторы с учётом квоты.** Он повторяет `429`, 5xx и сетевые ошибки с задержкой. Учитывайте составные сравнения при планировании 150 запросов в минуту на проект.
- **Постоянного наблюдения нет.** Сервер работает только при вызове. Если AI-приложение поддерживает задания по расписанию, оно может создавать регулярный отчёт о производительности.
- **Анонимная телеметрия.** Отправляются данные установки и версий, а также имена инструментов, но не API-ключ, URL, результаты, аргументы или промпты. Чтобы отключить её, задайте `ASKADS_TELEMETRY=0`.

## Техническая документация

- [Все инструменты и параметры](./docs/TOOLS.md)
- [Документация по разработке](./docs/DEVELOPMENT.md)
- [Документация по публикации](./docs/PUBLISHING.md)
- [Документация CrUX API](https://developer.chrome.com/docs/crux/api)

## Поддержка

Нашли ошибку или не хватает сценария? [Создайте issue](https://github.com/A1-x-Tech/mcp-google-crux/issues) или напишите в [Telegram](https://t.me/a1_mcp).

<br>

<p align="center">
  <img src="https://github.com/ztemerbekov/a1-yandex-kit-skills/raw/main/assets/images/mona-hifive-yandex-kit-warm.gif" alt="Две Моны дают пять" width="256">
</p>

<p align="center">
  Вы дочитали до конца!
</p>
