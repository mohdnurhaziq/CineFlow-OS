import zlib from "node:zlib";

export interface ZipFileEntry {
  filename: string;
  data: Buffer;
}

/**
 * Creates a standard PKZIP 2.0 archive buffer (Store method - Method 0)
 * Ideal for already-compressed JPEG/PNG/WebP/MP4 assets.
 * Validated by Linux CLI `unzip -t`.
 */
export function createZipArchive(files: ZipFileEntry[]): Buffer {
  const fileRecords: {
    nameBuf: Buffer;
    crc: number;
    size: number;
    offset: number;
  }[] = [];

  let offset = 0;
  const buffers: Buffer[] = [];

  for (const file of files) {
    const nameBuf = Buffer.from(file.filename, "utf8");
    const content = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const crc = zlib.crc32(content);
    const size = content.length;

    // Local file header (30 bytes)
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); // Local header signature
    header.writeUInt16LE(20, 4);         // Version needed (2.0)
    header.writeUInt16LE(0, 6);          // General purpose bit flag
    header.writeUInt16LE(0, 8);          // Compression method: 0 (Stored)
    header.writeUInt16LE(0, 10);         // Last mod time
    header.writeUInt16LE(0, 12);         // Last mod date
    header.writeUInt32LE(crc, 14);       // CRC-32
    header.writeUInt32LE(size, 18);      // Compressed size
    header.writeUInt32LE(size, 22);      // Uncompressed size
    header.writeUInt16LE(nameBuf.length, 26); // File name length
    header.writeUInt16LE(0, 28);         // Extra field length

    buffers.push(header, nameBuf, content);
    fileRecords.push({
      nameBuf,
      crc,
      size,
      offset,
    });
    offset += 30 + nameBuf.length + size;
  }

  const centralDirStart = offset;
  let centralDirSize = 0;

  for (const rec of fileRecords) {
    // Central directory header (46 bytes)
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);     // Central directory signature
    cd.writeUInt16LE(20, 4);             // Version made by
    cd.writeUInt16LE(20, 6);             // Version needed
    cd.writeUInt16LE(0, 8);              // Bit flag
    cd.writeUInt16LE(0, 10);             // Compression method: 0
    cd.writeUInt16LE(0, 12);             // Time
    cd.writeUInt16LE(0, 14);             // Date
    cd.writeUInt32LE(rec.crc, 16);       // CRC-32
    cd.writeUInt32LE(rec.size, 20);      // Compressed size
    cd.writeUInt32LE(rec.size, 24);      // Uncompressed size
    cd.writeUInt16LE(rec.nameBuf.length, 28); // File name length
    cd.writeUInt16LE(0, 30);             // Extra field length
    cd.writeUInt16LE(0, 32);             // Comment length
    cd.writeUInt16LE(0, 34);             // Disk number start
    cd.writeUInt16LE(0, 36);             // Internal file attributes
    cd.writeUInt32LE(0, 38);             // External file attributes
    cd.writeUInt32LE(rec.offset, 42);    // Relative offset of local header

    buffers.push(cd, rec.nameBuf);
    centralDirSize += 46 + rec.nameBuf.length;
  }

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);     // EOCD signature
  eocd.writeUInt16LE(0, 4);              // Disk number
  eocd.writeUInt16LE(0, 6);              // Disk where central directory starts
  eocd.writeUInt16LE(fileRecords.length, 8);  // Number of central directory records on this disk
  eocd.writeUInt16LE(fileRecords.length, 10); // Total number of central directory records
  eocd.writeUInt32LE(centralDirSize, 12);     // Size of central directory
  eocd.writeUInt32LE(centralDirStart, 16);    // Offset of start of central directory
  eocd.writeUInt16LE(0, 20);                  // ZIP file comment length

  buffers.push(eocd);
  return Buffer.concat(buffers);
}
