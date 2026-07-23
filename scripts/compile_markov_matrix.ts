/* ── Offline Markov Matrix & Skeleton Compiler ────────────────── */
/* Generates src/data/markov_compiled_matrix.ts at build-time.       */
/* Zero runtime filesystem (node:fs) or text parsing in browser.     */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEMS } from '../src/data/items';
import { ItemType, Faction, RoomType, MonsterKind, Occupation } from '../src/core/types';
import { ROOM_DEFS } from '../src/data/rooms';
import { MONSTERS } from '../src/entities/monster';
import { OCCUPATION_PROFILES } from '../src/data/occupation_profiles';
import { DOCUMENT_ACCESS_ITEMS } from '../src/data/documents_access';
import { PERMIT_DEFS } from '../src/data/permits';
import { FLOOR_ANOMALIES } from '../src/data/procedural_floors';
import { DESIGN_FLOOR_ROUTES } from '../src/data/design_floors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Alien franchise words strictly banned from the compiled browser matrix
const ALIEN_FRANCHISE_BLACKLIST = new Set([
  'чаэс', 'припять', 'чернобыль', 'сидорович', 'контролер', 'контролёр',
  'снорк', 'меченый', 'стрелок', 'вднх', 'полис', 'ганза', 'орден',
  'монолит', 'долг', 'свобода', 'артем', 'артём', 'родрик', 'шухарт',
  'сталкер', 'сталкеры', 'кордон', 'радар', 'саркофаг', 'янтарь',
  'снаут', 'перец', 'хартмонт'
]);


function isSanitizedWord(word: string): boolean {
  const lower = word.toLocaleLowerCase('ru-RU');
  for (const alien of ALIEN_FRANCHISE_BLACKLIST) {
    const re = new RegExp(`(?:^|\\s|[,;.!?«»"'])${alien}(?:$|\\s|[,;.!?«»"'])`, 'i');
    if (re.test(lower)) return false;
  }
  return true;
}

interface CategoryItem {
  text: string;
  weight: number;
  tags: string[];
}

function buildItemCategories(): Record<string, CategoryItem[]> {
  const categories: Record<string, CategoryItem[]> = {
    ITEM: [],
    WEAPON: [],
    FOOD: [],
    MEDICINE: [],
    INSTRUMENT: [],
    DOCUMENT: [],
    RESOURCE: []
  };
  
  for (const def of Object.values(ITEMS)) {
    if (!isSanitizedWord(def.name)) continue;
    
    const weight = Math.max(10, def.value || 10);
    const tags = def.tags ? [...def.tags] : [];
    
    const catItem: CategoryItem = {
      text: def.name.toLowerCase(),
      weight,
      tags
    };
    
    categories.ITEM.push(catItem);
    
    switch (def.type) {
      case ItemType.WEAPON:
      case ItemType.AMMO:
        categories.WEAPON.push(catItem);
        break;
      case ItemType.FOOD:
      case ItemType.DRINK:
        categories.FOOD.push(catItem);
        break;
      case ItemType.MEDICINE:
        categories.MEDICINE.push(catItem);
        break;
      case ItemType.TOOL:
        categories.INSTRUMENT.push(catItem);
        break;
      case ItemType.NOTE:
        categories.DOCUMENT.push(catItem);
        break;
      case ItemType.MISC:
        if (catItem.tags.includes('resource') || catItem.tags.includes('currency') || catItem.tags.includes('valuable')) {
          categories.RESOURCE.push(catItem);
        }
        break;
    }
  }
  
  return categories;
}

