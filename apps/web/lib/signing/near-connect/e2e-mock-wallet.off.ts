// What `pot-e2e-mock-wallet` resolves to in every normal build (next.config.ts resolveAlias): no mock wallet code at
// all. Only a local Playwright build with NEXT_PUBLIC_E2E_MOCK_WALLET=1 gets ./e2e-mock-wallet.ts.
export function mockConnector(): never {
  throw new Error("the e2e mock wallet is not part of this build")
}
