const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3456;
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const NOTES_DIR = path.join(DATA_DIR, 'notes');

fs.mkdirSync(PUBLIC_DIR, { recursive: true });
fs.mkdirSync(NOTES_DIR, { recursive: true });

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function slugify(text) {
  return String(text || 'untitled')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8', extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(text),
    ...extraHeaders,
  });
  res.end(text);
}

function readRequestBody(req, maxBytes = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function formatStepsForReadme(stepsText) {
  const lines = String(stepsText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return '_No steps recorded._';
  }

  return lines
    .map((line, idx) => {
      const cleaned = line.replace(/^(\d+[\.\)]\s*|[-*•]\s*)/, '').trim();
      return `${idx + 1}. ${cleaned}`;
    })
    .join('\n');
}

function buildReadmeMarkdown(note) {
  const created = new Date(note.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const updated = new Date(note.updatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const tagsLine = note.tags && note.tags.length
    ? `**Tags:** ${note.tags.map((t) => `\`${t}\``).join(' ')}`
    : '';

  const linksSection =
    note.links && note.links.length
      ? note.links
          .map((l) => `- [${l.label || l.url}](${l.url})`)
          .join('\n')
      : '_No reference websites attached._';

  const imagesSection =
    note.images && note.images.length
      ? note.images
          .map((img, i) => {
            const caption = img.caption ? img.caption : `Image ${i + 1}`;
            return `### ${i + 1}. ${caption}\n\n![${caption}](./images/${img.filename})`;
          })
          .join('\n\n')
      : '_No images attached._';

  return `# ${note.title}

> **Created:** ${created} | **Last Updated:** ${updated}${tagsLine ? `  \n> ${tagsLine}` : ''}

---

## 1. What I Learned / Overview
${note.answers?.overview?.trim() || '_Not provided._'}

## 2. Ordered Process & Steps
${formatStepsForReadme(note.answers?.steps)}

## 3. Detailed Notes (What Each Step Did)
${note.answers?.details?.trim() || '_Not provided._'}

## 4. Key Takeaways, Gotchas & Next Time
${note.answers?.takeaways?.trim() || '_Not provided._'}

---

## Reference Websites & Links
${linksSection}

## Attached Images & Visuals
${imagesSection}
`;
}

function saveBase64Image(imagesDir, imgPayload, index) {
  const { dataUrl, caption, originalName, filename } = imgPayload;
  if (filename && !dataUrl) {
    // Existing image kept during edit
    return { filename, caption: caption || '' };
  }
  if (!dataUrl || typeof dataUrl !== 'string') return null;

  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) return null;

  const mime = match[1].toLowerCase();
  const base64Data = match[2];
  let ext = '.png';
  if (mime.includes('jpeg') || mime.includes('jpg')) ext = '.jpg';
  else if (mime.includes('webp')) ext = '.webp';
  else if (mime.includes('gif')) ext = '.gif';
  else if (mime.includes('svg')) ext = '.svg';

  const base = slugify(path.basename(originalName || `image-${index + 1}`, path.extname(originalName || '')));
  const safeName = `${String(index + 1).padStart(2, '0')}-${base}-${crypto.randomBytes(3).toString('hex')}${ext}`;
  const outPath = path.join(imagesDir, safeName);
  fs.writeFileSync(outPath, Buffer.from(base64Data, 'base64'));
  return { filename: safeName, caption: caption || '' };
}

function listAllNotes() {
  if (!fs.existsSync(NOTES_DIR)) return [];
  const entries = fs.readdirSync(NOTES_DIR, { withFileTypes: true });
  const notes = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(NOTES_DIR, entry.name, 'note.json');
    if (!fs.existsSync(metaPath)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      notes.push(data);
    } catch {
      // Skip malformed entry
    }
  }
  notes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return notes;
}

function getNoteById(id) {
  const safeId = path.basename(id);
  const noteDir = path.join(NOTES_DIR, safeId);
  const metaPath = path.join(noteDir, 'note.json');
  const readmePath = path.join(noteDir, 'README.md');
  if (!fs.existsSync(metaPath)) return null;
  const note = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : buildReadmeMarkdown(note);
  return { note, readme };
}

