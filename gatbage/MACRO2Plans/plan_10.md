# plan_10: коммунальная память комнат

## Суть

Комнаты и подъезды запоминают недавние поступки игрока через sparse room-state: украл, помог, сдал, устроил бой, пережил самосбор. Это меняет слухи, цены, доступ к тайникам и реакцию жильцов.

## Файлы

- `systems/events.ts`: источник фактов.
- Новый `systems/room_memory.ts`.
- `systems/rumor.ts`: локальные слухи.
- `systems/context.ts`: диалоговый context.
- `systems/factions.ts`: реакция faction/zone.
- `systems/containers.ts`: тайники/отказы/кража.
- `render/log_ui.ts` / HUD logs.

## Runtime model

Sparse state:

```ts
roomId -> {
  bits,
  severity,
  lastAt,
  ttl,
  actorFlags
}
```

Правила:

- заполнять только из public/local events;
- cap по числу комнат;
- decay на slow tick;
- не сканировать rooms каждый frame;
- save делать только после стабилизации shape.

## Gameplay decisions

- помогать жильцам;
- скрывать следы;
- подкупать;
- запугивать;
- чинить ущерб;
- уйти из района до слуха.

## Этапы

1. Добавить bounded sparse map и slow decay.
2. Подключить события: theft, rescue, combat, repair, samosbor shelter.
3. Rumor/context читают room memory.
4. Containers/NPC menu дают малые последствия: скидка, отказ, тайник, донос.
5. Добавить debug lines для room memory у текущей комнаты.

## Риски

- Непонятные последствия для игрока.
- Слишком много текстовых вариантов.
- Save shape лучше не фиксировать до стабилизации.

## Проверки

- Unit tests для decay/cap.
- `npm run check`.
- Manual: украсть в комнате, получить слух/реакцию, дождаться decay.
