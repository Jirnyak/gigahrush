import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  CARAVAN_CONTRACT_OUTCOMES,
  CARAVAN_LANE_BY_ID,
  SMALL_CARAVAN_TEMPLATES,
  SMALL_CARAVAN_TEMPLATE_BY_ID,
  SMALL_CARAVAN_TEMPLATE_BY_LANE_ID,
  type CaravanContractAction,
} from '../src/data/caravans';
import { CONTRACTS } from '../src/data/contracts';

/** Контракт объявляет своё решение тегом `decision_*` в `data/contracts.ts`.
 *  Та же связь второй раз записана в шаблоне каравана; расходиться им нельзя,
 *  и однажды они уже разошлись: id сдачи маршрута 88 лежал в поле обхода. */
const ACTION_TAG: Readonly<Record<CaravanContractAction, string>> = {
  escort: 'decision_escort',
  raid: 'decision_raid',
  reroute: 'decision_reroute',
  report: 'decision_report',
  seat: 'decision_seat',
};

test('каждый караванный контракт объявлен ровно в одном шаблоне и с тем же решением', () => {
  const contractById = new Map(CONTRACTS.map(contract => [contract.id, contract]));
  const seen = new Set<string>();

  for (const template of SMALL_CARAVAN_TEMPLATES) {
    for (const contractId in template.contracts ?? {}) {
      assert.equal(seen.has(contractId), false, `контракт ${contractId} привязан к двум шаблонам`);
      seen.add(contractId);

      const contract = contractById.get(contractId);
      assert.ok(contract, `контракт ${contractId} шаблона ${template.id} не существует в data/contracts.ts`);

      const action = template.contracts![contractId];
      assert.ok(
        contract.tags.includes(ACTION_TAG[action]),
        `контракт ${contractId} помечен как '${action}', но не несёт тега ${ACTION_TAG[action]}: ${contract.tags.join(',')}`,
      );
    }
  }

  assert.equal(seen.size > 0, true);
});

test('таблица исходов выводится из шаблонов и знает линию каждого контракта', () => {
  const ids = Object.keys(CARAVAN_CONTRACT_OUTCOMES);
  assert.equal(ids.length, SMALL_CARAVAN_TEMPLATES.reduce((n, t) => n + Object.keys(t.contracts ?? {}).length, 0));

  for (const contractId of ids) {
    const outcome = CARAVAN_CONTRACT_OUTCOMES[contractId];
    const lane = CARAVAN_LANE_BY_ID[outcome.laneId];
    assert.ok(lane, `исход ${contractId} ведёт на несуществующую линию ${outcome.laneId}`);

    const template = SMALL_CARAVAN_TEMPLATES.find(item => item.contracts?.[contractId] !== undefined);
    assert.ok(template);
    assert.equal(outcome.laneId, template.laneId);
    assert.equal(outcome.action, template.contracts![contractId]);
  }

  // Сдача серого маршрута закрывает линию, а не пускает её в обход.
  assert.deepEqual(CARAVAN_CONTRACT_OUTCOMES.caravan_report_market88_smugglers, {
    action: 'report',
    laneId: 'production_black_market_88',
  });
});

test('индексы шаблонов совпадают с массивом, а не живут отдельной копией', () => {
  for (const template of SMALL_CARAVAN_TEMPLATES) {
    assert.equal(SMALL_CARAVAN_TEMPLATE_BY_ID[template.id], template);
    assert.ok(CARAVAN_LANE_BY_ID[template.laneId], `шаблон ${template.id} ссылается на несуществующую линию`);
  }
  assert.equal(Object.keys(SMALL_CARAVAN_TEMPLATE_BY_ID).length, SMALL_CARAVAN_TEMPLATES.length);

  // По линии индекс обязан отдавать ПЕРВЫЙ объявленный шаблон: именно его
  // возвращал линейный поиск, который индекс заменил.
  for (const laneId in SMALL_CARAVAN_TEMPLATE_BY_LANE_ID) {
    assert.equal(
      SMALL_CARAVAN_TEMPLATE_BY_LANE_ID[laneId],
      SMALL_CARAVAN_TEMPLATES.find(template => template.laneId === laneId),
    );
  }
});
