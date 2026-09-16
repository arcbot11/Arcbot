import sharp from "sharp";
import { createHash } from "node:crypto";
import { fetchPublicImage } from "../fetch-public-image";
import { launchImageSource, launchImageURI } from "./image";
import { LaunchError } from "./policy";

export type LaunchImageEvidence = { imageURI: string; width: number; height: number; sha256: string };

/** Read-only. Bounded download, pinned public DNS, real decoding; never a fallback logo. */
async function validateLaunchImage(uri: string) {
  try {
    const imageURI = launchImageURI(uri);
    const { bytes } = await fetchPublicImage(launchImageSource(imageURI));
    const decoder = sharp(bytes, { limitInputPixels: 16_777_216, failOn: "warning" });
    const metadata = await decoder.metadata();
    if (!metadata.width || !metadata.height || !["png", "jpeg", "webp", "gif", "avif"].includes(metadata.format ?? "")
      || (metadata.pages ?? 1) > 1) throw Error("Unsupported image");
    await decoder.raw().toBuffer();
    return { imageURI, width: metadata.width, height: metadata.height,
      sha256: createHash("sha256").update(bytes).digest("hex") };
  } catch {
    throw new LaunchError("IMAGE_UNAVAILABLE", "The launch image could not be verified. Use a working static X photo or IPFS image.");
  }
}
const pending=new Map<string,Promise<LaunchImageEvidence>>();
/** Share concurrent downloads only. Later signing checks always read fresh bytes. */
export function verifyLaunchImage(uri:string){
  const existing=pending.get(uri);if(existing)return existing;
  const work=validateLaunchImage(uri);
  if(pending.size<32){pending.set(uri,work);void work.finally(()=>pending.delete(uri)).catch(()=>undefined);}
  return work;
}
