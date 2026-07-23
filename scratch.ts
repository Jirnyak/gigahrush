import { ITEMS } from './src/data/items';
import { ItemType } from './src/core/types';

function buildItemCategories() {
  const categories: Record<string, any[]> = {
    ITEM: [],
    WEAPON: [],
    FOOD: [],
    MEDICINE: [],
    TOOL: [],
    DOCUMENT: []
  };
  
  for (const def of Object.values(ITEMS)) {
    const weight = Math.max(10, def.value || 10);
    const tags = def.tags ? [...def.tags] : [];
    
    const catItem = {
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
        categories.TOOL.push(catItem);
        break;
      case ItemType.NOTE:
        categories.DOCUMENT.push(catItem);
        break;
    }
  }
  
  return categories;
}

const cats = buildItemCategories();
console.log(`ITEM: ${cats.ITEM.length}, WEAPON: ${cats.WEAPON.length}, FOOD: ${cats.FOOD.length}, MEDICINE: ${cats.MEDICINE.length}`);