function buildFactionCategories(): CategoryItem[] {
  const mapping: Partial<Record<Faction, { text: string; extraTags: string[] }>> = {
    [Faction.CITIZEN]: { text: 'гражданские', extraTags: ['citizen'] },
    [Faction.LIQUIDATOR]: { text: 'ликвидаторы', extraTags: ['liquidator', 'combat'] },
    [Faction.CULTIST]: { text: 'культисты', extraTags: ['cult', 'mystic'] },
    [Faction.WILD]: { text: 'дикие', extraTags: ['wild'] },
    [Faction.SCIENTIST]: { text: 'учёные', extraTags: ['science', 'bureaucracy'] },
  };

  const items: CategoryItem[] = [];
  for (const f of [Faction.CITIZEN, Faction.LIQUIDATOR, Faction.CULTIST, Faction.WILD, Faction.SCIENTIST]) {
    const meta = mapping[f]!;
    items.push({
      text: meta.text,
      weight: 50,
      tags: ['faction', `faction_id_${f}`, ...meta.extraTags]
    });
  }
  return items;
}

function buildThreatCategories(): CategoryItem[] {
  const items: CategoryItem[] = [];
  for (const key of Object.keys(MONSTERS)) {
    const def = MONSTERS[Number(key) as MonsterKind];
    if (def && def.name) {
      items.push({ text: def.name.toLowerCase(), weight: 50, tags: ['danger', 'monster'] });
    }
  }
  items.push({ text: 'самосбор', weight: 100, tags: ['samosbor', 'danger'] });
  items.push({ text: 'аномалия', weight: 50, tags: ['mystic', 'danger'] });
  return items;
}

function buildPlaceCategories(): CategoryItem[] {
  const items: CategoryItem[] = [];
  for (const key of Object.keys(ROOM_DEFS)) {
    const def = ROOM_DEFS[Number(key) as RoomType];
    if (def && def.name) {
      items.push({ text: def.name.toLowerCase(), weight: 20, tags: ['room'] });
    }
  }
  items.push({ text: 'гермодверь', weight: 10, tags: ['door', 'safe'] });
  items.push({ text: 'вентиляционная шахта', weight: 45, tags: ['danger', 'repair'] });
  return items;
}

function buildSubjCategories(): CategoryItem[] {
  const items: CategoryItem[] = [];
  for (const prof of Object.values(OCCUPATION_PROFILES)) {
    items.push({ text: prof.demosLabel.toLowerCase(), weight: prof.defaultGenerationWeight * 5, tags: ['person', ...prof.routineTags || []] });
  }
  return items;
}

function buildOrganizationCategories(): CategoryItem[] {
  const items: CategoryItem[] = [];
  const added = new Set<string>();
  
  const add = (text: string, tags: string[]) => {
    const txt = text.toLowerCase();
    if (!added.has(txt)) {
      items.push({ text: txt, weight: 60, tags });
      added.add(txt);
    }
  };

  add('Служба ликвидации', ['guard', 'combat', 'liquidator']);
  add('Гражданская оборона', ['guard', 'combat', 'security']);
  add('Районсовет', ['bureaucracy']);
  add('Комендатура', ['guard', 'bureaucracy']);
  add('НИИ "Щит"', ['science', 'bureaucracy']);
  add('Служба герметизации', ['door', 'repair']);

  return items;
}

function buildDocumentCategories(): CategoryItem[] {
  const items: CategoryItem[] = [];
  for (const def of Object.values(DOCUMENT_ACCESS_ITEMS)) {
    if (def.type === ItemType.MISC || def.type === ItemType.NOTE) {
      items.push({ text: def.name.toLowerCase(), weight: def.value || 30, tags: ['document'] });
    }
  }
  for (const def of PERMIT_DEFS) {
    items.push({ text: def.title.toLowerCase(), weight: 60, tags: ['document', 'permit'] });
  }
  return items;
}

function buildAnomalyCategories(): CategoryItem[] {
  const items: CategoryItem[] = [];
  for (const def of FLOOR_ANOMALIES) {
    if (def.id !== 'none') {
      items.push({ text: def.title.toLowerCase(), weight: def.weight * 5, tags: ['danger', 'anomaly', ...def.tags] });
    }
  }
  return items;
}

function buildZoneCategories(): CategoryItem[] {
  const items: CategoryItem[] = [];
  for (const route of DESIGN_FLOOR_ROUTES) {
    items.push({ text: route.displayName.toLowerCase(), weight: 30, tags: ['zone', ...(route.themeTags || [])] });
  }
  return items;
}

