/** Growable little/big-endian byte buffer, used by the ZIP and shapefile writers. */
export class ByteWriter {
  private buf: Uint8Array;
  private view: DataView;
  private pos = 0;

  constructor(initial = 1024) {
    this.buf = new Uint8Array(initial);
    this.view = new DataView(this.buf.buffer);
  }

  get length(): number {
    return this.pos;
  }

  private ensure(extra: number): void {
    if (this.pos + extra <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.pos + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
    this.view = new DataView(this.buf.buffer);
  }

  u8(value: number): this {
    this.ensure(1);
    this.view.setUint8(this.pos, value);
    this.pos += 1;
    return this;
  }

  u16le(value: number): this {
    this.ensure(2);
    this.view.setUint16(this.pos, value, true);
    this.pos += 2;
    return this;
  }

  u32le(value: number): this {
    this.ensure(4);
    this.view.setUint32(this.pos, value >>> 0, true);
    this.pos += 4;
    return this;
  }

  i32le(value: number): this {
    this.ensure(4);
    this.view.setInt32(this.pos, value | 0, true);
    this.pos += 4;
    return this;
  }

  i32be(value: number): this {
    this.ensure(4);
    this.view.setInt32(this.pos, value | 0, false);
    this.pos += 4;
    return this;
  }

  /**
   * Coerces with Number() rather than guarding, so a corrupted ordinate
   * (null, "12.3", NaN) lands in the file the way a real writer would emit it.
   */
  f64le(value: unknown): this {
    this.ensure(8);
    this.view.setFloat64(this.pos, Number(value), true);
    this.pos += 8;
    return this;
  }

  bytes(data: Uint8Array): this {
    this.ensure(data.length);
    this.buf.set(data, this.pos);
    this.pos += data.length;
    return this;
  }

  /** Zero-padded fixed-width slot, truncating anything that overflows. */
  fixed(data: Uint8Array, width: number, pad = 0x00): this {
    this.ensure(width);
    for (let i = 0; i < width; i++) {
      this.view.setUint8(this.pos + i, i < data.length ? data[i] : pad);
    }
    this.pos += width;
    return this;
  }

  toUint8Array(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }
}

const encoder = new TextEncoder();

export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
