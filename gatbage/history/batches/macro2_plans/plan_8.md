# plan_8: шумовой след

## Суть

Выстрелы, бег, взлом, сирены и тяжелые двери создают короткоживущий шумовой след. Игрок решает: идти тихо, отвлечь монстров, заманить патруль, заглушить радио или быстро прорываться.

## Файлы

- `systems/events.ts`: source facts или bounded noise records.
- Новый `systems/noise.ts`, если event ring недостаточен.
- `systems/ai/*`: AI читает ближайшие/последние записи с cooldown.
- `systems/factions.ts`: patrol response.
- `systems/inventory.ts`: counter items.
- `render/hud.ts`: короткий diegetic cue `Слышат`.

## Правила производительности

- Без global scan каждый frame.
- Noise records capped: cell, radius, ttl, source, severity.
- AI смотрит только recent/capped records и только на scan cadence.

## Gameplay decisions

- выстрелить и вызвать помощь/опасность;
- бросить шумовую банку;
- включить глушилку;
- закрыть дверь тихо;
- провалить hack и привлечь Safeguard.

## Этапы

1. Добавить bounded noise record model.
2. Привязать источники: weapon fire, hack fail, heavy doors, siren, explosions.
3. AI/factions читают records на cooldown.
4. Добавить 2-3 counter items.
5. HUD/log показывают только важные локальные cues.

## Риски

- Постоянный aggro может раздражать.
- Radius checks могут стать дорогими.
- Не делать stealth meter; игра должна оставаться horror/sim, а не stealth UI.

## Проверки

- Unit tests для ttl/cap.
- `npm run check`.
- Manual: выстрел зовет врагов, глушилка снижает реакцию, FPS не проседает.
