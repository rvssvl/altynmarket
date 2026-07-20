import type { AuthSession } from "@altyn-market/domain";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { BackendDependencies } from "./application-services.js";
import { AuthFailure, type AuthService } from "./auth-service.js";
import { createEffectRpcHandler } from "./effect-rpc.js";
import {
  createProductImageStorage,
  maxProductImageUploadBodyBytes,
  type ProductImageStorage,
} from "./product-image-storage.js";
import type { RealtimeBus } from "./realtime.js";

export interface HttpApiServer {
  readonly start: (port: number) => Promise<void>;
  readonly dispose: () => Promise<void>;
}

export const createHttpApiServer = (
  dependencies: BackendDependencies,
): HttpApiServer => {
  const { auth, realtime } = dependencies;
  const publicMediaBaseUrl =
    process.env.PUBLIC_MEDIA_BASE_URL ?? process.env.PUBLIC_API_BASE_URL;
  const productImageStorage = createProductImageStorage({
    ...(process.env.UPLOAD_DIR ? { directory: process.env.UPLOAD_DIR } : {}),
    ...(publicMediaBaseUrl ? { publicBaseUrl: publicMediaBaseUrl } : {}),
  });
  const rpc = createEffectRpcHandler(dependencies, { productImageStorage });

  return {
    dispose: () => rpc.dispose(),
    start: async (port) => {
      const server = createServer((request, response) => {
        const url = new URL(
          request.url ?? "/",
          `http://${request.headers.host ?? "localhost"}`,
        );

        response.setHeader(
          "Access-Control-Allow-Origin",
          resolveCorsOrigin(request.headers.origin, process.env.WEB_ORIGIN),
        );
        response.setHeader("Vary", "Origin");
        response.setHeader(
          "Access-Control-Allow-Methods",
          "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        );
        response.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type,Authorization",
        );

        if (request.method === "OPTIONS") {
          response.writeHead(204);
          response.end();
          return;
        }

        // Effect RPC clients post to "<base>/rpc/" (the protocol joins the
        // configured URL with an empty path segment), so accept both forms.
        if (url.pathname === "/rpc" || url.pathname === "/rpc/") {
          void handleEffectRpc(rpc.handler, request, response, url);
          return;
        }

        if (url.pathname === "/health") {
          sendJson(response, 200, {
            ok: true,
            service: "altyn-market-api",
            environment: process.env.NODE_ENV ?? "development",
          });
          return;
        }

        if (request.method === "GET" && url.pathname === "/realtime") {
          void handleRealtime(auth, realtime, request, response, url);
          return;
        }

        void handleProductImage(productImageStorage, request, response, url);
        return;
      });

      await new Promise<void>((resolve) => {
        server.listen(port, "0.0.0.0", resolve);
      });

      console.log(`Altyn Market API listening on :${port}`);
    },
  };
};

const maxRpcBodyBytes = maxProductImageUploadBodyBytes + 65_536;

const handleEffectRpc = async (
  handler: (request: Request) => Promise<Response>,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<void> => {
  try {
    const webResponse = await handler(
      new Request(url, {
        method: request.method ?? "POST",
        headers: toWebHeaders(request.headers),
        ...(request.method === "GET" || request.method === "HEAD"
          ? {}
          : { body: await readRpcBody(request) }),
      }),
    );

    webResponse.headers.forEach((value, name) => {
      response.setHeader(name, value);
    });
    response.writeHead(webResponse.status);
    response.end(Buffer.from(await webResponse.arrayBuffer()));
  } catch {
    sendJson(response, 500, { error: "RPC request failed." });
  }
};

const toWebHeaders = (headers: IncomingMessage["headers"]): Headers => {
  const result = new Headers();

  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        result.append(name, item);
      }
      continue;
    }

    result.set(name, value);
  }

  return result;
};

const readRpcBody = async (request: IncomingMessage): Promise<ArrayBuffer> => {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.byteLength;

    if (size > maxRpcBodyBytes) {
      throw new Error("RPC request body is too large.");
    }

    chunks.push(value);
  }

  const body = Buffer.concat(chunks);
  const bytes = new Uint8Array(body.byteLength);
  bytes.set(body);
  return bytes.buffer;
};

const resolveCorsOrigin = (
  requestOrigin: string | undefined,
  configuredOrigins: string | undefined,
): string => {
  if (!configuredOrigins) {
    return "*";
  }

  const origins = configuredOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.includes("*")) {
    return "*";
  }

  if (requestOrigin && origins.includes(requestOrigin)) {
    return requestOrigin;
  }

  return origins[0] ?? "null";
};

const handleRealtime = async (
  auth: AuthService,
  realtime: RealtimeBus,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<void> => {
  try {
    await requireSession(auth, request, url);
  } catch (error) {
    if (error instanceof AuthFailure) {
      sendJson(response, error.status, { error: error.message });
      return;
    }
    throw error;
  }

  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  response.write(": connected\n\n");

  const unsubscribe = realtime.subscribe((event) => {
    response.write(`event: ${event.type}\n`);
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  request.on("close", unsubscribe);
};

const handleProductImage = async (
  productImageStorage: ProductImageStorage,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<void> => {
  try {
    const productImageMatch = url.pathname.match(
      /^\/uploads\/products\/(?<fileName>[^/]+)$/,
    );
    if (request.method === "GET" && productImageMatch?.groups?.fileName) {
      const image = await productImageStorage.read(
        decodeURIComponent(productImageMatch.groups.fileName),
      );
      if (!image) {
        sendJson(response, 404, { error: "Image not found." });
        return;
      }

      sendImage(response, image.content, image.contentType);
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    console.error("Image request failed", error);
    sendJson(response, 500, { error: "Internal server error." });
  }
};

const requireSession = async (
  auth: AuthService,
  request: IncomingMessage,
  url: URL,
): Promise<AuthSession> => {
  const token =
    parseOptionalBearerToken(request.headers.authorization) ??
    url.searchParams.get("access_token") ??
    undefined;

  if (!token) {
    throw new AuthFailure("Missing bearer token.");
  }

  return auth.getCurrentSession(token);
};

const parseOptionalBearerToken = (
  authorization: string | undefined,
): string | undefined =>
  authorization?.match(/^Bearer (?<token>.+)$/i)?.groups?.token;

const sendJson = (
  response: ServerResponse,
  status: number,
  body: unknown,
): void => {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
};

const sendImage = (
  response: ServerResponse,
  content: Buffer,
  contentType: "image/jpeg" | "image/png" | "image/webp",
): void => {
  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Length": String(content.length),
    "X-Content-Type-Options": "nosniff",
  });
  response.end(content);
};
