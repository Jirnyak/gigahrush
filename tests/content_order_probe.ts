/* Пробник для tests/content-registration-order.test.ts.
 *
 * Имя намеренно не оканчивается на .test.ts: scripts/run-unit-tests.mjs
 * подбирает только *.test.ts, поэтому пробник не попадёт в набор сам по себе.
 *
 * Запускается отдельным процессом с аргументом-вариантом: вариант решает,
 * какой модуль загрузится ПЕРВЫМ. Смысл в том, что реестр обязан получиться
 * одинаковым при любом порядке — раньше это было не так.
 *
 * Вывод — одна строка JSON в stdout.
 */

async function main(): Promise<void> {
  const variant = process.argv[2] ?? 'content';

  if (variant === 'samosbor') await import('../src/systems/samosbor');
  else if (variant === 'design') await import('../src/gen/design_floors/manifest');
  else if (variant === 'alife') await import('../src/systems/alife');
  else if (variant === 'quests') await import('../src/systems/quests');

  // Вариант bare проверяет обратное: без контента слоты личностей всё равно
  // на месте, потому что они заморожены, а не выданы счётчиком регистраций.
  if (variant !== 'bare') await import('../src/content');

  const {
    allNpcPackages,
    getPlotNpcCount,
    getPlotNpcNumericId,
    getPlotNpcStringId,
  } = await import('../src/data/npc_packages');

  const count = getPlotNpcCount();
  const slots: (string | null)[] = [];
  for (let id = 1; id <= count; id++) slots.push(getPlotNpcStringId(id) ?? null);

  process.stdout.write(JSON.stringify({
    variant,
    count,
    slots,
    packages: allNpcPackages().map(pack => pack.id).sort(),
    olga: getPlotNpcNumericId('olga') ?? null,
    voidClerk: getPlotNpcNumericId('floor20_void_protocol_clerk') ?? null,
    market88: getPlotNpcNumericId('market88_marta_broker') ?? null,
  }));
}

await main();
