const realFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: any) => {
  const url = input instanceof Request ? input.url : String(input);
  console.log("FETCH:", init?.method ?? (input instanceof Request ? input.method : "GET"), JSON.stringify(url));
  return realFetch(input, init);
};

const { createAuthClient } = await import("@altyn-market/client");
const authClient = createAuthClient("https://admin-staging.altyn-market.kz");
const outcome = await Promise.race([
  authClient.requestOtp("+77474150198").then(
    (result) => ["OK", result] as const,
    (error) => ["FAIL", String(error)] as const,
  ),
  new Promise<readonly [string, string]>((resolve) =>
    setTimeout(() => resolve(["TIMEOUT", "20s"] as const), 20000),
  ),
]);
console.log(...outcome);
process.exit(0);