function seedSampleNoteIfEmpty() {
  const existing = listAllNotes();
  if (existing.length > 0) return;

  const id = 'pcb-design-workflow';
  const noteDir = path.join(NOTES_DIR, id);
  const imagesDir = path.join(noteDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  const now = new Date().toISOString();
  const sample = {
    id,
    title: 'PCB Design Workflow (KiCad)',
    tags: ['PCB Design', 'Hardware', 'KiCad'],
    createdAt: now,
    updatedAt: now,
    answers: {
      overview:
        'Designed a 2-layer custom microcontroller PCB from schematic capture to Gerber export for manufacturing.',
      steps: [
        '1. Create schematic and assign component symbols & power flags',
        '2. Run Electrical Rules Check (ERC) and assign footprints',
        '3. Set board outline, stackup, and design rules (clearance & trace width)',
        '4. Place components logically (MCU center, decoupling caps close to VCC)',
        '5. Route power and signal traces, then add ground copper pour',
        '6. Run Design Rules Check (DRC) and export Gerber + drill files',
      ].join('\n'),
      details:
        'Step 1-2: Used 0805 footprints for resistors/caps so hand soldering is easy. Added PWR_FLAG on VCC and GND so ERC passes.\nStep 3-4: Set 0.25mm minimum trace width for signals and 0.5mm for 5V power rails. Placed 100nF decoupling capacitors right next to each IC power pin.\nStep 5-6: Used bottom layer primarily for a solid GND pour with stitching vias. Exported Gerber + Excellon drill files and verified in the Gerber viewer before uploading to fab.',
      takeaways:
        'Always double-check USB/regulator pinouts against the datasheet before ordering. Add silkscreen labels on headers and test points so debugging is fast two months later.',
    },
    links: [
      { label: 'KiCad Documentation', url: 'https://docs.kicad.org/' },
      { label: 'PCB Design Guidelines', url: 'https://www.kicad.org/help/tutorials/' },
    ],
    images: [],
  };

  fs.writeFileSync(path.join(noteDir, 'note.json'), JSON.stringify(sample, null, 2));
  fs.writeFileSync(path.join(noteDir, 'README.md'), buildReadmeMarkdown(sample));
}

seedSampleNoteIfEmpty();

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(urlObj.pathname);

  try {
    // API: List notes
    if (req.method === 'GET' && pathname === '/api/notes') {
      const q = (urlObj.searchParams.get('q') || '').trim().toLowerCase();
      let notes = listAllNotes();
      if (q) {
        notes = notes.filter((n) => {
          const haystack = [
            n.title,
            ...(n.tags || []),
            n.answers?.overview,
            n.answers?.steps,
            n.answers?.details,
            n.answers?.takeaways,
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(q);
        });
      }
      return sendJson(res, 200, { notes });
    }

    // API: Create note
    if (req.method === 'POST' && pathname === '/api/notes') {
      const raw = await readRequestBody(req);
      const body = JSON.parse(raw || '{}');
      const title = String(body.title || '').trim();
      if (!title) return sendJson(res, 400, { error: 'Title is required' });

      let id = slugify(title);
      if (fs.existsSync(path.join(NOTES_DIR, id))) {
        id = `${id}-${crypto.randomBytes(2).toString('hex')}`;
      }

      const noteDir = path.join(NOTES_DIR, id);
      const imagesDir = path.join(noteDir, 'images');
      fs.mkdirSync(imagesDir, { recursive: true });

      const savedImages = [];
      const incomingImages = Array.isArray(body.images) ? body.images : [];
      incomingImages.forEach((img, idx) => {
        const saved = saveBase64Image(imagesDir, img, idx);
        if (saved) savedImages.push(saved);
      });

      const now = new Date().toISOString();
      const note = {
        id,
        title,
        tags: Array.isArray(body.tags)
          ? body.tags.map((t) => String(t).trim()).filter(Boolean)
          : [],
        createdAt: now,
        updatedAt: now,
        answers: {
          overview: String(body.answers?.overview || ''),
          steps: String(body.answers?.steps || ''),
          details: String(body.answers?.details || ''),
          takeaways: String(body.answers?.takeaways || ''),
        },
        links: Array.isArray(body.links)
          ? body.links
              .filter((l) => l && l.url)
              .map((l) => ({ label: String(l.label || '').trim(), url: String(l.url).trim() }))
          : [],
        images: savedImages,
      };

      const readme = buildReadmeMarkdown(note);
      fs.writeFileSync(path.join(noteDir, 'note.json'), JSON.stringify(note, null, 2));
      fs.writeFileSync(path.join(noteDir, 'README.md'), readme);

      return sendJson(res, 201, { note, readme });
    }

    // API: Single note operations
    const noteMatch = pathname.match(/^\/api\/notes\/([^/]+)$/);
    if (noteMatch) {
      const id = path.basename(noteMatch[1]);
      if (req.method === 'GET') {
        const found = getNoteById(id);
        if (!found) return sendJson(res, 404, { error: 'Note not found' });
        return sendJson(res, 200, found);
      }

      if (req.method === 'PUT') {
        const existing = getNoteById(id);
        if (!existing) return sendJson(res, 404, { error: 'Note not found' });
        const raw = await readRequestBody(req);
        const body = JSON.parse(raw || '{}');

        const noteDir = path.join(NOTES_DIR, id);
        const imagesDir = path.join(noteDir, 'images');
        fs.mkdirSync(imagesDir, { recursive: true });

        const savedImages = [];
        const incomingImages = Array.isArray(body.images) ? body.images : [];
        incomingImages.forEach((img, idx) => {
          const saved = saveBase64Image(imagesDir, img, idx);
          if (saved) savedImages.push(saved);
        });

        // Remove unreferenced images from disk
        const keptSet = new Set(savedImages.map((i) => i.filename));
        if (fs.existsSync(imagesDir)) {
          for (const f of fs.readdirSync(imagesDir)) {
            if (!keptSet.has(f)) {
              fs.unlinkSync(path.join(imagesDir, f));
            }
          }
        }

        const updatedNote = {
          ...existing.note,
          title: String(body.title || existing.note.title).trim(),
          tags: Array.isArray(body.tags)
            ? body.tags.map((t) => String(t).trim()).filter(Boolean)
            : existing.note.tags,
          updatedAt: new Date().toISOString(),
          answers: {
            overview: String(body.answers?.overview ?? existing.note.answers.overview),
            steps: String(body.answers?.steps ?? existing.note.answers.steps),
            details: String(body.answers?.details ?? existing.note.answers.details),
            takeaways: String(body.answers?.takeaways ?? existing.note.answers.takeaways),
          },
          links: Array.isArray(body.links)
            ? body.links
                .filter((l) => l && l.url)
                .map((l) => ({ label: String(l.label || '').trim(), url: String(l.url).trim() }))
            : existing.note.links,
          images: savedImages,
        };

        const readme = buildReadmeMarkdown(updatedNote);
        fs.writeFileSync(path.join(noteDir, 'note.json'), JSON.stringify(updatedNote, null, 2));
        fs.writeFileSync(path.join(noteDir, 'README.md'), readme);

        return sendJson(res, 200, { note: updatedNote, readme });
      }

      if (req.method === 'DELETE') {
        const noteDir = path.join(NOTES_DIR, id);
        if (!fs.existsSync(noteDir)) return sendJson(res, 404, { error: 'Note not found' });
        fs.rmSync(noteDir, { recursive: true, force: true });
        return sendJson(res, 200, { deleted: true });
      }
    }

    // API: Download README.md
    const readmeDownloadMatch = pathname.match(/^\/api\/notes\/([^/]+)\/readme$/);
    if (req.method === 'GET' && readmeDownloadMatch) {
      const id = path.basename(readmeDownloadMatch[1]);
      const found = getNoteById(id);
      if (!found) return sendJson(res, 404, { error: 'Note not found' });
      return sendText(res, 200, found.readme, 'text/markdown; charset=utf-8', {
        'Content-Disposition': `attachment; filename="${id}-README.md"`,
      });
    }

    // Serve uploaded note images: /notes/<id>/images/<file>
    const imgMatch = pathname.match(/^\/notes\/([^/]+)\/images\/([^/]+)$/);
    if (req.method === 'GET' && imgMatch) {
      const id = path.basename(imgMatch[1]);
      const file = path.basename(imgMatch[2]);
      const filePath = path.join(NOTES_DIR, id, 'images', file);
      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        return res.end('Not found');
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      return fs.createReadStream(filePath).pipe(res);
    }

    // Static files from public/
    const relPath = pathname === '/' ? '/index.html' : pathname;
    const safePath = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
    const fullPath = path.join(PUBLIC_DIR, safePath);
    if (fullPath.startsWith(PUBLIC_DIR) && fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const ext = path.extname(fullPath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      return fs.createReadStream(fullPath).pipe(res);
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message || 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`RecallNote server running at http://localhost:${PORT}`);
});
