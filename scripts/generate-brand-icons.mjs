import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const source = path.join(root, "public", "brand", "argos-dog-logo.png");
const iconSource = path.join(root, "public", "brand", "argos-dog-favicon.png");


async function icon(size) { return sharp(iconSource).resize(size, size).png().toBuffer(); }

function ico(pngs) {
  const header = Buffer.alloc(6 + pngs.length * 16);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, buffer }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2); header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(buffer.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += buffer.length;
  });
  return Buffer.concat([header, ...pngs.map(({ buffer }) => buffer)]);
}

await sharp(source).png().toFile(path.join(root, "public", "arcbot.png"));
await sharp(path.join(root, "public", "brand", "argos-social-banner.jpg")).png().toFile(path.join(root, "public", "arcbot-banner.png"));
const sizes = new Map();
for (const size of [16, 32, 48, 180, 192, 512]) sizes.set(size, await icon(size));
await Promise.all([
  writeFile(path.join(root, "public", "favicon.png"), sizes.get(32)),
  writeFile(path.join(root, "public", "faviconlarge.png"), sizes.get(192)),
  writeFile(path.join(root, "public", "favicon.ico"), ico([16, 32, 48].map((size) => ({ size, buffer: sizes.get(size) })))),
  writeFile(path.join(root, "app", "icon.png"), sizes.get(512)),
  writeFile(path.join(root, "app", "apple-icon.png"), sizes.get(180)),
]);

console.log("Generated Argos Bot favicon and app icons.");
