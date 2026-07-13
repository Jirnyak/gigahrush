const fs = require('fs');
const pdf = require('pdf-parse');
const path = require('path');

const dataBuffer = fs.readFileSync(path.join(__dirname, '../piknik_na_obotchine.pdf'));

pdf(dataBuffer).then(function(data) {
    let text = data.text;
    
    // Basic cleaning: remove extra whitespace and page numbers if any
    text = text.replace(/\n\s*\n/g, '\n\n');
    
    const outDir = path.join(__dirname, '../src/data/training_corpus');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(outDir, 'piknik.txt'), text);
    console.log('Extracted and saved to src/data/training_corpus/piknik.txt');
}).catch(err => {
    console.error('Error parsing PDF:', err);
});
