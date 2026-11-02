// Gifts (notes/gifts-plan.md, notes/backend.md "Gifts (2026-11-02)"): anyone can send a Pot a gift. Server side:
// gift links, the public gift page, starting a gift (its ref), the relayer's pre-flight and the received hook.
export { createGiftChain, parseGetGifts, parseGiftsView, type GiftChain, type GiftsOnChain } from "./chain"
export { assertGiftsOn, chargePublicRead, giftLimit, giftsEnabled, type GiftDeps } from "./core"
export { giftDeps, setGiftChainForTests } from "./deps"
export { myGifts, patchGift, startGift } from "./giver"
export { createGiftLink, listGiftLinks, listPotGifts, putGiftPage, revokeGiftLink } from "./members"
export { resolveGiftLanding, resolveGiftPage } from "./public"
export { onGiftReceived, type GiftReceivedEvent, type GiftReceivedResult } from "./received"
export { giftRefValidator, markGiftFailed, validateGiftRef, type GiftRefQuery } from "./validate"
