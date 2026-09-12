import { DEMOS_TRAIT_DEFS, type DemosTraitDef } from './demos_traits';

export interface NpcPerkDef {
  id: string;
  label: string;
  kind: 'demos_trait' | 'rpg' | 'social' | 'combat' | 'routine' | 'extension';
  tags: readonly string[];
  sourceTraitId?: string;
}

/* Перки выводятся из черт Демоса и другого источника не имеют. Хук
 * `registerNpcPerk` (валидация id, запрет дублей, обрезка метки) не звался
 * ни разу и снят: объявленный способ расширения, которым никто не
 * пользуется, — обещание, а не API. Понадобится второй род перка — он
 * придёт своим списком, как этот. */
const NPC_PERKS: readonly NpcPerkDef[] = DEMOS_TRAIT_DEFS.map((trait: DemosTraitDef) => ({
  id: trait.id,
  label: trait.label,
  kind: 'demos_trait',
  tags: trait.tags,
  sourceTraitId: trait.id,
}));

const NPC_PERKS_BY_ID = new Map<string, NpcPerkDef>(NPC_PERKS.map(def => [def.id, def]));
export function getNpcPerk(id: string): NpcPerkDef | undefined {
  return NPC_PERKS_BY_ID.get(id);
}

export function allNpcPerks(): readonly NpcPerkDef[] {
  return NPC_PERKS;
}

