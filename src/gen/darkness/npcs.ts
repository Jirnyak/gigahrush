/* ── Design z: Darkness — post-Void light-resource pocket ─── */

import {
  
  EntityType, 
  
  type Entity, type Room, type Item
  ,
} from '../../core/types';
import { World } from '../../core/world';
import { Spr } from '../../render/sprite_index';
import { registerRouteCue } from '../../systems/route_cues';


export const DARKNESS_PRESERVED_NAME_ID = 'tamara_belova' as const;

export function dropItem(
  entities: Entity[],
  nextId: { v: number },
  x: number,
  y: number,
  item: Item,
): void {
  entities.push({
    id: nextId.v++,
    type: EntityType.ITEM_DROP,
    x: x + 0.5,
    y: y + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: Spr.ITEM_DROP,
    inventory: [item],
  });
}

export function registerDarknessRouteCues(world: World, roomsByKey: Map<string, Room>): void {
  const toll = roomsByKey.get('toll');
  const tollGate = roomsByKey.get('toll_gate');
  const control = roomsByKey.get('control');
  const emergency = roomsByKey.get('emergency');
  const trace = roomsByKey.get('trace');
  if (toll && tollGate) {
    const markerX = toll.x + 2.5;
    const markerY = toll.y + 8.5;
    const targetX = tollGate.x + 6.5;
    const targetY = tollGate.y + 3.5;
    const markerCell = world.idx(Math.floor(markerX), Math.floor(markerY));
    registerRouteCue(world, {
      id: 'darkness_shadow_toll_shortcut',
      x: markerX,
      y: markerY,
      targetX,
      targetY,
      z: 200,
      roomId: toll.id,
      targetRoomId: tollGate.id,
      zoneId: world.zoneMap[markerCell],
      label: 'теневая пошлина',
      hint: 'короткий путь просит свет',
      targetName: 'шлюз теневой пошлины',
      color: '#88f',
      tags: ['darkness', 'shadow_toll', 'shortcut', 'light_budget'],
      toneSeed: toll.id * 2003 + tollGate.id,
      radius: 8,
      targetRadius: 3,
      cooldownSec: 42,
      heardText: 'Сборщик тени показывает короткий путь: заплатить светом, драться или идти обходом.',
      followedText: 'Шлюз пошлины найден. Быстро пройти можно, но свет больше не вернется.',
      ignoredText: 'Теневая пошлина осталась позади. Длинный обход сохранит свет, но съест время.',
    });
  }

  if (control && trace) {
    const markerX = control.x + 11.5;
    const markerY = control.y + 3.5;
    const targetX = trace.x + 6.5;
    const targetY = trace.y + 4.5;
    const markerCell = world.idx(Math.floor(markerX), Math.floor(markerY));
    registerRouteCue(world, {
      id: 'darkness_return_trace_warning',
      x: markerX,
      y: markerY,
      targetX,
      targetY,
      z: 200,
      roomId: control.id,
      targetRoomId: trace.id,
      zoneId: world.zoneMap[markerCell],
      label: 'возвратный след',
      hint: 'поздний факт выйдет наружу',
      targetName: 'комната возвратного следа',
      color: '#bbf',
      tags: ['darkness', 'return_trace', 'late_warning', 'living_hook'],
      toneSeed: control.id * 2011 + trace.id,
      radius: 8,
      targetRadius: 3,
      cooldownSec: 44,
      heardText: 'Пульт аварийного света предупреждает: возвратный след станет фактом для верхних этажей.',
      followedText: 'Комната следа найдена. Забрать кадр значит вынести темный отсек в другой маршрут.',
      ignoredText: 'Возвратный след остался в темноте. Верхние этажи пока не знают это имя.',
    });
  }

  if (emergency && trace) {
    const markerX = emergency.x + 10.5;
    const markerY = emergency.y + 4.5;
    const targetX = trace.x + trace.w + 1.5;
    const targetY = trace.y + (trace.h >> 1) + 0.5;
    const markerCell = world.idx(Math.floor(markerX), Math.floor(markerY));
    registerRouteCue(world, {
      id: 'darkness_exit_breath',
      x: markerX,
      y: markerY,
      targetX,
      targetY,
      z: 200,
      roomId: emergency.id,
      targetRoomId: trace.id,
      zoneId: world.zoneMap[markerCell],
      label: 'нижний выдох',
      hint: 'выход слышен за следом',
      targetName: 'нижний лифт Темного отсека',
      color: '#9af',
      tags: ['darkness', 'exit', 'sound', 'route_protocol', 'tool_cue'],
      toneSeed: emergency.id * 2027 + trace.id,
      radius: 7,
      targetRadius: 3,
      cooldownSec: 38,
      heardText: 'За аварийным карманом слышен нижний выдох лифта: идти по звуку, не по темной табличке.',
      followedText: 'Возвратный след и нижний лифт найдены. Дальше темнота уже не просит имени.',
      ignoredText: 'Нижний выдох стихает за спиной. В Темном отсеке остались только обходы и чужие шаги.',
    });
  }
}

