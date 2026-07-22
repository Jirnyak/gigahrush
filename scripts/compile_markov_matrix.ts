/* ── Offline Markov Matrix & Skeleton Compiler ────────────────── */
/* Generates src/data/markov_compiled_matrix.ts at build-time.       */
/* Zero runtime filesystem (node:fs) or text parsing in browser.     */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Alien franchise words strictly banned from the compiled browser matrix
const ALIEN_FRANCHISE_BLACKLIST = new Set([
  'чаэс', 'припять', 'чернобыль', 'сидорович', 'контролер', 'контролёр',
  'снорк', 'меченый', 'стрелок', 'вднх', 'полис', 'ганза', 'орден',
  'монолит', 'долг', 'свобода', 'артем', 'артём', 'родрик', 'шухарт',
  'сталкер', 'сталкеры', 'кордон', 'радар', 'саркофаг', 'янтарь'
]);

function isSanitizedWord(word: string): boolean {
  const lower = word.toLocaleLowerCase('ru-RU');
  for (const alien of ALIEN_FRANCHISE_BLACKLIST) {
    if (lower.includes(alien)) return false;
  }
  return true;
}

interface CategoryItem {
  text: string;
  weight: number;
  tags: string[];
}

// Canonical Gigahrush & Samosbor dictionary categories with PCA-like weights
const CANONICAL_CATEGORIES: Record<string, CategoryItem[]> = {
  SUBJ: [
    { text: 'ликвидатор', weight: 80, tags: ['guard', 'combat', 'danger'] },
    { text: 'слесарь-параноик', weight: 40, tags: ['repair', 'stalker'] },
    { text: 'бригадир смены', weight: 60, tags: ['guard', 'work'] },
    { text: 'обыватель', weight: 10, tags: ['neutral', 'survival'] },
    { text: 'мясник', weight: 90, tags: ['blood', 'mystic', 'combat'] },
    { text: 'проходчик', weight: 50, tags: ['stalker', 'survival', 'work'] },
    { text: 'домком', weight: 70, tags: ['guard', 'bureaucracy'] },
    { text: 'дежурный электрик', weight: 35, tags: ['repair', 'survival'] },
    { text: 'дежурный по гермозатвору', weight: 65, tags: ['guard', 'door'] },
    { text: 'лаборант НИИ', weight: 30, tags: ['neutral', 'science'] },
    { text: 'санитар секции', weight: 45, tags: ['medical', 'clean'] },
    { text: 'инспектор по герметичности', weight: 75, tags: ['guard', 'door', 'bureaucracy'] }
  ],
  ITEM: [
    { text: 'гаусс-пушка', weight: 5000, tags: ['combat', 'expensive'] },
    { text: 'артефакт "Пустышка"', weight: 1500, tags: ['mystic', 'expensive'] },
    { text: 'чистый фильтр АФУ-300', weight: 100, tags: ['survival', 'repair'] },
    { text: 'банка тушенки', weight: 50, tags: ['survival', 'food'] },
    { text: 'грязный бинт', weight: 5, tags: ['blood', 'survival', 'medical'] },
    { text: 'патроны 5.45', weight: 200, tags: ['combat', 'expensive'] },
    { text: 'дозиметр ДП-5В', weight: 450, tags: ['survival', 'repair', 'science'] },
    { text: 'малахитовый артефакт', weight: 1200, tags: ['mystic', 'expensive'] },
    { text: 'герметизирующая мастика', weight: 80, tags: ['repair'] },
    { text: 'пайковый концентрат', weight: 40, tags: ['food', 'survival'] },
    { text: 'талон на воду', weight: 15, tags: ['survival', 'trade'] },
    { text: 'обрывок журнала ГО', weight: 25, tags: ['document', 'lore'] },
    { text: 'инструкция по герметизации', weight: 35, tags: ['document', 'repair', 'lore'] }
  ],
  PLACE: [
    { text: 'гермодверь', weight: 10, tags: ['door', 'safe'] },
    { text: 'распределитель', weight: 20, tags: ['repair', 'work'] },
    { text: 'влажный сектор', weight: 40, tags: ['water', 'danger'] },
    { text: 'сборочный цех', weight: 30, tags: ['neutral', 'work'] },
    { text: 'кровавый тупик', weight: 100, tags: ['blood', 'mystic', 'danger'] },
    { text: 'защитный шлюз', weight: 15, tags: ['door', 'guard', 'safe'] },
    { text: 'бункер Гражданской Обороны', weight: 5, tags: ['safe', 'door'] },
    { text: 'вентиляционная шахта', weight: 45, tags: ['danger', 'repair'] },
    { text: 'трансформаторная ячейка', weight: 55, tags: ['danger', 'repair'] },
    { text: 'жилая ячейка', weight: 12, tags: ['safe', 'neutral'] },
    { text: 'продувочная прачечная', weight: 25, tags: ['water', 'neutral'] },
    { text: 'архив комендатуры', weight: 20, tags: ['document', 'bureaucracy', 'safe'] }
  ],
  THREAT: [
    { text: 'Самосбор', weight: 100, tags: ['samosbor', 'danger'] },
    { text: 'процедурная аномалия', weight: 50, tags: ['mystic', 'danger'] },
    { text: 'бетонник', weight: 80, tags: ['combat', 'danger'] },
    { text: 'истощение и голод', weight: 20, tags: ['survival'] },
    { text: 'пси-излучение', weight: 90, tags: ['mystic', 'fear', 'danger'] },
    { text: 'черная слизь', weight: 75, tags: ['samosbor', 'danger'] },
    { text: 'удушливый газ', weight: 40, tags: ['survival', 'danger', 'air'] },
    { text: 'радиационная капель', weight: 35, tags: ['survival', 'danger'] },
    { text: 'гидроудар в трубах', weight: 30, tags: ['repair', 'danger'] }
  ],
  FACTION: [
    { text: 'Служба ликвидации', weight: 80, tags: ['guard', 'combat'] },
    { text: 'Служба герметизации', weight: 70, tags: ['guard', 'door'] },
    { text: 'Независимая гильдия слесарей', weight: 40, tags: ['repair'] },
    { text: 'Администрация корпуса', weight: 65, tags: ['bureaucracy'] },
    { text: 'НИИ "Щит"', weight: 85, tags: ['science'] }
  ],
  ACTION: [
    { text: 'смазывали поворотные механизмы', weight: 30, tags: ['repair', 'door'] },
    { text: 'задраили шлюз', weight: 70, tags: ['guard', 'door', 'samosbor'] },
    { text: 'сдали карточки', weight: 40, tags: ['bureaucracy', 'survival'] },
    { text: 'записали показания манометра', weight: 20, tags: ['repair', 'science'] },
    { text: 'проверили герметик', weight: 50, tags: ['repair', 'door'] },
    { text: 'опечатали сектор', weight: 85, tags: ['guard', 'danger'] },
    { text: 'оставили заметку на стене', weight: 15, tags: ['document', 'lore'] }
  ],
  INSTRUMENT: [
    { text: 'дозиметр', weight: 100, tags: ['survival', 'science'] },
    { text: 'гаечный ключ', weight: 50, tags: ['repair'] },
    { text: 'противогаз ГП-7', weight: 150, tags: ['survival', 'air'] },
    { text: 'переносной фонарь', weight: 30, tags: ['survival'] },
    { text: 'прижимной клин', weight: 40, tags: ['door', 'repair'] }
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
  // bark_ambient
  { id: 'sk.bark.1', pattern: ['THREAT', 'SUBJ'], intent: 'bark_ambient', weight: 10 },
  { id: 'sk.bark.2', pattern: ['PLACE', 'THREAT'], intent: 'bark_ambient', weight: 12 },
  { id: 'sk.bark.3', pattern: ['SUBJ', 'INSTRUMENT'], intent: 'bark_ambient', weight: 8 },
  // procedural_quest
  { id: 'sk.quest.1', pattern: ['PLACE', 'THREAT', 'ITEM'], intent: 'procedural_quest', weight: 15 },
  { id: 'sk.quest.2', pattern: ['FACTION', 'THREAT', 'PLACE'], intent: 'procedural_quest', weight: 12 },
  // document_flavor (записки, дневники, документы)
  { id: 'sk.doc.1', pattern: ['SUBJ', 'ACTION', 'PLACE'], intent: 'document_flavor', weight: 14 },
  { id: 'sk.doc.2', pattern: ['PLACE', 'THREAT', 'ACTION'], intent: 'document_flavor', weight: 16 },
  { id: 'sk.doc.3', pattern: ['FACTION', 'THREAT'], intent: 'document_flavor', weight: 12 },
  { id: 'sk.doc.4', pattern: ['SUBJ', 'ITEM', 'PLACE'], intent: 'document_flavor', weight: 13 },
  // lore_note
  { id: 'sk.lore.1', pattern: ['PLACE', 'THREAT', 'SUBJ'], intent: 'lore_note', weight: 15 },
  { id: 'sk.lore.2', pattern: ['FACTION', 'PLACE', 'ACTION'], intent: 'lore_note', weight: 14 },
  // demos_post
  { id: 'sk.demos.1', pattern: ['PLACE', 'THREAT'], intent: 'demos_post', weight: 12 },
  { id: 'sk.demos.2', pattern: ['SUBJ', 'ITEM', 'PLACE'], intent: 'demos_post', weight: 14 }
];

function compileAndVerify(): void {
  // Sanity verify all entries against ALIEN_FRANCHISE_BLACKLIST
  for (const [catName, items] of Object.entries(CANONICAL_CATEGORIES)) {
    for (const item of items) {
      if (!isSanitizedWord(item.text)) {
        throw new Error(`Sanitization check failed for item in ${catName}: ${item.text}`);
      }
    }
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
`;

  fs.writeFileSync(outPath, fileContent, 'utf-8');
  console.log(`[Compile Markov Matrix] Successfully wrote ${outPath} (${fileContent.length} bytes)`);
}

compileAndVerify();
