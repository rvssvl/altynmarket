import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createProductImageStorage,
  ProductImageValidationError,
} from "./product-image-storage.js";

const onePixelPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL0WQAAAABJRU5ErkJggg==";

describe("product image storage", () => {
  it("stores verified product images and serves them by generated file name", async () => {
    const directory = await mkdtemp(join(tmpdir(), "altyn-market-images-"));
    try {
      const storage = createProductImageStorage({
        directory,
        publicBaseUrl: "https://api.example.kz/",
      });

      const stored = await storage.saveBase64(onePixelPng);
      const image = await storage.read(stored.fileName);

      expect(stored.url).toBe(
        `https://api.example.kz/uploads/products/${stored.fileName}`,
      );
      expect(stored.contentType).toBe("image/png");
      expect(stored.fileName).toMatch(/^[a-f0-9-]{36}\.png$/);
      expect(image?.contentType).toBe("image/png");
      expect(image?.content.length).toBeGreaterThan(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects unsafe file data and unknown file names", async () => {
    const storage = createProductImageStorage();

    await expect(
      storage.saveBase64(Buffer.from("not-an-image").toString("base64")),
    ).rejects.toBeInstanceOf(ProductImageValidationError);
    await expect(storage.read("../../secrets.png")).resolves.toBeUndefined();
  });
});
