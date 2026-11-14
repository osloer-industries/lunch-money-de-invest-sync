import { describe, expect, it } from "vitest";
import type { SetupFilesystem } from "../setup/types.js";
import { readMapsFromFilesystem, writeMapsToFilesystem } from "./mapping-store.js";

function memoryFilesystem(initial: string): SetupFilesystem & { writes: string[] } {
  let text = initial;
  const writes: string[] = [];
  return {
    writes,
    exists: () => true,
    readText: () => text,
    writeText(_path, content) {
      text = content;
      writes.push(content);
      return Promise.resolve();
    },
    chmod: () => Promise.resolve(),
  };
}

describe("mapping-store", () => {
  it("round-trips maps through config.json without touching other keys", async () => {
    const filesystem = memoryFilesystem(
      JSON.stringify({ tradeRepublicProfiles: [], categoryMap: { sell: 1 }, lunchMoneyApiKey: "secret" }),
    );
    const initial = readMapsFromFilesystem(filesystem);
    expect(initial.categoryMap.sell).toBe(1);

    const next = {
      categoryMap: { sell: 1, deposit: 9 },
      tagMap: { deposit: ["transfer"] },
    };
    await writeMapsToFilesystem(filesystem, next);
    const saved = JSON.parse(filesystem.writes[0] ?? "{}");
    expect(saved.categoryMap).toEqual({ sell: 1, deposit: 9 });
    expect(saved.tagMap).toEqual({ deposit: ["transfer"] });
    expect(saved.tradeRepublicProfiles).toEqual([]);
    expect(saved.lunchMoneyApiKey).toBe("secret");
  });
});