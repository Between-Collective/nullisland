import { ByteWriter, crc32, utf8 } from "./bytes";

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

// A fixed 1 Jan 2024 timestamp, so identical input always produces identical
// bytes. Reproducibility beats an accurate mtime for a fixture generator.
const DOS_TIME = 0;
const DOS_DATE = ((2024 - 1980) << 9) | (1 << 5) | 1;

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const UTF8_FLAG = 0x0800;

/**
 * Minimal store-only ZIP writer. No compression: KMZ and shapefile bundles are
 * both perfectly valid uncompressed, and it keeps the app dependency-free.
 */
export function makeZip(entries: ZipEntry[]): Uint8Array {
  const out = new ByteWriter(64 * 1024);
  const central: Array<{ name: Uint8Array; crc: number; size: number; offset: number }> = [];

  for (const entry of entries) {
    const name = utf8(entry.name);
    const crc = crc32(entry.data);
    const offset = out.length;

    out.u32le(LOCAL_SIG);
    out.u16le(20);
    out.u16le(UTF8_FLAG);
    out.u16le(0); // stored
    out.u16le(DOS_TIME);
    out.u16le(DOS_DATE);
    out.u32le(crc);
    out.u32le(entry.data.length);
    out.u32le(entry.data.length);
    out.u16le(name.length);
    out.u16le(0);
    out.bytes(name);
    out.bytes(entry.data);

    central.push({ name, crc, size: entry.data.length, offset });
  }

  const centralOffset = out.length;
  for (const item of central) {
    out.u32le(CENTRAL_SIG);
    out.u16le(20); // version made by
    out.u16le(20); // version needed
    out.u16le(UTF8_FLAG);
    out.u16le(0);
    out.u16le(DOS_TIME);
    out.u16le(DOS_DATE);
    out.u32le(item.crc);
    out.u32le(item.size);
    out.u32le(item.size);
    out.u16le(item.name.length);
    out.u16le(0); // extra
    out.u16le(0); // comment
    out.u16le(0); // disk number
    out.u16le(0); // internal attrs
    out.u32le(0); // external attrs
    out.u32le(item.offset);
    out.bytes(item.name);
  }
  const centralSize = out.length - centralOffset;

  out.u32le(EOCD_SIG);
  out.u16le(0);
  out.u16le(0);
  out.u16le(central.length);
  out.u16le(central.length);
  out.u32le(centralSize);
  out.u32le(centralOffset);
  out.u16le(0);

  return out.toUint8Array();
}
