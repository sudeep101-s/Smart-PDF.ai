import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import multer from 'multer';
import cors from 'cors';
import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';
import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  Table, 
  TableRow, 
  TableCell, 
  WidthType, 
  HeadingLevel, 
  AlignmentType,
  BorderStyle
} from 'docx';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pdfParse: any;
try {
  const mod = require('pdf-parse');
  pdfParse = typeof mod === 'function' ? mod : (mod.default || mod);
} catch (e) {
  console.error('Failed to require pdf-parse:', e);
}

import archiver from 'archiver';
import { pdfToPng } from 'pdf-to-png-converter';
import sharp from 'sharp';
import PptxGenJS from 'pptxgenjs';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  const storage = multer.memoryStorage();
  const upload = multer({ storage });

  function parsePages(pagesStr: string, maxPages: number): number[] {
    if (!pagesStr) return Array.from({ length: maxPages }, (_, i) => i);
    
    const pageIndices: Set<number> = new Set();
    const parts = pagesStr.split(',').map(p => p.trim());
    
    for (const part of parts) {
      if (part.includes('-')) {
        const rangeParts = part.split('-').map(p => parseInt(p.trim()));
        if (rangeParts.length === 2) {
          const [start, end] = rangeParts;
          if (!isNaN(start) && !isNaN(end)) {
            const min = Math.min(start, end);
            const max = Math.max(start, end);
            for (let i = min; i <= max; i++) {
              if (i >= 1 && i <= maxPages) pageIndices.add(i - 1);
            }
          }
        }
      } else {
        const pageNum = parseInt(part);
        if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= maxPages) {
          pageIndices.add(pageNum - 1);
        }
      }
    }
    
    return Array.from(pageIndices).sort((a, b) => a - b);
  }

  // PDF Merge API
  app.post('/api/pdf/merge', upload.array('pdfs'), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length < 2) {
        return res.status(400).json({ error: 'At least 2 PDF files are required for merging.' });
      }

      const mergedPdf = await PDFDocument.create();
      for (const file of files) {
        try {
          const pdf = await PDFDocument.load(file.buffer);
          const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
          copiedPages.forEach((page) => mergedPdf.addPage(page));
        } catch (e) {
          console.error(`Error loading PDF ${file.originalname}:`, e);
          return res.status(400).json({ error: `File "${file.originalname}" is not a valid PDF or is encrypted.` });
        }
      }

      const pdfBytes = await mergedPdf.save();
      res.contentType('application/pdf');
      res.send(Buffer.from(pdfBytes));
    } catch (error) {
      console.error('Merge error:', error);
      res.status(500).json({ error: 'System error during PDF merge. Check file sizes.' });
    }
  });

  // PDF Split API
  app.post('/api/pdf/split', upload.single('pdf'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No PDF file uploaded.' });

      let pdf;
      try {
        pdf = await PDFDocument.load(file.buffer);
      } catch (e) {
        return res.status(400).json({ error: 'The uploaded file is not a valid PDF document.' });
      }

      const pageCount = pdf.getPageCount();
      if (pageCount === 0) {
        return res.status(400).json({ error: 'The PDF has no pages to split.' });
      }

      const selectedIndices = parsePages(req.body.pages, pageCount);
      if (selectedIndices.length === 0) {
        return res.status(400).json({ error: 'No valid pages selected.' });
      }

      const archive = archiver('zip', { zlib: { level: 9 } });
      
      res.contentType('application/zip');
      res.attachment('split_pages.zip');
      
      archive.on('error', (err) => {
        throw err;
      });

      archive.pipe(res);

      for (const idx of selectedIndices) {
        const newPdf = await PDFDocument.create();
        const [copiedPage] = await newPdf.copyPages(pdf, [idx]);
        newPdf.addPage(copiedPage);
        const pdfBytes = await newPdf.save();
        archive.append(Buffer.from(pdfBytes), { name: `page_${idx + 1}.pdf` });
      }

      await archive.finalize();
    } catch (error) {
      console.error('Split error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal error processing the PDF split.' });
      }
    }
  });

  // Image to PDF API
  app.post('/api/pdf/image-to-pdf', upload.array('images'), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'Please select at least one image.' });
      }

      console.log(`Processing ${files.length} images to PDF...`);
      const pdfDoc = await PDFDocument.create();
      
      for (const file of files) {
        try {
          // Use sharp to convert to PNG to ensure compatibility with pdf-lib
          // and to handle various input formats (WebP, JPG, PNG, etc.)
          const pngBuffer = await sharp(file.buffer)
            .png()
            .toBuffer();
          
          const image = await pdfDoc.embedPng(pngBuffer);
          const page = pdfDoc.addPage([image.width, image.height]);
          page.drawImage(image, {
            x: 0,
            y: 0,
            width: image.width,
            height: image.height,
          });
        } catch (e) {
          console.error(`Error processing image ${file.originalname}:`, e);
        }
      }

      if (pdfDoc.getPageCount() === 0) {
        return res.status(400).json({ error: 'Failed to process selected images. Please ensure they are valid image files.' });
      }

      const pdfBytes = await pdfDoc.save();
      res.contentType('application/pdf');
      res.send(Buffer.from(pdfBytes));
    } catch (error) {
      console.error('Image to PDF error:', error);
      res.status(500).json({ error: 'Failed to convert images. One of the files might be corrupted or too large.' });
    }
  });

  async function extractTextRobustly(buffer: Buffer, selectedIndices?: number[]): Promise<string> {
    try {
      console.log('Attempting robust text extraction with pdfjs-dist...');
      let pdfjs: any;
      try {
        const pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjs = pdfjsModule;
      } catch (e) {
        const pdfjsModule = await import('pdfjs-dist');
        pdfjs = pdfjsModule.default || pdfjsModule;
      }

      const data = new Uint8Array(buffer);
      const loadingTask = pdfjs.getDocument({ 
        data,
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
        disableFontFace: true
      });
      
      const doc = await loadingTask.promise;
      let fullText = '';
      
      const indices = selectedIndices || Array.from({ length: doc.numPages }, (_, i) => i);
      
      for (const idx of indices) {
        const pageNum = idx + 1;
        if (pageNum > doc.numPages) continue;
        try {
          const page = await doc.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: any) => (item as any).str || '')
            .join(' ');
          fullText += pageText + '\n';
        } catch (pageError) {
          console.error(`Error extracting text from page ${pageNum}:`, pageError);
        }
      }
      return fullText;
    } catch (e) {
      console.error('Robust extraction total failure:', e);
      return '';
    }
  }

  async function getPDFText(buffer: Buffer, selectedIndices?: number[]): Promise<{ text: string; scanned: boolean }> {
    // Basic valid PDF check
    if (buffer.length < 4 || !buffer.toString('utf8', 0, 4).includes('%PDF')) {
      throw new Error('The uploaded file does not appear to be a valid PDF document header.');
    }

    // Check if encrypted using pdf-lib
    try {
      const pdfTest = await PDFDocument.load(buffer, { ignoreEncryption: false });
      if (selectedIndices) {
        // If we have selection, we can't use pdfParse easily for subsets
        // so we'll force robust extraction if indices are provided.
        const text = await extractTextRobustly(buffer, selectedIndices);
        if (!text || text.trim().length < 5) return { text: '', scanned: true };
        return { text, scanned: false };
      }
    } catch (e: any) {
      if (e.message?.toLowerCase().includes('encrypted') || e.message?.toLowerCase().includes('password')) {
        throw new Error('This PDF is password protected. Please unlock it before uploading.');
      }
    }

    let text = '';
    
    // Attempt 1: pdf-parse (Only for full doc)
    try {
      if (typeof pdfParse === 'function') {
        const data = await pdfParse(buffer);
        text = data.text || '';
      }
    } catch (e: any) {
      console.warn('pdf-parse failed:', e);
    }

    // Attempt 2: pdfjs-dist
    if (!text || text.trim().length < 10) { 
      const robustText = await extractTextRobustly(buffer);
      if (robustText && robustText.trim().length > text.trim().length) {
        text = robustText;
      }
    }

    if (!text || text.trim().length === 0) {
      return { text: '', scanned: true };
    }

    return { text, scanned: false };
  }

  // PDF Text Extraction API (for AI context)
  app.post('/api/pdf/extract-text', upload.single('pdf'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'PDF file is missing.' });

      const pdf = await PDFDocument.load(file.buffer);
      const pageCount = pdf.getPageCount();
      const selectedIndices = req.body.pages ? parsePages(req.body.pages, pageCount) : undefined;

      const result = await getPDFText(file.buffer, selectedIndices);
      res.json(result);
    } catch (error: any) {
      console.error('Extraction error:', error);
      res.status(400).json({ error: error.message || 'An error occurred during text extraction.' });
    }
  });

  // Helper to parse formatting (bold, italic) within a string and return TextRuns
  function parseFormatting(text: string): TextRun[] {
    const runs: TextRun[] = [];
    // Matches **bold**, __bold__, *italic*, _italic_
    const regex = /(\*\*|__)(.*?)\1|(\*|_)(.*?)\3/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        runs.push(new TextRun({ text: text.substring(lastIndex, match.index) }));
      }

      const isBold = !!match[1];
      const isItalic = !!match[3];
      const content = match[2] || match[4];

      runs.push(new TextRun({
        text: content,
        bold: isBold,
        italics: isItalic
      }));

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      runs.push(new TextRun({ text: text.substring(lastIndex) }));
    }

    if (runs.length === 0 && text.length > 0) {
      runs.push(new TextRun({ text }));
    }

    return runs;
  }

  // Helper to parse "structural" text into docx components
  function generateDOCXElements(text: string): any[] {
    const lines = text.split('\n');
    const elements: any[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();

      if (!line) {
        elements.push(new Paragraph({ children: [] }));
        i++;
        continue;
      }

      // Table Detection (Markdown Table)
      // Look for a line with pipes and a separator line below it
      const isTableLine = (l: string) => l.includes('|');
      const isSeparatorLine = (l: string) => l.includes('|') && (l.includes('-|-') || l.includes('---') || l.includes(':|'));

      if (isTableLine(line) && i + 1 < lines.length && isSeparatorLine(lines[i + 1])) {
        const tableRows: TableRow[] = [];
        
        const processRow = (rowStr: string, isHeader: boolean = false) => {
          const cells = rowStr.split('|').map(c => c.trim()).filter((c, idx, arr) => {
             // Handle leading/trailing pipes
             if (idx === 0 && rowStr.startsWith('|') && c === '') return false;
             if (idx === arr.length - 1 && rowStr.endsWith('|') && c === '') return false;
             return true;
          });

          return new TableRow({
            children: cells.map(cell => new TableCell({
              children: [new Paragraph({ children: parseFormatting(cell) })],
              width: { size: 100 / Math.max(1, cells.length), type: WidthType.PERCENTAGE },
              shading: isHeader ? { fill: "F2F2F2" } : undefined
            })),
          });
        };

        // Add header
        tableRows.push(processRow(line, true));
        i += 2; // skip header and separator

        // Process following rows
        while (i < lines.length && isTableLine(lines[i])) {
          if (!isSeparatorLine(lines[i])) {
            tableRows.push(processRow(lines[i]));
          }
          i++;
        }

        if (tableRows.length > 0) {
          elements.push(new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1 },
              bottom: { style: BorderStyle.SINGLE, size: 1 },
              left: { style: BorderStyle.SINGLE, size: 1 },
              right: { style: BorderStyle.SINGLE, size: 1 },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
              insideVertical: { style: BorderStyle.SINGLE, size: 1 },
            }
          }));
        }
        continue;
      }

      // Heading Detection
      if (line.startsWith('#')) {
        const levelMatch = line.match(/^#+/);
        const level = levelMatch ? levelMatch[0].length : 1;
        const headingText = line.replace(/^#+\s*/, '');
        
        const headingLevel = level === 1 ? HeadingLevel.HEADING_1 : 
                             level === 2 ? HeadingLevel.HEADING_2 : 
                             level === 3 ? HeadingLevel.HEADING_3 :
                             level === 4 ? HeadingLevel.HEADING_4 :
                             HeadingLevel.HEADING_5;

        elements.push(new Paragraph({
          children: parseFormatting(headingText),
          heading: headingLevel,
          spacing: { before: 240, after: 120 },
        }));
        i++;
        continue;
      }

      // List Detection
      if (line.startsWith('- ') || line.startsWith('* ') || /^\d+\.\s/.test(line)) {
        const isNumbered = /^\d+\.\s/.test(line);
        const listText = line.replace(/^(- |\* |\d+\.\s)/, '');
        
        elements.push(new Paragraph({
          children: parseFormatting(listText),
          bullet: isNumbered ? undefined : { level: 0 },
          numbering: isNumbered ? { reference: "numbered-list", level: 0 } : undefined,
          spacing: { after: 100 }
        }));
        i++;
        continue;
      }

      // Default Paragraph
      elements.push(new Paragraph({
        children: parseFormatting(line),
        spacing: { after: 120 },
      }));
      i++;
    }

    return elements;
  }

  // PDF to Word API
  app.post('/api/pdf/word', upload.single('pdf'), async (req, res) => {
    try {
      const file = req.file;
      const textFromRequest = req.body.text; // Text from frontend OCR
      
      let text = textFromRequest;
      if (!text) {
        if (!file) return res.status(400).json({ error: 'No PDF provided.' });
        const result = await getPDFText(file.buffer);
        text = result.text;
      }

      const doc = new Document({
        numbering: {
          config: [
            {
              reference: "numbered-list",
              levels: [
                {
                  level: 0,
                  format: "decimal",
                  text: "%1.",
                  alignment: AlignmentType.START,
                },
              ],
            },
          ],
        },
        sections: [{
          properties: {},
          children: generateDOCXElements(text),
        }],
      });

      const buffer = await Packer.toBuffer(doc);
      res.contentType('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.send(buffer);
    } catch (error: any) {
      console.error('PDF to Word error:', error);
      res.status(400).json({ error: error.message || 'Word generation failed.' });
    }
  });

  // PDF to PPT API
  app.post('/api/pdf/ppt', upload.single('pdf'), async (req, res) => {
    try {
      const file = req.file;
      const textFromRequest = req.body.text;

      let text = textFromRequest;
      if (!text) {
        if (!file) return res.status(400).json({ error: 'PDF file required.' });
        const result = await getPDFText(file.buffer);
        text = result.text;
      }
      
      const lines = text.split('\n').filter((l: string) => l.trim().length > 0);

      // Handle PptxGenJS instantiation
      let pres: any;
      try {
        pres = new (PptxGenJS as any)();
      } catch (e) {
        pres = new ((PptxGenJS as any).default || PptxGenJS)();
      }

      // Set global theme (Optional but makes it look better)
      pres.layout = 'LAYOUT_16x9';

      // Title Slide
      let slide = pres.addSlide();
      slide.background = { fill: "f8fafc" };
      
      slide.addText([
        { text: "Document Presentation", options: { color: "4f46e5", fontSize: 44, bold: true } },
        { text: "\nAI-Synthesized from PDF", options: { color: "64748b", fontSize: 18 } }
      ], { 
        x: '10%', y: '35%', w: '80%', h: '30%', 
        align: 'center', 
        valign: 'middle'
      });

      // Bottom bar for branding
      slide.addShape(pres.ShapeType.rect, { x: 0, y: '92%', w: '100%', h: '8%', fill: { color: "4f46e5" } });
      slide.addText("Smart PDF.ai", { x: '5%', y: '93%', w: '90%', h: '6%', fontSize: 12, color: 'ffffff', align: 'right' });
      
      let currentSlide: any = null;
      let yPos = 1.2;

      lines.forEach((line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        // Heading Detection (H1, H2, H3 trigger new slides)
        const headingMatch = trimmed.match(/^(#+)\s*(.*)/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const title = headingMatch[2];

          if (level <= 3) {
            currentSlide = pres.addSlide();
            currentSlide.background = { fill: "ffffff" };
            
            // Header bar
            currentSlide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.8, fill: { color: "4f46e5" } });
            
            currentSlide.addText(title, { 
              x: 0.5, y: 0.15, w: '90%', h: 0.5,
              fontSize: level === 1 ? 32 : 28, 
              bold: true, 
              color: 'ffffff',
              valign: 'middle'
            });

            yPos = 1.2;
            return;
          }
        }

        // If no slide exists yet, create one
        if (!currentSlide) {
          currentSlide = pres.addSlide();
          yPos = 1.0;
        }

        // Auto-create new slide if content overflows
        if (yPos > 6.5) {
          currentSlide = pres.addSlide();
          // Optional: repeat the last header if applicable
          yPos = 1.0;
        }

        // Content detection
        const isBullet = /^[*-+•]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed);
        const cleanText = trimmed.replace(/^[*-+•]\s|^\d+\.\s|#+\s*/, '');
        
        // Skip empty lines after cleaning
        if (!cleanText.trim()) return;

        currentSlide.addText(cleanText, { 
          x: 0.8, 
          y: yPos, 
          w: '85%',
          fontSize: 14, 
          color: '334155', 
          bullet: isBullet ? { type: 'bullet' } : undefined,
          valign: 'top',
          lineSpacing: 24
        });

        // Heuristic for height
        const estimatedLines = Math.ceil(cleanText.length / 80);
        yPos += 0.3 + (estimatedLines * 0.25);
      });

      const buffer = await (pres.write({ outputType: 'nodebuffer' }) as Promise<Buffer>);
      res.contentType('application/vnd.openxmlformats-officedocument.presentationml.presentation');
      res.send(buffer);
    } catch (error: any) {
      console.error('PDF to PPT error:', error);
      res.status(400).json({ error: error.message || 'PowerPoint creation failed.' });
    }
  });

  // PDF Rotate API
  app.post('/api/pdf/rotate', upload.single('pdf'), async (req, res) => {
    try {
      const file = req.file;
      const rotationDegrees = parseInt(req.body.degrees || '90');
      if (!file) return res.status(400).json({ error: 'PDF file is required.' });

      const pdfDoc = await PDFDocument.load(file.buffer);
      const pageCount = pdfDoc.getPageCount();
      const selectedIndices = parsePages(req.body.pages, pageCount);
      
      const allPages = pdfDoc.getPages();
      for (const idx of selectedIndices) {
        const page = allPages[idx];
        const currentRotation = page.getRotation().angle;
        page.setRotation(degrees((currentRotation + rotationDegrees) % 360));
      }

      const pdfBytes = await pdfDoc.save();
      res.contentType('application/pdf');
      res.send(Buffer.from(pdfBytes));
    } catch (error) {
      console.error('PDF rotate error:', error);
      res.status(500).json({ error: 'Failed to rotate PDF.' });
    }
  });

  // PDF Annotate API
  app.post('/api/pdf/annotate', upload.single('pdf'), async (req, res) => {
    try {
      const file = req.file;
      const annotations = JSON.parse(req.body.annotations || '[]');
      
      if (!file) return res.status(400).json({ error: 'No PDF provided.' });

      const pdfDoc = await PDFDocument.load(file.buffer);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();

      for (const ann of annotations) {
        const pageIdx = Math.min(ann.page || 0, pages.length - 1);
        const page = pages[pageIdx];
        const { width, height } = page.getSize();

        // Convert percentage coordinates to PDF units
        const x = (ann.x / 100) * width;
        const y = (1 - ann.y / 100) * height; // PDF origin is bottom-left

        if (ann.type === 'text') {
          page.drawText(ann.text || '', {
            x,
            y,
            size: ann.size || 12,
            font,
            color: rgb(ann.r || 0, ann.g || 0, ann.b || 0),
          });
        } else if (ann.type === 'highlight') {
          page.drawRectangle({
            x,
            y: y - (ann.h || 15),
            width: ann.w || 100,
            height: ann.h || 15,
            color: rgb(1, 1, 0), // Yellow
            opacity: 0.4,
          });
        } else if (ann.type === 'square') {
          page.drawRectangle({
            x,
            y: y - (ann.h || 50),
            width: ann.w || 50,
            height: ann.h || 50,
            borderColor: rgb(ann.r || 0, ann.g || 0, ann.b || 0),
            borderWidth: 2,
          });
        }
      }

      const pdfBytes = await pdfDoc.save();
      res.contentType('application/pdf');
      res.send(Buffer.from(pdfBytes));
    } catch (error) {
      console.error('Annotate error:', error);
      res.status(500).json({ error: 'Failed to annotate PDF.' });
    }
  });

  // PDF to JPG API
  app.post('/api/pdf/pdf-to-jpg', upload.single('pdf'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'PDF file is required.' });

      const pngPages = await pdfToPng(file.buffer, {
        viewportScale: 2.0 // Higher quality
      });

      if (pngPages.length === 0) {
        return res.status(400).json({ error: 'The PDF has no pages to convert.' });
      }

      const selectedIndices = parsePages(req.body.pages, pngPages.length);
      if (selectedIndices.length === 0) {
        return res.status(400).json({ error: 'No valid pages selected for conversion.' });
      }

      const archive = archiver('zip', { zlib: { level: 9 } });
      res.contentType('application/zip');
      res.attachment('pdf_pages_jpg.zip');
      archive.pipe(res);

      for (const idx of selectedIndices) {
        const jpgBuffer = await sharp(pngPages[idx].content)
          .jpeg({ quality: 90 })
          .toBuffer();
        
        archive.append(jpgBuffer, { name: `page_${idx + 1}.jpg` });
      }

      await archive.finalize();
    } catch (error) {
      console.error('PDF to JPG error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to convert PDF to JPG. The file might be too large.' });
      }
    }
  });

  // PDF Compress API
  app.post('/api/pdf/compress', upload.single('pdf'), async (req, res) => {
    try {
      const file = req.file;
      const level = req.body.level || 'medium';
      
      if (!file) {
        return res.status(400).json({ error: 'PDF file required.' });
      }

      console.log(`Compressing PDF: ${file.originalname}, Level: ${level}`);

      let pdfDoc;
      try {
        pdfDoc = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
      } catch (e) {
        console.error('PDF load fail during compression:', e);
        return res.status(400).json({ error: 'Invalid or corrupted PDF file.' });
      }

      if (level === 'high') {
        pdfDoc.setTitle('');
        pdfDoc.setAuthor('');
        pdfDoc.setSubject('');
        pdfDoc.setKeywords([]);
        pdfDoc.setProducer('');
        pdfDoc.setCreator('');
      }

      const pdfBytes = await pdfDoc.save({
        useObjectStreams: true,
        updateFieldAppearances: level === 'low',
        objectsPerTick: 50
      });

      res.contentType('application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="compressed_${file.originalname}"`);
      res.send(Buffer.from(pdfBytes));
    } catch (error) {
      console.error('Compress error:', error);
      res.status(500).json({ error: 'Failed to compress PDF.' });
    }
  });

  // PDF Protect API
  app.post('/api/pdf/protect', upload.single('pdf'), async (req, res) => {
    try {
      const file = req.file;
      const password = req.body.password;
      
      if (!file) return res.status(400).json({ error: 'PDF file required.' });
      if (!password) return res.status(400).json({ error: 'Password is required.' });

      const fs = await import('fs');
      const muhammara = require('muhammara');
      
      const tmpIn = path.join(process.cwd(), `in_${Date.now()}.pdf`);
      const tmpOut = path.join(process.cwd(), `out_${Date.now()}.pdf`);
      
      fs.writeFileSync(tmpIn, file.buffer);
      
      try {
        const pdfWriter = muhammara.createWriterToModify(tmpIn, {
          modifiedFilePath: tmpOut,
          userPassword: password,
          ownerPassword: password,
          encryptionOptions: {
            userPassword: password,
            ownerPassword: password,
            algorithm: 'aes256',
            permissions: {
              printing: 'highQuality',
              modifying: false,
              copying: false,
              annotating: false,
              fillingForms: false,
              accessibility: true,
              documentAssembly: false
            }
          }
        });
        pdfWriter.end();

        const protectedBuffer = fs.readFileSync(tmpOut);
        
        fs.unlinkSync(tmpIn);
        fs.unlinkSync(tmpOut);

        res.contentType('application/pdf');
        res.send(protectedBuffer);
      } catch (err) {
        if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
        if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
        throw err;
      }
    } catch (error: any) {
      console.error('Protect error:', error);
      res.status(500).json({ error: 'Failed to encrypt PDF: ' + (error.message || 'Unknown error') });
    }
  });

  // PDF Unlock API
  app.post('/api/pdf/unlock', upload.single('pdf'), async (req, res) => {
    try {
      const file = req.file;
      const password = req.body.password;
      
      if (!file) return res.status(400).json({ error: 'PDF file required.' });
      if (!password) return res.status(400).json({ error: 'Password is required.' });

      const fs = await import('fs');
      const muhammara = require('muhammara');
      
      const tmpIn = path.join(process.cwd(), `ul_in_${Date.now()}.pdf`);
      const tmpOut = path.join(process.cwd(), `ul_out_${Date.now()}.pdf`);
      
      fs.writeFileSync(tmpIn, file.buffer);
      
      try {
        const pdfWriter = muhammara.createWriterToModify(tmpIn, {
          modifiedFilePath: tmpOut,
          password: password
        });
        pdfWriter.end();

        const unlockedBuffer = fs.readFileSync(tmpOut);
        
        fs.unlinkSync(tmpIn);
        fs.unlinkSync(tmpOut);

        res.contentType('application/pdf');
        res.send(unlockedBuffer);
      } catch (err) {
        if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
        if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
        res.status(400).json({ error: 'Incorrect password or invalid PDF.' });
      }
    } catch (error: any) {
      console.error('Unlock error:', error);
      res.status(500).json({ error: 'Failed to unlock PDF: ' + (error.message || 'Unknown error') });
    }
  });

  // PDF Watermark API
  app.post('/api/pdf/watermark', upload.single('pdf'), async (req, res) => {
    try {
      const file = req.file;
      const text = req.body.text || "CONFIDENTIAL";
      if (!file) return res.status(400).json({ error: 'PDF file is required.' });

      const pdfDoc = await PDFDocument.load(file.buffer);
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const pages = pdfDoc.getPages();

      pages.forEach(page => {
        const { width, height } = page.getSize();
        page.drawText(text, {
          x: width / 4,
          y: height / 2,
          size: 50,
          font: helveticaFont,
          color: rgb(0.75, 0.75, 0.75),
          rotate: degrees(45),
          opacity: 0.3,
        });
      });

      const pdfBytes = await pdfDoc.save();
      res.contentType('application/pdf');
      res.send(Buffer.from(pdfBytes));
    } catch (error: any) {
      console.error('Watermark error:', error);
      res.status(500).json({ error: 'Failed to add watermark: ' + error.message });
    }
  });

  // PDF Redact API (Basic placeholder - draws a black box at top)
  app.post('/api/pdf/redact', upload.single('pdf'), async (req, res) => {
    try {
      const file = req.file;
      const textToRedact = req.body.text;
      if (!file) return res.status(400).json({ error: 'PDF file is required.' });

      const pdfDoc = await PDFDocument.load(file.buffer);
      const pages = pdfDoc.getPages();

      // Note: Real text redaction involves finding text coordinates.
      // For this implementation, we simulate it by adding a disclaimer/mask.
      pages.forEach(page => {
        const { width, height } = page.getSize();
        page.drawRectangle({
          x: 50,
          y: height - 100,
          width: width - 100,
          height: 60,
          color: rgb(0, 0, 0),
        });
        page.drawText(`Redacted: ${textToRedact}`, {
          x: 60,
          y: height - 80,
          size: 15,
          color: rgb(1, 1, 1),
        });
      });

      const pdfBytes = await pdfDoc.save();
      res.contentType('application/pdf');
      res.send(Buffer.from(pdfBytes));
    } catch (error: any) {
      console.error('Redaction error:', error);
      res.status(500).json({ error: 'Failed to redact PDF: ' + error.message });
    }
  });

  // PDF Header & Footer API
  app.post('/api/pdf/header-footer', upload.single('pdf'), async (req, res) => {
    try {
      const file = req.file;
      const header = req.body.header || "";
      const footer = req.body.footer || "";
      if (!file) return res.status(400).json({ error: 'PDF file is required.' });

      const pdfDoc = await PDFDocument.load(file.buffer);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();

      pages.forEach((page, i) => {
        const { width, height } = page.getSize();
        
        if (header) {
          page.drawText(header, {
            x: 50,
            y: height - 30,
            size: 10,
            font: font,
            color: rgb(0.4, 0.4, 0.4),
          });
        }

        if (footer) {
          const footerMsg = footer.replace('{page}', (i + 1).toString());
          page.drawText(footerMsg, {
            x: 50,
            y: 20,
            size: 10,
            font: font,
            color: rgb(0.4, 0.4, 0.4),
          });
        }
      });

      const pdfBytes = await pdfDoc.save();
      res.contentType('application/pdf');
      res.send(Buffer.from(pdfBytes));
    } catch (error: any) {
      console.error('Header/Footer error:', error);
      res.status(500).json({ error: 'Failed to update header/footer: ' + error.message });
    }
  });

  // API 404 handler
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
