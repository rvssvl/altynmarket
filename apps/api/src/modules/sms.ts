import type { PhoneNumber } from "@altyn-market/domain";

export interface SmsSender {
  readonly name: string;
  readonly sendOtp: (phone: PhoneNumber, code: string) => Promise<void>;
}

export interface TcTelecomSmsConfig {
  readonly apiKey: string;
  readonly senderId: string;
  readonly baseUrl: string;
  readonly fetchImpl?: typeof fetch;
}

const tcTelecomSmsChannel = 1;

export const createConsoleSmsSender = (): SmsSender => ({
  name: "console",
  sendOtp: async (phone, code) => {
    console.log(`OTP for ${phone.e164}: ${code}`);
  },
});

export const createTcTelecomSmsSender = (
  config: TcTelecomSmsConfig,
): SmsSender => {
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    name: "tc_telecom",
    sendOtp: async (phone, code) => {
      const response = await fetchImpl(`${config.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": config.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          channel: tcTelecomSmsChannel,
          contact: phone.e164.replace(/^\+/, ""),
          isOtp: true,
          payload: { text: `Ваш код подтверждения ${code}` },
          senderId: config.senderId,
        }),
      });

      const body = (await response.json().catch(() => undefined)) as
        | {
            error?: boolean;
            data?: { messageId?: string; message?: string };
          }
        | undefined;

      if (!response.ok || body?.error) {
        throw new Error(
          `TC Telecom SMS send failed (${response.status}): ${
            body?.data?.message ?? "no error message"
          }`,
        );
      }
    },
  };
};
