import { PHYS_WEAPON_STATS, PHYS_WEAPON_ROLE_TIERS, WEAPON_ROLE_LABELS } from './src/data/weapons';
import { ITEMS } from './src/data/items';
import { PSI_WEAPON_STATS, PSI_WEAPON_ROLE_TIERS } from './src/data/psi';
import * as fs from 'fs';

let md = `# Сводка по оружию и ПСИ-способностям\n\n`;

md += `> [!TIP]\n> Это сгенерированный список всех видов оружия и ПСИ-способностей в игре для балансировки и дизайна.\n\n`;

function generateTable(statsDict: Record<string, any>, roleTiers: Record<string, string>, title: string) {
  let table = `## ${title}\n\n`;
  table += `| Название (ID) | Тип | Роль | Урон | Скорость | ДПС | Дальность | Обойма | Описание |\n`;
  table += `|---|---|---|---|---|---|---|---|---|\n`;

  for (const [id, stats] of Object.entries(statsDict)) {
    if (id === '') continue; // unarmed
    
    const item = ITEMS[id];
    const name = item ? item.name : id;
    const desc = item ? item.desc : '';
    
    const type = stats.isRanged ? 'Дальний' : 'Ближний';
    const roleId = roleTiers[id];
    const role = roleId ? WEAPON_ROLE_LABELS[roleId] || roleId : '';
    
    const dmg = stats.dmg;
    const speed = stats.speed;
    const dps = speed > 0 ? (dmg / speed).toFixed(1) : dmg.toString();
    const range = stats.isRanged ? (stats.projSpeed ? `Снаряд (${stats.projSpeed})` : (stats.beamRange ? `Луч (${stats.beamRange})` : 'Дальний')) : (stats.range ? stats.range.toFixed(1) : '0');
    const mag = stats.isRanged ? (stats.magazineSize === Infinity ? '∞' : stats.magazineSize || 1) : '-';
    
    table += `| **${name}** <br/>\`${id}\` | ${type} | ${role} | ${dmg} | ${speed}с | ${dps} | ${range} | ${mag} | ${desc} |\n`;
  }
  return table;
}

md += generateTable(PHYS_WEAPON_STATS, PHYS_WEAPON_ROLE_TIERS, 'Физическое оружие');
md += `\n`;
md += generateTable(PSI_WEAPON_STATS, PSI_WEAPON_ROLE_TIERS, 'ПСИ-Способности (psi.ts)');

fs.writeFileSync('/Users/jirnyak/.gemini/antigravity-ide/brain/81ab5afd-c996-4958-ae5a-c042a23c5541/weapons_list.md', md);
const meta = {
  RequestFeedback: false,
  Summary: "Сгенерированный список всего оружия в игре для дизайнеров.",
  UserFacing: true
};
fs.writeFileSync('/Users/jirnyak/.gemini/antigravity-ide/brain/81ab5afd-c996-4958-ae5a-c042a23c5541/weapons_list.md.meta.json', JSON.stringify(meta));

console.log('Done!');
