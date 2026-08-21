/* ── Точка сборки отладочного меню ────────────────────────────
 *
 * Команда попадает в меню побочным эффектом импорта своего модуля: система
 * зовёт `registerDebugCommand` рядом со своим кодом. В игре это работает само —
 * `main.ts` тянет все системы. Но частичный граф (тест, который импортировал
 * один `systems/debug`) увидел бы половину меню и другие номера команд, а по
 * номеру ходят и меню, и smoke.
 *
 * Поэтому здесь перечислены модули, которые что-то регистрируют. Кому нужно
 * ПОЛНОЕ меню — импортирует этот файл, ровно как `src/content.ts` для контента.
 * Ни одного символа отсюда не экспортируется: это список, а не API.
 *
 * Добавили `registerDebugCommand` в новую систему — допишите её сюда строкой.
 * Забыли — команда просто не появится в тестах; в игре она будет.
 */

import './balance';
import './chalk';
import './containers';
import './contracts';
import './debug_cheats';
import './economy';
import './events';
import './faction_events';
import './floor_instances';
import './hermodoor_borer';
import './map_editor';
import './map_exploration';
import './maronary_shaving';
import './net_terminal_gen';
import './procedural_anomalies/bad_apple_world';
import './production';
import './pseudolift';
import './psi';
import './route_cues';
import './rpg';
import './samosbor_director';
import './samosbor_variants_runtime';
import './samosbor_wave';
import './void_protocols';
import './wrong_door';
