# E2E testing

Автоматические E2E-тесты трёх поверхностей против **staging**:

| Поверхность | Инструмент | Где живут кейсы | Где артефакты |
| --- | --- | --- | --- |
| Backoffice (web) | Playwright, headless Chromium | `e2e/playwright/tests/*.spec.ts` | видео/trace/скрины в HTML-отчёте |
| customer-mobile (iOS + Android) | Maestro на EAS Workflows | `apps/customer-mobile/.maestro/*.yaml` | видео/логи на expo.dev |
| staff-mobile (iOS + Android) | Maestro на EAS Workflows | `apps/staff-mobile/.maestro/*.yaml` | видео/логи на expo.dev |

Сводный отчёт всех прогонов (матрица «сценарий × платформа», история) публикуется
на GitHub Pages джобой `report` из `.github/workflows/e2e.yml`.

## Почему это работает без ручной возни

- OTP на staging консольный: `RequestOtp` возвращает `devCode` (код `666999` подходит
  любому номеру), приложения сами подставляют его в поле ввода.
- Платежи — mock-провайдер, пуши — console: путь checkout → сборка → capture →
  refund детерминирован.
- Тестовые данные создаёт идемпотентный seed: аккаунты `+77000000001` (customer),
  `+77000000002` (picker «E2E Picker»), `+77000000003` (courier «E2E Courier»),
  категория `E2E Groceries`, товары `E2E-*`.

## Запуск

CI (`.github/workflows/e2e.yml`) стартует сам после каждого деплоя staging,
ночью в 03:00 Алматы и вручную (`workflow_dispatch`, можно выбрать web/mobile).
Требуемые секреты GitHub: `EXPO_TOKEN` (personal access token с expo.dev).

Локально:

```bash
pnpm --filter @altyn-market/domain build && pnpm --filter @altyn-market/client build
pnpm --filter @altyn-market/e2e seed              # подготовить staging-данные
pnpm --filter @altyn-market/e2e test:web          # Playwright против admin-staging
pnpm --filter @altyn-market/e2e report:web        # открыть HTML-отчёт

pnpm --filter @altyn-market/e2e fixtures:mobile   # заказы для picker/courier флоу
maestro test apps/customer-mobile/.maestro/       # против локального симулятора
cd apps/customer-mobile && npx --yes eas-cli@21.0.1 workflow:run e2e.yml  # облако EAS
```

Для мобильного облака нужен платный план EAS (Maestro-джобы) — билды по профилю
`e2e` (`eas.json`: iOS simulator + Android apk) и прогоны идут на устройствах Expo.

## Demo-релизы по пушу

Джоба `release` в том же workflow стартует на каждом деплое staging параллельно
с тестами: iOS demo-билд собирается и **сам сабмитится в TestFlight**
(`--auto-submit`), Android собирается по профилю `preview` как internal-APK —
ставится по ссылке/QR со страницы билда на expo.dev. На ночном cron релизы не
собираются; при ручном запуске — галочка `release`.

Разовая настройка для iOS: в EAS должен лежать App Store Connect API Key
(`eas credentials` → iOS → App Store Connect API Key), иначе non-interactive
submit упадёт. Аналог TestFlight для Android — Internal testing в Google Play:
подключается позже через `eas submit -p android` с сервисным аккаунтом, когда
приложение заведено в Play Console.

## Как добавить кейс

**Web:** новый `*.spec.ts` в `e2e/playwright/tests/`. Селекторы — существующие
`data-action`/`data-module`-атрибуты backoffice, не текст кнопок. Авторизация уже
сделана setup-проектом (storageState супер-админа); для сценариев без логина —
`test.use({ storageState: { cookies: [], origins: [] } })`. RPC-хелперы для
подготовки данных: `e2e/lib/{api,seed,advance-order}.ts`.

**Mobile:** новый YAML во flow-директории приложения + строчка в
`apps/<app>/.eas/workflows/e2e.yml` (`flow_path`). Maestro тапает по видимому
тексту (UI приложений на английском); `testID` в компонентах пока нет — если
селектор неоднозначен (`"+"`, `"Refresh"`), используйте `index:` или добавьте
`testID`. Дев-код OTP подставляется приложением сам — после «Send code» сразу
жмите кнопку входа.

**Подготовка состояния** делается через RPC, не через UI: например, picker-флоу
ожидает уже назначенное задание — его создаёт `e2e/scripts/prepare-mobile-fixtures.ts`.

## MCP для агентов

`.mcp.json` подключает два сервера:

- `playwright` (`@playwright/mcp`) — агент водит браузер, подбирает селекторы,
  проверяет флоу перед коммитом.
- `maestro` (`maestro mcp`) — агент запускает флоу на локальном симуляторе,
  смотрит иерархию UI и скриншоты, чинит упавшие шаги. Требует установленный
  Maestro CLI: `curl -Ls https://get.maestro.mobile.dev | bash`.

## Важные ограничения

- Тесты пишут данные в staging-базу. Используйте только выделенные
  `+77000000xx`-аккаунты и `E2E-*` товары; заказы доводите до `delivered`,
  чтобы не копить «висящие» задачи у стаффа.
- `appId` в Maestro-флоу — это bundle id/package приложений
  (`kz.altynmarket.customer` / `kz.altynmarket.staff`). При смене
  идентификаторов обновите заголовки всех YAML в `.maestro/`.
- Backoffice перерисовывает весь DOM после фоновой загрузки данных — прежде чем
  заполнять формы, дождитесь появления данных (см. `catalog.spec.ts`).
- Скрипты на Effect-клиенте должны заканчиваться `process.exit(0)` — иначе
  `ManagedRuntime` держит процесс живым.
