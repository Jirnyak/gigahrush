import assert from 'node:assert/strict';

import '../src/content';
import { DESIGN_FLOOR_ROUTES } from '../src/data/design_floors';
import { floorKeyForDesign } from '../src/data/floor_keys';
import { allNpcPackages, getNpcPackage } from '../src/data/npc_packages';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import { testGenerationMatrix } from './generator_helpers';

/* Дом пакета NPC — это ключ бакета в плане населения A-Life
 * (`alife_population_plan`): по нему личность резервируется и по нему же
 * проверяется, пускает ли этаж людей. Если пакет объявляет один этаж, а
 * генератор ставит человека на другой, треть сюжетного пула резервируется не
 * там, где живёт, а Демос показывает неверное место. Молчаливый источник такого
 * расхождения — регистрация без этажа: `registerSideQuest` без `homeFloorKey`
 * уводит пакет в дефолт `design:living`. Отсюда проверка на всех дизайн-этажах,
 * а не на одном. */
testGenerationMatrix('дом пакета NPC — единственное условие: кто объявил этаж, тот на нём и стоит', () => {
  const SEED = 61061;
  const wrong: string[] = [];
  const missing: string[] = [];
  for (const route of DESIGN_FLOOR_ROUTES) {
    const floorKey = floorKeyForDesign(route.id);
    const gen = generateDesignFloor(route.id, SEED) as { entities?: readonly unknown[] };
    const present = new Set<string>();
    for (const entity of gen.entities ?? []) {
      const packageId = (entity as { npcPackageId?: string }).npcPackageId;
      if (!packageId) continue;
      present.add(packageId);
      const declared = getNpcPackage(packageId)?.placement.homeFloorKey;
      if (declared !== floorKey) wrong.push(`${packageId}: объявлен ${declared ?? '(нет)'}, появился на ${floorKey}`);
    }
    // Обратная сторона того же правила: объявил дом — значит появился. Единая
    // доставка (`deliverFloorNpcPackages`) добирает тех, кого модуль не поставил,
    // поэтому пустой список здесь означает «забытых людей нет».
    for (const pack of allNpcPackages()) {
      if (pack.placement.homeFloorKey !== floorKey) continue;
      if (pack.placement.presence === 'event_only') continue;
      if (!present.has(pack.id)) missing.push(`${pack.id}: объявил ${floorKey}, но в мире его нет`);
    }
  }
  assert.deepEqual(wrong, [], `пакетов с чужим домашним этажом: ${wrong.length}\n${wrong.slice(0, 20).join('\n')}`);
  assert.deepEqual(missing, [], `объявили этаж, но не появились: ${missing.length}\n${missing.slice(0, 20).join('\n')}`);
});
