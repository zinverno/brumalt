# Changelog

## 0.3.3 — Brumalt, first public beta, 2026-11-16

- Final branding: Brumalt, ID `brumalt`, author Zinvernix. Approved `assets/walp.jpg` included unchanged. Earlier entries below describe local versions under the former ID, not published Brumalt releases.
- Native Obsidian close retained; custom header close and native-hiding CSS removed. Back and safe unfinished-attempt exit preserved.
- One-time validated import from the old plugin only when the new data file is absent. Old files stay untouched, existing new files are never merged/overwritten, and failures block writes. Hotkeys require reassignment to `brumalt:open-games`.
- Schema 4 and gameplay, modes, 2/1/0 points, reminder, adaptation and comparison logic preserved. New import/restart/failure and realistic native-close DOM tests.
- English/Russian documentation, MIT attribution, package verification and Node 22/24 CI. A single CI-gated path publishes the first public prerelease with separate install assets, ZIP and checksums.

## 0.3.2 — final UI polish, 2026-11-15

- One header close icon: hide the native close within the plugin container, whether it is inside or beside the panel. Back, Escape/backdrop confirmation and other plugins’ Modals keep their roles.
- Optimistic duration control updates in place without a loading row or focus loss. Serial background writes coalesce rapid selections; new plans use the chosen duration immediately. Failed writes keep that choice and offer retry/restore, with a persistent selected-button error hint.
- Dedicated local Positions grid-and-marker SVG, using currentColor, 24 px geometry and the existing outline weights/sizing.
- Renamed the mode to Single game / Отдельная игра across labels, history and settings help. Stored mode IDs and schema 4 remain unchanged.
- Radar contours always render. Missing axes use a visual 10/100 baseline and hollow markers; text/tooltips still say No data yet / Нет данных. Real zero scores remain zero; the floor never enters statistics.
- Home, Progress, session results and the ribbon explicitly name daily points. Russian point forms and reminder wording remain localized.
- Added delayed-write, rapid-selection, failure/retry/restore, close-control, icon, missing-data and copy regressions. No dependencies, new games or data migrations.

## 0.3.1 — navigation and compact Progress, 2026-11-15

- Explicit Home / Progress / GameSetup / GameActive / SessionResult navigation within one Modal. Consistent sticky header Back/Close; Progress and Setup return Home directly.
- Inline active-attempt exit confirmation. Stay retains input and pauses/resumes game timers; cancellation records nothing. Completed-result saves outlive navigation and closure. Unload forcibly releases the confirmation and game resources.
- SessionResult now distinguishes Back to notes, Play again and Home. Returning Home also checks a reminder deferred during gameplay.
- Language selection moved entirely to plugin settings; existing explicit/automatic language preferences and fallback preserved.
- Compact Progress: daily points, week, lightweight six-axis SVG, six expandable game rows. A rounded, smoothed index uses ten comparable attempt slots with neutral padding; missing games remain missing. No chart library, animation or persisted chart state.
- HTML axis labels wrap independently of SVG scaling, with a text alternative. Existing daily points, games, storage, comparisons and schema 4 remain intact; no new migration or dependencies.
- Added navigation, confirmation/timer/focus, reminder return, profile bounds/stability and RU/EN DOM tests. Native/visual acceptance remains blocked before application/page load in this environment.

## 0.3.0 — polish, languages and balanced goals, 2026-11-15

- Calmer compact Modal: Play-first home, segmented duration, short game cards, weekly activity at the bottom, header back navigation, expandable history and quieter difficulty/hint/reminder controls.
- Complete English/Russian UI dictionaries, plural forms, header language switch and settings preference. Automatic follows Obsidian/environment with an English fallback. Added an offline English word bank; word records compare within their material language.
- Daily goal points per game: +2 for the first saved attempt, +1 for the second, +0 thereafter. All attempts still enter statistics. Targets are 6 / 9 / 12 or off; one game cannot complete any offered goal. Changed targets apply tomorrow, disabling is immediate.
- Schema 4 migration preserves earlier settings, levels, records and legacy daily activity. The old 3-attempt setting becomes 6 points. Exact points are reconstructed only for complete daily histories; incomplete aggregates retain their old count and target without fabricated precision.
- Localized weekly tooltips and reminders use points, not raw attempts. Existing serial saves, retries, adaptive/manual levels, early-display comparisons and Modal cleanup remain intact.
- Added tests for language priority/selection/failures, both-language game flows, point quotas, atomic/deduplicated saves, weekly summaries and migration of 0.2.0. Updated English-first README, CI archive version and release package.
- Native and visual acceptance remain blocked by the runtime sandbox before plugin/page load. No screenshots, native/mobile verification or publication is claimed.

## 0.2.0 — первая публичная бета, 2026-11-15

- Основной интерфейс перенесён в единственный компактный Modal поверх текущей заметки. Сохранены команда `open-games`, горячая клавиша и совместимый переход из восстановленной вкладки 0.1.x.
- Компактная главная, шесть карточек, прогресс внутри окна, результаты без дополнительного перехода, русские числовые формы.
- Новые локальные игры «Правило» и «Порядок» с проверкой однозначности, объяснениями и отдельной бинарной адаптацией. Смешанные сессии учитывают память и логику.
- Дневная цель 3/6/9 или выключена, по умолчанию 6. Неделя участия отделена от точности; местная дата фиксируется при завершении, агрегаты независимы от истории попыток.
- Необязательное напоминание раз в день внутри активного Obsidian, по умолчанию выключено; статический индикатор цели на значке.
- Явная миграция схем 1/2 в 3 без выдуманной истории регулярности и без автоматического перезаписывания повреждённых данных.
- Сохранены все исправления 0.1.1. Добавлены тесты логики, календаря, гонок записи и жизненного цикла Modal, CI и воспроизводимая упаковка ZIP.
- Нативная и визуальная приёмка заблокированы средой запуска. Публикация автоматически не выполнялась.

## 0.1.1 — 2026-11-15

- Исправлено недостижимое снижение сложности «Слов» на уровнях 6/7.
- Запуск сессии ожидает сохранения новой длительности.
- Результаты с ожидающей/неудачной записью переживают закрытие игрового интерфейса в памяти плагина; доступен повтор без дублей и повторной адаптации.
- «Запомнил» в трёх играх; фактическое время и отдельные условия сравнения досрочных показов.
- Выбор автоматического уровня перед блоком; миграция схемы 1 в 2.

## 0.1.0

- Первые четыре игры, короткие сессии и свободная игра, отдельная адаптация, локальные результаты и настройки, экран прогресса в ItemView.
