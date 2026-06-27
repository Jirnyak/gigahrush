import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/data/weapons.ts', 'utf8');

const magSizes = {
  makarov: 8,
  makarov_precise: 8,
  makarov_silenced: 8,
  ak47: 30,
  spas12: 8,
  saiga: 10,
  p90: 50,
  m16: 30,
  fn_fal: 20,
  revolver: 6,
  mp5: 30,
  gravity_beam_emitter: Infinity,
  grn420_gravizhernov: 1,
  flamethrower: Infinity,
  tt_pistol: 8,
  nagant: 7,
  homemade_pistol: 1,
  toz_shotgun: 2,
  harpoon_gun: 1,
  karkarov_pistol: 8,
  zatychkin_pistol: 8,
  slyoznev_pps41: 71,
  eralashnikov_auto: 30,
  nosin_rifle: 5,
  moskvin_rifle: 5,
  losyash_rifle: 1,
  ptrs_liquidator: 5,
  tanev_svt40: 10,
  ato41_atomic_flamer: Infinity,
  chizh3_shotgun: 2,
  conscripts_doublebarrel: 2,
  rb91_auto_shotgun: 10,
  chest_failsafe_charge: Infinity,
  granit4u_belt_shotgun: 20,
  pushkin_shotgun: 6,
  rpl23_lmg: 100,
  p41_heavy_mg: 100,
  roks47_flamethrower: Infinity,
  agnia_a130: Infinity,
  o15_multijet_flamer: Infinity,
  shmk_disposable: Infinity,
  foam_grenade_6p10: Infinity,
  brt2_foam_projector: 1,
  pbrog1_foam_launcher: 6,
  breach_charge: Infinity,
  concrete_breaker_grenade: Infinity,
  pistol_grenade_launcher: 1,
  party_might_launcher: 4,
  g41_grenade_launcher: 6,
};

let replaced = 0;
content = content.replace(/^(\s+)([a-zA-Z0-9_]+):\s*\{\s*dmg:([^}]+isRanged: true[^}]+)\},/gm, (match, indent, id, rest) => {
  const mag = magSizes[id];
  if (mag !== undefined) {
    replaced++;
    return `${indent}${id}: { magazineSize: ${mag}, dmg:${rest}},`;
  }
  return match;
});

console.log('Replaced', replaced);
writeFileSync('src/data/weapons.ts', content);
