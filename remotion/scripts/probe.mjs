// Minimal MP4 probe: walks top-level boxes to find moov/mvhd (duration)
// and moov/trak/tkhd (dimensions). No deps.
import fs from "fs";

const file = process.argv[2];
const fd = fs.openSync(file, "r");
const size = fs.fstatSync(fd).size;

function readBox(offset) {
  const header = Buffer.alloc(8);
  fs.readSync(fd, header, 0, 8, offset);
  let boxSize = header.readUInt32BE(0);
  const type = header.toString("ascii", 4, 8);
  let headerSize = 8;
  if (boxSize === 1) {
    const ext = Buffer.alloc(8);
    fs.readSync(fd, ext, 0, 8, offset + 8);
    boxSize = Number(ext.readBigUInt64BE(0));
    headerSize = 16;
  }
  return { type, boxSize, headerSize };
}

function findBox(start, end, wanted) {
  let off = start;
  while (off < end - 8) {
    const { type, boxSize, headerSize } = readBox(off);
    if (boxSize < 8) break;
    if (type === wanted) return { offset: off, boxSize, headerSize };
    off += boxSize;
  }
  return null;
}

const moov = findBox(0, size, "moov");
if (!moov) {
  console.log(JSON.stringify({ error: "no moov box found" }));
  process.exit(1);
}

const moovStart = moov.offset + moov.headerSize;
const moovEnd = moov.offset + moov.boxSize;

// mvhd → duration
const mvhd = findBox(moovStart, moovEnd, "mvhd");
let durationSeconds = null;
if (mvhd) {
  const buf = Buffer.alloc(32);
  fs.readSync(fd, buf, 0, 32, mvhd.offset + mvhd.headerSize);
  const version = buf.readUInt8(0);
  if (version === 0) {
    const timescale = buf.readUInt32BE(12);
    const duration = buf.readUInt32BE(16);
    durationSeconds = duration / timescale;
  } else {
    const timescale = buf.readUInt32BE(20);
    const duration = Number(buf.readBigUInt64BE(24));
    durationSeconds = duration / timescale;
  }
}

// first trak → tkhd → width/height
let width = null;
let height = null;
let trakOff = moovStart;
while (trakOff < moovEnd - 8) {
  const trak = findBox(trakOff, moovEnd, "trak");
  if (!trak) break;
  const tkhd = findBox(trak.offset + trak.headerSize, trak.offset + trak.boxSize, "tkhd");
  if (tkhd) {
    const len = tkhd.boxSize - tkhd.headerSize;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, tkhd.offset + tkhd.headerSize);
    // width/height are the last 8 bytes, 16.16 fixed point
    const w = buf.readUInt32BE(len - 8) / 65536;
    const h = buf.readUInt32BE(len - 4) / 65536;
    if (w > 0 && h > 0) {
      width = w;
      height = h;
      break;
    }
  }
  trakOff = trak.offset + trak.boxSize;
}

console.log(JSON.stringify({ durationSeconds, width, height }, null, 2));
fs.closeSync(fd);
