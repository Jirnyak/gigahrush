/* Дочерний процесс замка `rng-cross-process-determinism.test.ts`.
 *
 * Не тест: раннер модульных тестов берёт только `tests/*.test.ts`, и этот файл
 * ему не виден. Печатает состояние глобального ГСЧ ПОСЛЕ полной сборки
 * контента — то есть после всей случайности, которую модули тратят на импорте.
 * Два таких процесса обязаны напечатать одно и то же. */
import '../src/content';
import { rng } from '../src/core/rand';

const values: string[] = [];
for (let i = 0; i < 4; i++) values.push(rng().toFixed(12));
console.log(`BOOT ${values.join(',')}`);