// Canonical Gigahrush & Samosbor dictionary categories with PCA-like weights
const CANONICAL_CATEGORIES: Record<string, CategoryItem[]> = {
  ...buildItemCategories(),
  FACTION_NAME: buildFactionCategories(),
  THREAT: buildThreatCategories(),
  PLACE: buildPlaceCategories(),
  SUBJ: buildSubjCategories(),
  FACTION: buildOrganizationCategories(),
  DOCUMENT: buildDocumentCategories(),
  ANOMALY: buildAnomalyCategories(),
  ZONE_TYPE: buildZoneCategories(),
  ACTION: [
    { text: 'смазывали поворотные механизмы', weight: 30, tags: ['repair', 'door'] },
    { text: 'задраили шлюз', weight: 70, tags: ['guard', 'door', 'samosbor'] },
    { text: 'сдали карточки', weight: 40, tags: ['bureaucracy', 'survival'] },
    { text: 'записали показания манометра', weight: 20, tags: ['repair', 'science'] },
    { text: 'проверили герметик', weight: 50, tags: ['repair', 'door'] },
    { text: 'опечатали сектор', weight: 85, tags: ['guard', 'danger'] },
    { text: 'оставили заметку на стене', weight: 15, tags: ['document', 'lore'] }
  ],
  STATE_FACT: [
    { text: 'дверь набухла снизу', weight: 60, tags: ['door', 'water'] },
    { text: 'этаж сегодня врёт номером', weight: 40, tags: ['lift', 'route', 'danger'] },
    { text: 'кухня стала за шкафом', weight: 50, tags: ['room', 'food'] },
    { text: 'дверь слушает громче людей', weight: 60, tags: ['room', 'danger'] },
    { text: 'завтра говорит кладовщик', weight: 50, tags: ['trade', 'production'] },
    { text: 'стены сырые', weight: 45, tags: ['water', 'room'] },
    { text: 'воздух плохой', weight: 55, tags: ['air', 'danger'] },
    { text: 'руки держи на виду', weight: 60, tags: ['relation', 'theft'] },
    { text: 'цену назовут мягче', weight: 50, tags: ['trade', 'help'] },
    { text: 'список укрытых опять не сошёлся', weight: 70, tags: ['shelter', 'event'] },
    { text: 'цены не стоят', weight: 60, tags: ['trade', 'shortage'] },
    { text: 'дверь держится лучше', weight: 40, tags: ['repair', 'door'] },
    { text: 'сначала считают своих', weight: 70, tags: ['faction', 'order'] },
    { text: 'держат сектор, пока есть патроны', weight: 70, tags: ['faction', 'danger', 'combat'] },
    { text: 'имя запоминают', weight: 55, tags: ['relation', 'help'] },
    { text: 'свидетель уже у двери', weight: 60, tags: ['relation', 'theft'] }
  ],
  NEED: [
    { text: 'Воды мало', weight: 90, tags: ['need', 'water'] },
    { text: 'Хлеб кончается', weight: 80, tags: ['need', 'food'] },
    { text: 'Кровь пошла сильнее', weight: 70, tags: ['need', 'wound', 'medical'] },
    { text: 'горло пересохло', weight: 85, tags: ['need', 'water'] },
    { text: 'ноги тяжелеют', weight: 50, tags: ['need', 'wound'] },
    { text: 'в глазах рябит', weight: 60, tags: ['need', 'wound', 'danger'] }
  ],
  ACTION_VERB: [
    { text: 'перехватил лом', weight: 40, tags: ['combat', 'action'] },
    { text: 'шагнул в темноту', weight: 50, tags: ['danger', 'action'] },
    { text: 'замер у гермы', weight: 60, tags: ['door', 'danger'] },
    { text: 'выругался', weight: 30, tags: ['neutral', 'emotion'] },
    { text: 'проверил дозиметр', weight: 70, tags: ['science', 'survival'] },
    { text: 'закашлялся', weight: 45, tags: ['wound', 'danger'] },
    { text: 'перезарядил', weight: 80, tags: ['combat'] },
    { text: 'схватился за голову', weight: 65, tags: ['fear', 'panic'] }
  ],
  EMOTION: [
    { text: 'глухой страх', weight: 80, tags: ['fear', 'danger'] },
    { text: 'холодная паника', weight: 90, tags: ['panic', 'danger'] },
    { text: 'нервная дрожь', weight: 60, tags: ['fear'] },
    { text: 'бетонная тоска', weight: 50, tags: ['sadness', 'survival'] },
    { text: 'вспышка ярости', weight: 70, tags: ['anger', 'combat'] },
    { text: 'тяжелое облегчение', weight: 40, tags: ['relief', 'safe'] }
  ],
  SEVERITY: [
    { text: 'это уже срочно', weight: 70, tags: ['urgent'] },
    { text: 'терпит недолго', weight: 50, tags: ['low'] },
    { text: 'паника ближе драки', weight: 40, tags: ['panic', 'danger'] },
    { text: 'хуже не бывает', weight: 80, tags: ['urgent', 'danger'] },
    { text: 'пока держится', weight: 30, tags: ['low'] }
  ],
  TRADE_RULE: [
    { text: 'плати водой или маршрутом', weight: 70, tags: ['trade', 'water'] },
    { text: 'торгуйся при свидетеле', weight: 50, tags: ['trade', 'queue'] },
    { text: 'платить будут претензиями', weight: 40, tags: ['contract'] },
    { text: 'без свидетелей не берут', weight: 60, tags: ['trade', 'theft'] },
    { text: 'цена по карточке и ни литра сверху', weight: 55, tags: ['trade', 'water', 'bureaucracy'] }
  ],
  BAN: [
    { text: 'не шагай первым', weight: 50, tags: ['danger'] },
    { text: 'не открывай на знакомый голос', weight: 80, tags: ['door', 'samosbor', 'danger'] },
    { text: 'не показывай пайку очереди', weight: 50, tags: ['food', 'queue'] },
    { text: 'не выноси молча', weight: 70, tags: ['theft'] },
    { text: 'не спорь у чужой гермы', weight: 50, tags: ['faction', 'shelter'] },
    { text: 'не верь голосу за стеной', weight: 60, tags: ['danger', 'samosbor'] },
    { text: 'не лезь без фонаря', weight: 40, tags: ['danger', 'survival'] }
  ],
  NPC_NAME: [
    { text: 'один знакомый', weight: 50, tags: ['neutral'] },
    { text: 'тот парень', weight: 50, tags: ['neutral'] }
  ],
  TERMINAL: [
    { text: 'верят на одну карту больше', weight: 40, tags: ['relation'] },
    { text: 'и точка', weight: 20, tags: [] },
    { text: 'так и живём', weight: 30, tags: ['survival'] },
    { text: 'без вариантов', weight: 35, tags: ['danger'] },
    { text: 'пока не забыли', weight: 25, tags: ['relation', 'event'] }
  ]
};

