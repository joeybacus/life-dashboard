/* A small PDF maker for the app's printable summaries (0.9.0): A4 pages with
   text in Helvetica (regular and bold), lines and filled boxes. No library and
   no internet needed. Text uses the PDF's standard Latin set (WinAnsi), so
   accents, dashes, curly quotes, × and • come out right; anything else (emoji)
   becomes "?".

     const doc = new Pdf();
     doc.text('Hello', 40, 60, { size: 18, bold: true });
     doc.line(40, 70, 555, 70);
     const file = doc.file('Summary.pdf');

   Coordinates are points from the top-left (A4 is 595 × 842). */

const W = 595.28;
const H = 841.89;

// Helvetica widths (per 1000) for the printable ASCII characters, for measuring text
const WIDTHS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const BOLD_WIDTHS = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

// Characters outside Latin-1 that WinAnsi has, and their codes
const WIN = { '€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134, '‡': 135, 'ˆ': 136, '‰': 137, 'Š': 138, '‹': 139, 'Œ': 140, 'Ž': 142,
  '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '˜': 152, '™': 153, 'š': 154, '›': 155, 'œ': 156, 'ž': 158, 'Ÿ': 159,
  ' ': 32, ' ': 32, ' ': 32, '−': 45, '↑': 94, '↓': 118 };

/** Text as WinAnsi byte values. */
function codes(text) {
  const out = [];
  for (const ch of String(text ?? '')) {
    const c = ch.codePointAt(0);
    if (WIN[ch] != null) out.push(WIN[ch]);
    else if (c >= 32 && c <= 126) out.push(c);
    else if (c >= 160 && c <= 255) out.push(c);
    else if (c === 9) out.push(32);
    else out.push(63); // ?
  }
  return out;
}

const literal = (bytes) => `(${bytes.map((b) => (b === 40 || b === 41 || b === 92 ? `\\${String.fromCharCode(b)}` : b < 32 || b > 126 ? `\\${b.toString(8).padStart(3, '0')}` : String.fromCharCode(b))).join('')})`;
const num = (n) => (Math.round(n * 100) / 100).toString();

/** "#rrggbb" → "r g b" (0–1). */
function rgb(hex = '#000000') {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex) ?? [0, '00', '00', '00'];
  return [1, 2, 3].map((i) => num(parseInt(m[i], 16) / 255)).join(' ');
}

export class Pdf {
  constructor({ title = 'Life Dashboard' } = {}) {
    this.title = title;
    this.pages = [];
    this.addPage();
  }

  get width() { return W; }
  get height() { return H; }

  addPage() {
    this.ops = [];
    this.pages.push(this.ops);
    return this;
  }

  /** How wide a piece of text is, in points. */
  measure(text, size = 10, bold = false) {
    const table = bold ? BOLD_WIDTHS : WIDTHS;
    return codes(text).reduce((sum, c) => sum + (c >= 32 && c <= 126 ? table[c - 32] : 556), 0) * size / 1000;
  }

  /** Text that fits a width, ending in "…" when cut. */
  fit(text, width, size = 10, bold = false) {
    let t = String(text ?? '');
    if (this.measure(t, size, bold) <= width) return t;
    while (t.length > 1 && this.measure(`${t}…`, size, bold) > width) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
  }

  /** Lines of text no wider than `width`. */
  wrap(text, width, size = 10, bold = false) {
    const lines = [];
    for (const para of String(text ?? '').split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (this.measure(next, size, bold) <= width || !line) line = next;
        else {
          lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  /** Text with its baseline at y. align: 'left' | 'right' (x is then the right edge) | 'center'. */
  text(str, x, y, { size = 10, bold = false, color = '#111111', align = 'left' } = {}) {
    const w = align === 'left' ? 0 : this.measure(str, size, bold);
    const left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${rgb(color)} rg ${num(left)} ${num(H - y)} Td ${literal(codes(str))} Tj ET`);
    return this;
  }

  line(x1, y1, x2, y2, { color = '#d0d4dc', width = 0.75 } = {}) {
    this.ops.push(`${rgb(color)} RG ${num(width)} w ${num(x1)} ${num(H - y1)} m ${num(x2)} ${num(H - y2)} l S`);
    return this;
  }

  rect(x, y, w, h, { fill = '#eef0f5' } = {}) {
    this.ops.push(`${rgb(fill)} rg ${num(x)} ${num(H - y - h)} ${num(w)} ${num(h)} re f`);
    return this;
  }

  /** The finished PDF, as bytes. */
  bytes() {
    const objects = [];
    const add = (body) => { objects.push(body); return objects.length; };
    const catalog = add(null);
    const pagesId = add(null);
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    for (const ops of this.pages) {
      const stream = ops.join('\n');
      const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(W)} ${num(H)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`));
    }
    objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    const info = add(`<< /Title ${literal(codes(this.title))} /Producer (Life Dashboard) >>`);
    // Everything above is plain ASCII, so string length = byte length
    let out = '%PDF-1.4\n';
    const offsets = [];
    objects.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i);
    return bytes;
  }

  file(name) {
    return new File([this.bytes()], name, { type: 'application/pdf' });
  }
}
