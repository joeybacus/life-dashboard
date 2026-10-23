/* CT scans: reads one DICOM slice and turns it into CT numbers (Hounsfield units),
   away from the page so scrolling stays smooth. Runs as a plain (classic) worker.

   In:  { id, buf }  — the whole .dcm file as an ArrayBuffer
   Out: { id, z, num, rows, cols, spacing, thickness, desc, hu } — hu is an Int16Array
        (transferred), or { id, error }

   Handles the files ct_download.py saves: JPEG Lossless (the 100% originals),
   JPEG 2000 lossless (the 75% / 50% copies) and uncompressed slices. Nothing
   here touches the network; the decoders are files of this app. */
/* global importScripts, JpegLossless, OpenJPEGWASM */
importScripts('../../vendor/ct/lossless.js', '../../vendor/ct/openjpegwasm_decode.js');

const VENDOR = new URL('../../vendor/ct/', self.location.href).href;
let j2k = null; // the JPEG 2000 decoder, started the first time a 75% / 50% slice comes in

const TEXT = new TextDecoder('latin1');
const LONG_VR = new Set(['OB', 'OD', 'OF', 'OL', 'OW', 'SQ', 'UC', 'UN', 'UR', 'UT', 'OV', 'SV', 'UV']);
const UNDEFINED = 0xffffffff;

/** The tags the viewer needs, read from the file. */
function parse(buf) {
  const dv = new DataView(buf);
  const bytes = new Uint8Array(buf);
  if (TEXT.decode(bytes.subarray(128, 132)) !== 'DICM') throw new Error('Not a DICOM file');
  const out = { syntax: '1.2.840.10008.1.2.1' };
  let at = 132;
  let explicit = true;
  const str = (start, len) => TEXT.decode(bytes.subarray(start, start + len)).replace(/[\0 ]+$/, '').trim();

  /** One element's header at `pos`: { tag, vr, len, start }. */
  const header = (pos, exp) => {
    const tag = (dv.getUint16(pos, true) << 16 | dv.getUint16(pos + 2, true)) >>> 0;
    if (tag >>> 16 === 0xfffe) return { tag, vr: '', len: dv.getUint32(pos + 4, true), start: pos + 8 };
    if (!exp) return { tag, vr: '', len: dv.getUint32(pos + 4, true), start: pos + 8 };
    const vr = String.fromCharCode(bytes[pos + 4], bytes[pos + 5]);
    return LONG_VR.has(vr)
      ? { tag, vr, len: dv.getUint32(pos + 8, true), start: pos + 12 }
      : { tag, vr, len: dv.getUint16(pos + 6, true), start: pos + 8 };
  };
  /* Where an undefined-length sequence (or item) that starts at `pos` ends. Items can hold
     more such sequences, so both walk down. A UN sequence is always implicit inside. */
  const skipItem = (pos, exp) => {
    while (pos + 8 <= buf.byteLength) {
      const h = header(pos, exp);
      if (h.tag === 0xfffee00d) return h.start;
      pos = h.len === UNDEFINED ? skipSequence(h.start, exp && h.vr !== 'UN') : h.start + h.len;
    }
    return pos;
  };
  const skipSequence = (pos, exp) => {
    while (pos + 8 <= buf.byteLength) {
      const h = header(pos, exp);
      if (h.tag === 0xfffee0dd) return h.start;
      if (h.tag !== 0xfffee000) return pos; // not a proper item: stop here
      pos = h.len === UNDEFINED ? skipItem(h.start, exp) : h.start + h.len;
    }
    return pos;
  };

  while (at + 8 <= buf.byteLength) {
    const group = dv.getUint16(at, true);
    const meta = group === 0x0002;
    const { tag, vr, len, start } = header(at, explicit || meta);
    if (tag === 0x7fe00010) { out.pixels = { start, len, vr }; break; }
    if (len === UNDEFINED) { at = skipSequence(start, explicit && vr !== 'UN'); continue; } // a sequence we don't need
    switch (tag) {
      case 0x00020000: out.metaEnd = start + 4 + dv.getUint32(start, true); break;
      case 0x00020010: out.syntax = str(start, len); break;
      case 0x00180050: out.thickness = parseFloat(str(start, len)); break;
      case 0x00200013: out.num = parseInt(str(start, len), 10); break;
      case 0x00200032: out.position = str(start, len).split('\\').map(Number); break;
      case 0x00280010: out.rows = dv.getUint16(start, true); break;
      case 0x00280011: out.cols = dv.getUint16(start, true); break;
      case 0x00280030: out.spacing = str(start, len).split('\\').map(Number); break;
      case 0x00280100: out.bits = dv.getUint16(start, true); break;
      case 0x00280103: out.signed = dv.getUint16(start, true) === 1; break;
      case 0x00281052: out.intercept = parseFloat(str(start, len)); break;
      case 0x00281053: out.slope = parseFloat(str(start, len)); break;
      case 0x0008103e: out.desc = str(start, len); break;
      default: break;
    }
    at = start + len;
    if (meta && at >= (out.metaEnd ?? Infinity) && out.syntax === '1.2.840.10008.1.2') explicit = false;
  }
  if (!out.pixels) throw new Error('No picture in this file');
  return out;
}

