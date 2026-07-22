import { assert, describe, it } from "@effect/vitest";
import { AuthFailure, createAuthService } from "../auth-service.js";
import { createInMemoryStore } from "../in-memory-store.js";
import { createTcTelecomSmsSender } from "./sms.js";

const phone = { e164: "+77078297466" };

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status });

const captureRejection = async (run: () => Promise<unknown>): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  assert.fail("expected the promise to reject");
};

describe("createTcTelecomSmsSender", () => {
  it("posts an OTP message to the TC Telecom messages endpoint", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const sender = createTcTelecomSmsSender({
      apiKey: "test-key",
      senderId: "TC_INFO",
      baseUrl: "https://sms.example/api/v1",
      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} });
        return jsonResponse(202, {
          error: false,
          data: { messageId: "m1", transactionId: "t1", channel: 1 },
        });
      },
    });

    await sender.sendOtp(phone, "123456");

    assert.strictEqual(requests.length, 1);
    const request = requests[0];
    assert.ok(request);
    assert.strictEqual(request.url, "https://sms.example/api/v1/messages");
    assert.strictEqual(request.init.method, "POST");
    assert.strictEqual(
      new Headers(request.init.headers).get("x-api-key"),
      "test-key",
    );
    assert.deepStrictEqual(JSON.parse(String(request.init.body)), {
      channel: 1,
      contact: "77078297466",
      isOtp: true,
      payload: { text: "Ваш код подтверждения 123456" },
      senderId: "TC_INFO",
    });
  });

  it("throws when the gateway reports an error body", async () => {
    const sender = createTcTelecomSmsSender({
      apiKey: "test-key",
      senderId: "TC_INFO",
      baseUrl: "https://sms.example/api/v1",
      fetchImpl: async () =>
        jsonResponse(200, {
          error: true,
          data: { requestId: "r1", message: "invalid sender" },
        }),
    });

    const error = await captureRejection(() => sender.sendOtp(phone, "123456"));
    assert.match(String(error), /invalid sender/);
  });

  it("throws on non-2xx responses", async () => {
    const sender = createTcTelecomSmsSender({
      apiKey: "bad-key",
      senderId: "TC_INFO",
      baseUrl: "https://sms.example/api/v1",
      fetchImpl: async () => new Response("Unauthorized", { status: 401 }),
    });

    const error = await captureRejection(() => sender.sendOtp(phone, "123456"));
    assert.match(String(error), /401/);
  });
});

describe("requestOtp with an SMS sender", () => {
  it("delivers the generated code through the sender", async () => {
    const sent: { e164: string; code: string }[] = [];
    const auth = createAuthService(createInMemoryStore(), {
      otpSecret: "otp-secret",
      tokenSecret: "token-secret",
      exposeDevCode: true,
      smsSender: {
        name: "capture",
        sendOtp: async (to, code) => {
          sent.push({ e164: to.e164, code });
        },
      },
    });

    const result = await auth.requestOtp(phone);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0]?.e164, phone.e164);
    assert.strictEqual(sent[0]?.code, result.devCode);
  });

  it("maps sender failures to a retryable AuthFailure", async () => {
    const auth = createAuthService(createInMemoryStore(), {
      otpSecret: "otp-secret",
      tokenSecret: "token-secret",
      smsSender: {
        name: "broken",
        sendOtp: async () => {
          throw new Error("gateway down");
        },
      },
    });

    const error = await captureRejection(() => auth.requestOtp(phone));
    assert.instanceOf(error, AuthFailure);
    assert.strictEqual((error as AuthFailure).status, 502);
    assert.match((error as AuthFailure).message, /Failed to send SMS/);
  });
});