// Mined syntax skeletons grouped by intent
interface SyntaxSkeleton {
  id: string;
  pattern: string[]; // e.g. ['SUBJ', 'ACTION', 'PLACE']
  intent: string;    // e.g. 'talk_context', 'document_flavor', 'lore_note', 'bark_ambient'
  weight: number;
}

const CANONICAL_SKELETONS: SyntaxSkeleton[] = [
  // talk_context
  { id: 'sk.talk.1', pattern: ['SUBJ', 'ACTION', 'PLACE'], intent: 'talk_context', weight: 10 },
  { id: 'sk.talk.2', pattern: ['PLACE', 'THREAT'], intent: 'talk_context', weight: 12 },
  { id: 'sk.talk.3', pattern: ['SUBJ', 'THREAT'], intent: 'talk_context', weight: 15 },
  { id: 'sk.talk.4', pattern: ['PLACE', 'ITEM'], intent: 'talk_context', weight: 14 },
  { id: 'sk.talk.5', pattern: ['FACTION', 'ACTION', 'PLACE'], intent: 'talk_context', weight: 11 },
  { id: 'sk.talk.6', pattern: ['SUBJ', 'ZONE_TYPE', 'ANOMALY'], intent: 'talk_context', weight: 13 },
  { id: 'sk.talk.7', pattern: ['RESOURCE', 'TRADE_RULE'], intent: 'talk_context', weight: 12 },
  // talk_ambient
  { id: 'sk.ambient.1', pattern: ['SUBJ', 'ACTION'], intent: 'talk_ambient', weight: 10 },
  { id: 'sk.ambient.2', pattern: ['PLACE', 'THREAT'], intent: 'talk_ambient', weight: 8 },
  { id: 'sk.ambient.3', pattern: ['SUBJ', 'ITEM'], intent: 'talk_ambient', weight: 10 },
  { id: 'sk.ambient.4', pattern: ['ZONE_TYPE', 'ANOMALY'], intent: 'talk_ambient', weight: 9 },
  // bark_ambient
  { id: 'sk.bark.1', pattern: ['THREAT', 'SUBJ'], intent: 'bark_ambient', weight: 10 },
  { id: 'sk.bark.2', pattern: ['PLACE', 'THREAT'], intent: 'bark_ambient', weight: 12 },
  { id: 'sk.bark.3', pattern: ['SUBJ', 'INSTRUMENT'], intent: 'bark_ambient', weight: 8 },
  { id: 'sk.bark.4', pattern: ['DOCUMENT', 'FACTION'], intent: 'bark_ambient', weight: 11 },
  // procedural_quest
  { id: 'sk.quest.1', pattern: ['PLACE', 'THREAT', 'ITEM'], intent: 'procedural_quest', weight: 15 },
  { id: 'sk.quest.2', pattern: ['FACTION', 'THREAT', 'PLACE'], intent: 'procedural_quest', weight: 12 },
  { id: 'sk.quest.3', pattern: ['SUBJ', 'DOCUMENT', 'ZONE_TYPE'], intent: 'procedural_quest', weight: 13 },
  { id: 'sk.quest.4', pattern: ['RESOURCE', 'PLACE'], intent: 'procedural_quest', weight: 11 },
  // document_flavor (записки, дневники, документы)
  { id: 'sk.doc.1', pattern: ['SUBJ', 'ACTION', 'PLACE'], intent: 'document_flavor', weight: 14 },
  { id: 'sk.doc.2', pattern: ['PLACE', 'THREAT', 'ACTION'], intent: 'document_flavor', weight: 16 },
  { id: 'sk.doc.3', pattern: ['FACTION', 'THREAT'], intent: 'document_flavor', weight: 12 },
  { id: 'sk.doc.4', pattern: ['SUBJ', 'ITEM', 'PLACE'], intent: 'document_flavor', weight: 13 },
  { id: 'sk.doc.5', pattern: ['ZONE_TYPE', 'ANOMALY'], intent: 'document_flavor', weight: 15 },
  // lore_note
  { id: 'sk.lore.1', pattern: ['PLACE', 'THREAT', 'SUBJ'], intent: 'lore_note', weight: 15 },
  { id: 'sk.lore.2', pattern: ['FACTION', 'PLACE', 'ACTION'], intent: 'lore_note', weight: 14 },
  { id: 'sk.lore.3', pattern: ['ANOMALY', 'ZONE_TYPE', 'THREAT'], intent: 'lore_note', weight: 16 },
  // rumor_flavor
  { id: 'sk.rumor.1', pattern: ['PLACE', 'THREAT'], intent: 'rumor_flavor', weight: 15 },
  { id: 'sk.rumor.2', pattern: ['THREAT', 'PLACE'], intent: 'rumor_flavor', weight: 12 },
  { id: 'sk.rumor.3', pattern: ['ZONE_TYPE', 'ANOMALY'], intent: 'rumor_flavor', weight: 14 },
  { id: 'sk.rumor.4', pattern: ['SUBJ', 'DOCUMENT', 'FACTION'], intent: 'rumor_flavor', weight: 13 }
];


