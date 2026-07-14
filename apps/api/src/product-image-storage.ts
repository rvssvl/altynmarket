import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const maxProductImageBytes = 5 * 1024 * 1024;
export const maxProductImageUploadBodyBytes =
  Math.ceil((maxProductImageBytes * 4) / 3) + 1024;

export interface ProductImageStorageOptions {
  readonly directory?: string;
  readonly publicBaseUrl?: string;
}

export interface StoredProductImage {
  readonly fileName: string;
  readonly url: string;
  readonly contentType: ProductImageContentType;
  readonly sizeBytes: number;
}

export interface ReadProductImage {
  readonly content: Buffer;
  readonly contentType: ProductImageContentType;
}

export type ProductImageContentType = "image/jpeg" | "image/png" | "image/webp";

export class ProductImageValidationError extends Error {}

export interface ProductImageStorage {
  readonly saveBase64: (dataBase64: string) => Promise<StoredProductImage>;
  readonly read: (fileName: string) => Promise<ReadProductImage | undefined>;
}

export const createProductImageStorage = (
  options: ProductImageStorageOptions = {},
): ProductImageStorage => {
  const directory = options.directory ?? join(tmpdir(), "altyn-market-uploads");
  const publicBaseUrl = options.publicBaseUrl?.replace(/\/$/, "") ?? "";

  return {
    saveBase64: async (dataBase64) => {
      const content = decodeBase64Image(dataBase64);
      const contentType = detectProductImageType(content);

      if (!contentType) {
        throw new ProductImageValidationError(
          "Only PNG, JPEG, and WebP images are supported.",
        );
      }

      const fileName = `${randomUUID()}.${extensionFor(contentType)}`;
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, fileName), content, { flag: "wx" });

      const publicPath = `/uploads/products/${fileName}`;
      return {
        fileName,
        url: `${publicBaseUrl}${publicPath}`,
        contentType,
        sizeBytes: content.length,
      };
    },
    read: async (fileName) => {
      const contentType = contentTypeForFileName(fileName);
      if (!contentType) {
        return undefined;
      }

      try {
        return {
          content: await readFile(join(directory, fileName)),
          contentType,
        };
      } catch (error) {
        if (isMissingFile(error)) {
          return undefined;
        }
        throw error;
      }
    },
  };
};

const decodeBase64Image = (dataBase64: string): Buffer => {
  const normalized = dataBase64.trim();
  if (
    !normalized ||
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)
  ) {
    throw new ProductImageValidationError("Invalid image upload.");
  }

  const content = Buffer.from(normalized, "base64");
  if (content.length === 0) {
    throw new ProductImageValidationError("Image upload is empty.");
  }
  if (content.length > maxProductImageBytes) {
    throw new ProductImageValidationError("Image must be 5 MB or smaller.");
  }

  return content;
};

const detectProductImageType = (
  content: Buffer,
): ProductImageContentType | undefined => {
  if (
    content.length >= 3 &&
    content[0] === 0xff &&
    content[1] === 0xd8 &&
    content[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    content.length >= 8 &&
    content[0] === 0x89 &&
    content[1] === 0x50 &&
    content[2] === 0x4e &&
    content[3] === 0x47 &&
    content[4] === 0x0d &&
    content[5] === 0x0a &&
    content[6] === 0x1a &&
    content[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    content.length >= 12 &&
    content.toString("ascii", 0, 4) === "RIFF" &&
    content.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return undefined;
};

const extensionFor = (contentType: ProductImageContentType): string =>
  contentType === "image/jpeg"
    ? "jpg"
    : contentType === "image/png"
      ? "png"
      : "webp";

const contentTypeForFileName = (
  fileName: string,
): ProductImageContentType | undefined => {
  if (!/^[a-f0-9-]{36}\.jpg$/.test(fileName)) {
    if (!/^[a-f0-9-]{36}\.png$/.test(fileName)) {
      return /^[a-f0-9-]{36}\.webp$/.test(fileName) ? "image/webp" : undefined;
    }
    return "image/png";
  }
  return "image/jpeg";
};

const isMissingFile = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "ENOENT";
