---
name: e2e
description: Запуск e2e-тестов Altyn Market (локально или в облаке), релизы в TestFlight, Android-APK и работа с EAS без ручных промптов. Использовать, когда просят «запусти e2e», «прогони тесты», «залей в TestFlight», «сделай релизный прогон», «собери билд», «покажи отчёт по тестам».
---

# E2E и релизы Altyn Market

Все тесты бегут против **staging** (mock-платежи, dev-OTP `666999`). Полные
детали и соглашения — `docs/e2e.md`. Ничего интерактивного: eas-сессия уже
залогинена на этом Mac (`npx --yes eas-cli@21.0.1 whoami` → rassul.rakhimzhan),
сабмит в TestFlight идёт через ASC API Key, хранящийся на серверах EAS, Apple-логин
не нужен. Если eas вдруг разлогинен — остановись и попроси пользователя выполнить
`npx eas-cli login`; не проси токены в чате.

## «Запусти e2e тесты» (локально, бесплатно — режим по умолчанию)

```bash
pnpm --filter @altyn-market/e2e local            # web + iOS-симулятор
pnpm --filter @altyn-market/e2e local -- --web   # только веб (~1 мин)
pnpm --filter @altyn-market/e2e local -- --ios --android
```

Скрипт сам: сидит staging, готовит фикстуры, гоняет Playwright и Maestro-флоу,
пишет **записи экрана симулятора**, собирает единый отчёт
`e2e/local-report/index.html` и открывает его. Предусловия для iOS (скрипт
проверяет и подскажет): запущенный симулятор, оба приложения установлены
(`npx expo run:ios` в `apps/customer-mobile` и `apps/staff-mobile`), maestro CLI
(`curl -Ls https://get.maestro.mobile.dev | bash`).

Чинить упавший флоу — локально через `maestro studio` или Maestro MCP
(сервер `maestro` в `.mcp.json`); флоу лежат в `apps/*-mobile/.maestro/`.
НЕ отлаживай флоу облачными EAS-прогонами — каждый стоит ~$3 билдов.

## «Залей последние билды в TestFlight» (локально, бесплатно)

```bash
cd apps/customer-mobile && pnpm eas:release:demo:local
cd apps/staff-mobile   && pnpm eas:release:demo:local
```

Собирает .ipa на этом Mac (`eas build --local`, нужен Xcode, ~10–15 мин на
приложение) и сабмитит через `eas submit --path` — билд появится в TestFlight
через ~15–30 мин после заливки (обработка Apple). Запускай оба приложения
последовательно, не параллельно (Xcode). Android-аналога TestFlight пока нет
(нет Play Console) — Android-билд для ручной установки: `pnpm eas:build:preview`
→ ссылка/QR на expo.dev.

## «Сделай релизный прогон» (облако, ~$12 — только по явной просьбе)

```bash
gh workflow run e2e.yml --repo rvssvl/altynmarket --ref main -f platforms=all -f release=true
```

Это: мобильные Maestro-тесты на устройствах EAS (iOS+Android, оба приложения) +
сборка demo-билдов с авто-сабмитом iOS в TestFlight + Android preview-APK +
обновление дэшборда. Перед запуском убедись, что предыдущий e2e-run завершён
(`gh run list --workflow e2e.yml`) — у workflow общая очередь.

## Статусы и отчёты

- Дэшборд (CI-прогоны, история, видео Playwright): https://rvssvl.github.io/altynmarket/
- Локальный отчёт: открывается сам после `local` (сервер http://localhost:4499);
  показать ещё раз — `pnpm --filter @altyn-market/e2e report`
- Раны CI: `gh run list --repo rvssvl/altynmarket --workflow e2e.yml`
- Билды EAS: `npx --yes eas-cli@21.0.1 build:list --limit 5` (в папке приложения)
- Мобильные EAS-раны с артефактами: expo.dev → проект → Workflows

## Грабли (проверено опытом)

- Скрипты на Effect RPC-клиенте должны заканчиваться `process.exit(0)`.
- Пуш в staging гоняет только бесплатный web-прогон — мобильное облако ТОЛЬКО
  через релизный прогон или галочку в Actions.
- Аккаунты изолированы по платформам: web `+770000000 2x`, Android `+7700000000x`,
  iOS `+770000000 1x` — не смешивать, иначе параллельные прогоны дерутся за задания.
- `appId` во флоу = bundle id приложений (`kz.altynmarket.*.demo`); при смене
  bundle id обновить одной заменой по `.maestro/*.yaml`.