const START_TOKEN = "<s>";
const END_TOKEN = "</s>";

interface TransitionInfo {
  count: number;
  tags: Record<string, number>;
}

type MarkovGraph = Map<string, Map<string, TransitionInfo>>;

class MarkovModel {
  public graph: MarkovGraph = new Map();
  private order: number;
  public patternDistances: Map<string, Map<string, number>> = new Map();

  constructor(order: number = 2) {
    this.order = order;
  }

  private tokenize(text: string): string[] {
    const cleaned = text.trim();
    // Split keeping punctuation as separate tokens, and tags as single tokens
    const matches = cleaned.match(/(?:<[^>]+>)|(?:[a-zа-яё\-]+)|(?:[.,!?])/gi);
    if (!matches) return [];
    return matches.map(w => {
      if (w.startsWith('<') && w.includes('>')) return w;
      if (/^[.,!?]$/.test(w)) return w;
      return w;
    }).filter(w => w.length > 0);
  }

  public train(corpus: { text: string; tags: string[] }[]) {
    for (const item of corpus) {
      const tokens = this.tokenize(item.text);
      if (tokens.length < 3) continue;
      const sequence = Array(this.order).fill(START_TOKEN).concat(tokens).concat([END_TOKEN]);

      for (let i = 0; i < sequence.length - this.order; i++) {
        const nextToken = sequence[i + this.order];

        for (let o = 1; o <= this.order; o++) {
          const history = sequence.slice(i + this.order - o, i + this.order).join(' ');

          if (!this.graph.has(history)) {
            this.graph.set(history, new Map());
          }

          const transitions = this.graph.get(history)!;
          if (!transitions.has(nextToken)) {
            transitions.set(nextToken, { count: 0, tags: {} });
          }

          const transInfo = transitions.get(nextToken)!;
          transInfo.count += 1;
          
          for (const tag of item.tags) {
            transInfo.tags[tag] = (transInfo.tags[tag] || 0) + 1;
          }
        }
      }
    }
  }