/** The compressed picture inside the file (the first frame's fragments, joined). */
function frameBytes(buf, { start, len }) {
  if (len !== UNDEFINED) return new Uint8Array(buf, start, len);
  const dv = new DataView(buf);
  let at = start;
  const parts = [];
  let first = true;
  while (at + 8 <= buf.byteLength) {
    const tag = (dv.getUint16(at, true) << 16 | dv.getUint16(at + 2, true)) >>> 0;
    const size = dv.getUint32(at + 4, true);
    if (tag === 0xfffee0dd) break;
    if (!first) parts.push(new Uint8Array(buf, at + 8, size)); // the first item is the offset table
    first = false;
    at += 8 + size;
  }
  if (parts.length === 1) return parts[0];
  const joined = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { joined.set(p, o); o += p.length; }
  return joined;
}

async function decodeJ2k(data) {
  // print / printErr: the decoder reports every slice's headers otherwise
  if (!j2k) j2k = OpenJPEGWASM({ locateFile: (f) => VENDOR + f, print: () => {}, printErr: () => {} });
  const lib = await j2k;
  const decoder = new lib.J2KDecoder();
  try {
    decoder.getEncodedBuffer(data.length).set(data);
    decoder.decode();
    return new Uint8Array(decoder.getDecodedBuffer()).slice().buffer; // copy out of the wasm memory
  } finally {
    decoder.delete();
  }
}

async function slice(buf) {
  const d = parse(buf);
  let raw;
  if (/^1\.2\.840\.10008\.1\.2\.4\.(57|70)$/.test(d.syntax)) {
    const data = frameBytes(buf, d.pixels);
    raw = new JpegLossless.Decoder().decompress(data.buffer, data.byteOffset, data.length);
  } else if (/^1\.2\.840\.10008\.1\.2\.4\.(90|91)$/.test(d.syntax)) {
    raw = await decodeJ2k(frameBytes(buf, d.pixels));
  } else if (/^1\.2\.840\.10008\.1\.2(\.1)?$/.test(d.syntax)) {
    raw = buf.slice(d.pixels.start, d.pixels.start + d.rows * d.cols * 2);
  } else {
    throw new Error(`This kind of DICOM file isn't supported yet (${d.syntax})`);
  }
  const n = d.rows * d.cols;
  const stored = d.signed ? new Int16Array(raw, 0, n) : new Uint16Array(raw, 0, n);
  const slope = Number.isFinite(d.slope) ? d.slope : 1;
  const intercept = Number.isFinite(d.intercept) ? d.intercept : 0;
  const hu = new Int16Array(n);
  for (let i = 0; i < n; i++) hu[i] = stored[i] * slope + intercept;
  return {
    z: d.position ? d.position[2] : (d.num ?? 0),
    num: d.num ?? 0,
    rows: d.rows,
    cols: d.cols,
    spacing: d.spacing ?? null,
    thickness: d.thickness ?? null,
    desc: d.desc ?? '',
    hu,
  };
}

self.onmessage = async ({ data: { id, buf } }) => {
  try {
    const out = await slice(buf);
    self.postMessage({ id, ...out }, [out.hu.buffer]);
  } catch (err) {
    self.postMessage({ id, error: err.message || String(err) });
  }
};
