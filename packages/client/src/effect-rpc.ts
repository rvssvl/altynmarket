import {
  AltynMarketRpcs,
  RpcAuthentication,
  RpcUnauthorized,
} from "@altyn-market/domain";
import { Context, Effect, Layer } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as Headers from "effect/unstable/http/Headers";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError";
import * as RpcMiddleware from "effect/unstable/rpc/RpcMiddleware";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";

export interface AccessTokenProvider {
  readonly getAccessToken: () => Promise<string | undefined>;
}

class RpcAccessToken extends Context.Service<
  RpcAccessToken,
  {
    readonly get: Effect.Effect<string, RpcUnauthorized>;
  }
>()("@altyn-market/client/RpcAccessToken") {}

export class AltynMarketRpcClient extends Context.Service<
  AltynMarketRpcClient,
  RpcClient.FromGroup<typeof AltynMarketRpcs, RpcClientError>
>()("@altyn-market/client/AltynMarketRpcClient") {}

const accessTokenLayer = (provider: AccessTokenProvider) =>
  Layer.succeed(
    RpcAccessToken,
    RpcAccessToken.of({
      get: Effect.tryPromise({
        try: async () => {
          const token = await provider.getAccessToken();
          if (!token) {
            throw new Error("No access token is available.");
          }
          return token;
        },
        catch: () =>
          new RpcUnauthorized({
            message: "A valid session is required.",
          }),
      }),
    }),
  );

const authenticationLayer = RpcMiddleware.layerClient(
  RpcAuthentication,
  ({ next, request }) =>
    Effect.gen(function* () {
      const accessToken = yield* RpcAccessToken;
      const token = yield* accessToken.get;
      return yield* next({
        ...request,
        headers: Headers.set(
          request.headers,
          "authorization",
          `Bearer ${token}`,
        ),
      });
    }),
);

export const makeAltynMarketRpcClientLayer = (options: {
  readonly rpcUrl: string;
  readonly accessToken: AccessTokenProvider;
}) =>
  Layer.effect(AltynMarketRpcClient, RpcClient.make(AltynMarketRpcs)).pipe(
    Layer.provide(
      RpcClient.layerProtocolHttp({ url: options.rpcUrl }).pipe(
        Layer.provide(FetchHttpClient.layer),
        Layer.provide(
          Layer.succeed(
            RpcSerialization.RpcSerialization,
            RpcSerialization.json,
          ),
        ),
        Layer.provideMerge(
          authenticationLayer.pipe(
            Layer.provide(accessTokenLayer(options.accessToken)),
          ),
        ),
      ),
    ),
  );
