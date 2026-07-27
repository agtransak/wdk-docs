# Smart Deposit Address (SDA) Provider Interface

## Links

| Resource | URL |
|----------|-----|
| **npm — base package** | https://www.npmjs.com/package/@tetherto/wdk-wallet |
| **GitHub** | https://github.com/tetherto/wdk-wallet |
| **Docs** | https://docs.wdk.tether.io/sdk/sda-modules |

## Release Boundary

- `SdaProtocol`, `ISdaProtocol`, and the SDA types are exported from `@tetherto/wdk-wallet/protocols`.
- `@tetherto/wdk-wallet` supplies the interface and abstract base class, not a concrete SDA provider.
- The currently released `@tetherto/wdk` orchestrator has no SDA-specific protocol bucket, getter, or documented registration flow. Use a concrete provider directly according to its documentation.

```typescript
import {
  SdaProtocol,
  type ISdaProtocol,
  type SdaRoute,
  type SdaDepositAddress,
  type SdaTransfer
} from '@tetherto/wdk-wallet/protocols'
```

## Required Provider Methods

- `getSupportedRoutes(options?)` discovers supported route combinations.
- `createDepositAddress(options)` creates one descriptor per distinct address and activates it when the provider has an activation lifecycle.

All other base methods throw `UnsupportedOperationError` until a provider implements them:

- `quoteDeposit`
- `deriveDepositAddress`
- `getDepositAddress`
- `renewDepositAddress`
- `getTransfers`
- `getTransfersByRecipient`
- `getTransfer`
- `recoverDepositAddress`
- `disableDepositAddress`

## Key Type Facts

- `Blockchain` is `string | number`.
- Route discovery filters can include `sourceChain`, `sourceToken`, `destinationChain`, and `outputAsset`.
- A route contains `sourceChains`, `inputTokens`, and `destinationChain`; output asset, limits, reuse, and estimated duration are optional.
- Quote input and output amounts are base-unit values. Quote fees are itemized and the rate is a string. Quotes are non-binding.
- `createDepositAddress()` accepts `sourceChains` and `destinationChain`, plus optional `outputAsset` and `destinationAddress`.
- If `destinationAddress` is omitted, the bound account address is used. Without a bound account, the contract throws `ValueError`.
- `deriveDepositAddress()` is client-side only. It does not activate the address or cause provider monitoring.
- `SdaTransfer` guarantees only `{ id, status }`. Do not assume portable amount, hash, or timestamp fields.
- Status values are `pending`, `detected`, `processing`, `completed`, `failed`, `refund-pending`, `refunded`, and `expired`.
- Transfer-history options can filter by `sourceChain` or status and paginate with `limit` and `skip`.
- Recovery accepts either `{ id }` or `{ address, sourceChain? }`. Its result status is `reindexed`, `pending`, or `failed`, with optional address, SDA id, transfer, and message fields.

## Lifecycle and Safety

- Validate every returned descriptor against the intended route and recipient before showing or funding the address.
- Address creation does not move funds.
- Treat `UnsupportedOperationError` as an unsupported provider capability.
- Treat `NoSuchElementError` as a missing address or transfer, not a retryable transport error.
- `createDepositAddress`, `renewDepositAddress`, `recoverDepositAddress`, and `disableDepositAddress` can alter provider-side state and require explicit user confirmation before invocation.
- Read-only discovery, quoting, lookup, and history methods do not move funds. A later deposit is a separate wallet action and requires the normal transaction confirmation checks.
