import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFParser from 'pdf2json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pdfParser = new PDFParser(this, 1);

pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError));
pdfParser.on("pdfParser_dataReady", pdfData => {
    let text = pdfParser.getRawTextContent();
    text = text.replace(/\r\n/g, '\n').replace(/\n\s*\n/g, '\n\n');
    
    const outDir = path.join(__dirname, '../src/data/training_corpus');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(outDir, 'piknik.txt'), text);
    console.log('Extracted and saved to src/data/training_corpus/piknik.txt');
});

const pdfPath = path.join(__dirname, '../piknik_na_obotchine.pdf');
pdfParser.loadPDF(pdfPath);