  public buildHeuristics(targets: string[]) {
    const reverseGraph = new Map<string, Set<string>>();
    
    for (const [history, transitions] of this.graph.entries()) {
      for (const nextWord of transitions.keys()) {
        const nextHistory = history.split(' ').slice(1).concat(nextWord).join(' ');
        if (!reverseGraph.has(nextHistory)) reverseGraph.set(nextHistory, new Set());
        reverseGraph.get(nextHistory)!.add(history);
      }
    }

    for (const target of targets) {
      const distMap = new Map<string, number>();
      this.patternDistances.set(target, distMap);

      const queue: { hist: string, d: number }[] = [];
      
      for (const hist of this.graph.keys()) {
        if (hist.endsWith(target)) {
          distMap.set(hist, 0);
          queue.push({ hist, d: 0 });
        }
      }

      let head = 0;
      while (head < queue.length) {
        const current = queue[head++];
        if (current.d >= 15) continue;

        const incomings = reverseGraph.get(current.hist);
        if (incomings) {
          for (const inc of incomings) {
            if (!distMap.has(inc)) {
              distMap.set(inc, current.d + 1);
              queue.push({ hist: inc, d: current.d + 1 });
            }
          }
        }
      }
    }
  }
}


const RAW_CORPUS: { text: string; tags: string[] }[] = [];
try {
  const corpusDir = path.join(process.cwd(), 'src/data/training_corpus');
  if (fs.existsSync(corpusDir)) {
    const files = fs.readdirSync(corpusDir).filter(f => f.endsWith('.txt') || f.endsWith('.jsonl'));
    console.log(`[System] Loading corpus (${files.length} files: ${files.join(', ')})...`);
    let added = 0;
    
    const categoryMap: Array<[RegExp, string]> = [
      [/(Рэдрик[а-я]*|Шухарт[а-я]*|Ричард[а-я]*|Нунан[а-я]*|Артем[а-я]*|Меченый|Стрелок[а-я]*|Сидорович[а-я]*|Бармен[а-я]*|Мельник[а-я]*|Хантер[а-я]*|Бурбон[а-я]*|Сухой|Андрей[а-я]*|Воронин[а-я]*|ликвидатор[а-я]*|слесарь[а-я]*|патрульны[йеам]*|бригадир[а-я]*|мясник[а-я]*|проходчик[а-я]*|экспедитор[а-я]*|инженер[а-я]*|мусорщик[а-я]*|гражданин[а-я]*|сталкер[а-я]*|ходок[а-я]*|анон[а-я]*)/gi, '<SUBJ>'],
      [/(ЧАЭС|Чернобыль[а-я]*|Кордон[а-я]*|Свалк[аиуе]|Агропром[а-я]*|Темная Долина|Армейские Склады|Рыжий Лес|Радар[а-я]*|Припять[а-я]*|Затон[а-я]*|Юпитер[а-я]*|Выжигатель[а-я]*|ВДНХ|Полис[а-я]*|Алексеевск[а-я]*|Рижск[а-я]*|Смоленск[а-я]*|Арбатск[а-я]*|Красная Линия|Зон[ауеы]|зоной|зоне|институт[а-я]*|бункер[а-я]*|гермодвер[ьяием]*|герма[аммиуе]*|гермозатвор[а-я]*|цех[а-я]*|сектор[а-я]*|этаж[а-я]*|тупик[а-я]*|Клеть|Здания-Стен[аыеу]|Город[а-я]*)/gi, '<PLACE>'],
      [/(снорк[а-я]*|контролер[а-я]*|полтергейст[а-я]*|бюрер[а-я]*|слепые псы|слепой пес|псевдогигант[а-я]*|кровосос[а-я]*|кикимор[а-я]*|Чёрны[хеим]*|Самосбор[а-я]*|радиаци[яиюей]*|аномали[яиюей]*|слизь|бетонник[а-я]*|выброс[а-я]*|пси-излучени[яе]*|удушь[яе]*|голод[а-я]*)/gi, '<THREAT>'],
      [/(хабар[а-я]*|деньг[иами]*|пустышк[аиуей]*|фильтр[а-я]*|тушенк[аиуей]*|бинт[а-я]*|гаусс-пушк[аиуей]*|гаусс[а-я]*|дозиметр[а-я]*|патрон[а-я]*|артефакт[а-я]*|медуз[аыуей]*|ломоть мяса|мамина бусы|контейнер[а-я]*)/gi, '<ITEM>'],
      [/(Долг[а-я]*|Свобод[аыеу]|Монолит[а-я]*|Чистое Небо|Наемники|Ганз[аыеу]|Орден[а-я]*|Спарта)/gi, '<FACTION>'],
      [/(схватил[а-я]*|побежал[а-я]*|ударил[а-я]*|закричал[а-я]*|упал[а-я]*|убил[а-я]*|стрелял[а-я]*|открыл[а-я]*|закрыл[а-я]*|спрятал[а-я]*|нашел|нашёл|увидел[а-я]*|услышал[а-я]*|вспомнил[а-я]*|забыл[а-я]*|подумал[а-я]*|решил[а-я]*|спросил[а-я]*|ответил[а-я]*|сказал[а-я]*|прошептал[а-я]*|пробормотал[а-я]*|бросил[а-я]*|поднял[а-я]*)/gi, '<ACTION_VERB>'],
      [/(страх[ауеом]*|ужас[ауеом]*|паник[аиуей]*|отчаяни[яеюм]*|гнев[ауеом]*|ярость|ярост[иью]*|радост[иью]*|счасть[яеюм]*|горем*|печаль[ю]*|груст[иью]*|удивления*|шок[ауеом]*|спокойстви[яеюм]*|надежд[аыуей]*)/gi, '<EMOTION>'],
    ];

    for (const file of files) {
      const filePath = path.join(corpusDir, file);
      const text = fs.readFileSync(filePath, 'utf8');
      const sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [];

      for (const s of sentences) {
        let clean = s.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
        for (const [regex, replacement] of categoryMap) {
          clean = clean.replace(regex, replacement);
        }
        clean = clean
          .replace(/\bсталкер[а-я]*\b/gi, '<SUBJ>')
          .replace(/\bчаэс\b/gi, '<PLACE>')
          .replace(/\bсидорович[а-я]*\b/gi, '<SUBJ>')
          .replace(/\bконтролер[а-я]*\b/gi, '<THREAT>')
          .replace(/\bснорк[а-я]*\b/gi, '<THREAT>');

        clean = clean.replace(/(?<=[а-яё,"]\s+)[А-ЯЁ][а-яё]+/g, '<NPC_NAME>');
        clean = clean.replace(/^[А-ЯЁ][а-яё]+\b(?!\s+(?:это|был|в|на|с|от|из|к|по|за|для|о|у|и|а|но|или))\b/g, '<NPC_NAME>');

        const wordsCount = clean.split(' ').length;
        if (wordsCount >= 3 && wordsCount <= 50) {
          RAW_CORPUS.push({ text: clean, tags: ['lore', 'neutral'] });
          added++;
        }
      }
    }
    console.log(`[System] Loaded ${added} sentences from corpus.`);
  }
} catch (e) {
  console.log('[System] Error loading corpus:', e);
}


function compileAndVerify(): void {
  for (const [catName, items] of Object.entries(CANONICAL_CATEGORIES)) {
    for (const item of items) {
      if (!isSanitizedWord(item.text)) {
        throw new Error(`Sanitization check failed for item in ${catName}: ${item.text}`);
      }
    }
  }

  console.log('[Compile Markov Matrix] Training Markov Model...');
  const model = new MarkovModel(2);
  model.train(RAW_CORPUS);

  console.log('[Compile Markov Matrix] Building heuristics...');
  const targetTags = Object.keys(CANONICAL_CATEGORIES).map(k => `<${k}>`);
  model.buildHeuristics(targetTags);

  console.log('[Compile Markov Matrix] Serializing graph...');
  const objGraph: any = {};
  for (const [hist, trans] of model.graph.entries()) {
    objGraph[hist] = {};
    for (const [next, info] of trans.entries()) {
      objGraph[hist][next] = { count: info.count, tags: info.tags };
    }
  }

  const objDistances: any = {};
  for (const [target, distMap] of model.patternDistances.entries()) {
    objDistances[target] = Object.fromEntries(distMap.entries());
  }

  const outPath = path.resolve(__dirname, '../src/data/markov_compiled_matrix.ts');
  const fileContent = `/* ── Precompiled Markov Matrix & Categories (Build-Time Generated) ── */
/* Do not edit manually. Generated by scripts/compile_markov_matrix.ts */
/* Contains 100% canonical Gigahrush & Samosbor entities with PCA axes. */

export interface CompiledCategoryItem {
  readonly text: string;
  readonly weight: number;
  readonly tags: readonly string[];
}

export interface CompiledSyntaxSkeleton {
  readonly id: string;
  readonly pattern: readonly string[];
  readonly intent: string;
  readonly weight: number;
}

export const COMPILED_CATEGORIES: Readonly<Record<string, readonly CompiledCategoryItem[]>> = ${JSON.stringify(CANONICAL_CATEGORIES, null, 2)} as const;
export const COMPILED_SKELETONS: readonly CompiledSyntaxSkeleton[] = ${JSON.stringify(CANONICAL_SKELETONS, null, 2)} as const;

export const COMPILED_MARKOV_GRAPH: Record<string, Record<string, { count: number, tags: Record<string, number> }>> = JSON.parse(${JSON.stringify(JSON.stringify(objGraph))});
export const COMPILED_PATTERN_DISTANCES: Record<string, Record<string, number>> = JSON.parse(${JSON.stringify(JSON.stringify(objDistances))});
`;

  fs.writeFileSync(outPath, fileContent, 'utf-8');
  console.log(`[Compile Markov Matrix] Successfully wrote ${outPath} (${(fileContent.length / 1024 / 1024).toFixed(2)} MB)`);
}
compileAndVerify();
