/** Pure validation shared by drafts, X media preparation and the review UI. */
export function launchImageURI(raw: string): string {
  const value = raw.trim();
  if (/^ipfs:\/\/(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,120})$/.test(value)) return value;
  if (value.length > 512 || /[\s\\]/.test(value)) throw Error("Use an X photo URL or a pinned IPFS image URI.");
  const u = new URL(value);
  if (u.protocol !== "https:" || u.hostname !== "pbs.twimg.com" || u.username || u.password || u.port || u.hash
    || !/^\/(media\/[A-Za-z0-9_-]+|profile_images\/[0-9]+\/[A-Za-z0-9_-]+)(\.(jpg|jpeg|png|webp))?$/.test(u.pathname)
    || [...u.searchParams.keys()].some(key => key !== "format" && key !== "name")
    || (u.searchParams.has("format") && !/^(jpg|jpeg|png|webp)$/.test(u.searchParams.get("format")!))
    || (u.searchParams.has("name") && !/^(orig|large|medium|small|thumb|[0-9]+x[0-9]+)$/.test(u.searchParams.get("name")!))
    || [...u.searchParams.keys()].some(key => u.searchParams.getAll(key).length !== 1))
    throw Error("Use an X photo URL or a pinned IPFS image URI.");
  return u.toString();
}

export function launchImageSource(uri: string): string {
  const value = launchImageURI(uri);
  return value.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${value.slice(7)}` : value;
}
