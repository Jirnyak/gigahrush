const fs = require('fs');
const path = require('path');

const dir = '/Users/jirnyak/Mirror/gigahrush/src/data';
const replacements = [
  { match: /Не добирай лут/g, replace: 'Бросай вещи' },
  { match: /проверь угол до лута/g, replace: 'проверь угол до обыска' },
  { match: /килограмм лута/g, replace: 'килограмм хабара' },
  { match: /портит соседний лут/g, replace: 'портит вещи рядом' },
  { match: /бросай лут и беги/g, replace: 'бросай вещи и беги' },
  { match: /лутают кладовые/g, replace: 'чистят кладовые' },
  { match: /перед лутом/g, replace: 'перед обыском' },
  { match: /потом лут/g, replace: 'потом собирай вещи' },
  { match: /у лута и под ногами/g, replace: 'возле хабара и под ногами' },
  { match: /лута под ковром не бывает достаточно/g, replace: 'находок под ковром не бывает достаточно' },
  { match: /части лута/g, replace: 'части вещей' },
  { match: /внутри лут/g, replace: 'внутри вещи' },
  { match: /не жадничай с лутом/g, replace: 'не жадничай с хабаром' },
  { match: /Лут бесполезен/g, replace: 'Хабар бесполезен' },
  { match: /лут и ремонт/g, replace: 'хабар и ремонт' },
  { match: /короткие хорды, лут/g, replace: 'короткие хорды, добыча' },
  { match: /руку к луту/g, replace: 'руку к хабару' },
  { match: /до лута/g, replace: 'до обыска' },
  { match: /рискнуть лутом/g, replace: 'рискнуть ради вещей' },
  { match: /за лутом/g, replace: 'за хабаром' },
  { match: /забери мелкий лут/g, replace: 'забери мелочевку' },
  { match: /между лутом и выходом/g, replace: 'между хабаром и выходом' },
  { match: /раньше лута/g, replace: 'раньше сбора вещей' },
  { match: /быстрый лутинг/g, replace: 'быстрый сбор хабара' },
  { match: /поспешный лут/g, replace: 'поспешный обыск' },
  { match: /лут, порог или/g, replace: 'вещи, порог или' },
  { match: /вход к луту/g, replace: 'шаг за хабаром' },
  { match: /лут в луче сгорает/g, replace: 'добыча в луче сгорает' }
];

function processDir(directory) {
  const files = fs.readdirSync(directory);
  for (const file of files) {
    const fullPath = path.join(directory, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;
      for (const r of replacements) {
        if (content.match(r.match)) {
          content = content.replace(r.match, r.replace);
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Fixed', fullPath);
      }
    }
  }
}

processDir(dir);
