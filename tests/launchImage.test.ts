import { beforeEach, expect, it, vi } from "vitest";
import sharp from "sharp";
const m = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../lib/fetch-public-image", () => ({ fetchPublicImage: m.fetch }));
import { launchImageURI, launchImageSource } from "../lib/launches/image";
import { verifyLaunchImage } from "../lib/launches/image-preflight";
import { parseLaunchInput } from "../lib/launches/input";
const photo = "https://pbs.twimg.com/media/Example-Photo?format=jpg&name=large";
const thumbnail="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTxSXfJ1OwltWjWWusU8jPpOnyQAdr1uGXjhmoz5QBLdQ&s=10";
beforeEach(() => vi.resetAllMocks());
it("accepts the selected Google thumbnail while rejecting redirects and alternate hosts",()=>{
  expect(launchImageURI(thumbnail)).toBe(new URL(thumbnail).toString());
  expect(parseLaunchInput({name:"test",symbol:"TEST",imageURI:thumbnail}).imageURI).toBe(new URL(thumbnail).toString());
  for(const value of [thumbnail+"&url=https://localhost",thumbnail.replace("gstatic.com","gstatic.com.evil.test"),thumbnail+"&q=tbn:duplicate",thumbnail.replace("/images?","/redirect?")])
    expect(()=>launchImageURI(value)).toThrow();
});
it("accepts API photo and profile photo URLs without changing the selected artwork", () => {
  expect(launchImageURI(photo)).toBe(photo);
  const profile = "https://pbs.twimg.com/profile_images/2098226697560625155/V-fOj5yJ_400x400.jpg";
  expect(parseLaunchInput({ name: "Example", symbol: "EX", imageURI: profile }).imageURI).toBe(profile);
  expect(launchImageSource(profile)).toBe(profile);
  expect(launchImageSource("ipfs://Qm" + "a".repeat(44))).toBe("https://ipfs.io/ipfs/Qm" + "a".repeat(44));
});
it.each([
  "http://pbs.twimg.com/media/a.jpg", "https://127.0.0.1/a.png", "https://pbs.twimg.com.evil.test/media/a.jpg",
  "https://user:password@pbs.twimg.com/media/a.jpg", "https://pbs.twimg.com:444/media/a.jpg",
  "https://pbs.twimg.com/media/a.svg", "https://pbs.twimg.com/media/a.jpg?redirect=https://localhost",
  "https://pbs.twimg.com/media/a?format=svg", "https://pbs.twimg.com/media/a?name=orig&name=large",
  "https://pbs.twimg.com/media/a.jpg#fragment", "https://x.com/example/status/123", "data:image/png;base64,AA==",
])("rejects unsupported image source %s", value => expect(() => launchImageURI(value)).toThrow());
it("verifies actual decoded image bytes and returns their digest", async () => {
  const bytes = await sharp({ create: { width: 32, height: 24, channels: 4, background: "red" } }).png().toBuffer();
  m.fetch.mockResolvedValue({ bytes, contentType: "image/png" });
  expect(await verifyLaunchImage(photo)).toMatchObject({ imageURI: photo, width: 32, height: 24, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
  expect(m.fetch).toHaveBeenCalledWith(photo);
});
it("rejects HTML even when the server claims it is an image", async () => {
  m.fetch.mockResolvedValue({ bytes: Buffer.from("<html>error</html>"), contentType: "image/png" });
  await expect(verifyLaunchImage(photo)).rejects.toMatchObject({ code: "IMAGE_UNAVAILABLE" });
});
it("reports a failed download without leaking errors or substituting a logo", async () => {
  m.fetch.mockRejectedValue(Error("private provider information"));
  await expect(verifyLaunchImage(photo)).rejects.toThrow("The launch image could not be verified.");
});
it("rejects unsafe input before fetching", async () => {
  await expect(verifyLaunchImage("https://localhost/key")).rejects.toMatchObject({ code: "IMAGE_UNAVAILABLE" });
  expect(m.fetch).not.toHaveBeenCalled();
});
