const fs = require('fs');

let text = fs.readFileSync('tests/events-economy.test.ts', 'utf8');

text = text.replace(/\['living'\]:/g, "'-6':");
text = text.replace(/\['ministry'\]:/g, "'34':");
text = text.replace(/\['kvartiry'\]:/g, "'2':");
text = text.replace(/\['maintenance'\]:/g, "'-14':");
text = text.replace(/\['hell'\]:/g, "'-40':");
text = text.replace(/\['void'\]:/g, "'-48':");

text = text.replace(/floors\['living'\]/g, "floors['-6']");
text = text.replace(/floors\['ministry'\]/g, "floors['34']");
text = text.replace(/floors\['kvartiry'\]/g, "floors['2']");
text = text.replace(/floors\['maintenance'\]/g, "floors['-14']");
text = text.replace(/floors\['hell'\]/g, "floors['-40']");
text = text.replace(/floors\['void'\]/g, "floors['-48']");

fs.writeFileSync('tests/events-economy.test.ts', text);
