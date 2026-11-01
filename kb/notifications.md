# Notifications (server side): Web Push, email, Telegram bot
> Owner: infra. Last verified: 2026-10-21. Legend: ✅ verified · 📄 docs-only · ⚠️ unverified/conflicting

Scope: what the **server** sends and how. The service worker, permission UX, iOS install flow and `PushManager.subscribe` are client-side and live in [pwa-push.md](pwa-push.md) (owner: web). Hosting, queues and the DB are in [backend-infra.md](backend-infra.md).

## TL;DR
- **Web Push uses `web-push` 3.6.7 in a Node route handler** ✅.
  - There has been no npm release since 2024-01-16, but master is active (commits to Sep 2026).
  - It needs `node:crypto`/`https`, which is fine because **Next.js ≥ 16.3 no longer supports `runtime = 'edge'`**. Everything runs on Node 📄.
  - Encoding is `aes128gcm` (RFC 8291).
- **Payload budget: keep the JSON at or below 2,500 bytes.**
  - The hard maximum is 3,993 B plaintext, which fills a 4,096 B body ✅ measured.
  - Firefox for Android goes through an FCM bridge capped at a 2,744 B body (= 2,641 B plaintext) 📄✅.
  - `web-push` does **not** enforce the limit, so check it yourself ✅.
- **Use the Declarative Web Push JSON** (`{"web_push":8030,"notification":{title,navigate,...}}`) for every push.
  - Safari 18.4+ (iOS/iPadOS Home Screen apps) and macOS Safari 18.5 display it without the service worker.
  - Chrome and Firefox have **not** shipped it ✅ (MDN BCD `false`; Firefox bug 1935325 is still NEW). The service worker must parse the same JSON and call `showNotification` → web.
- **On 404/410, delete the subscription.** On 429, honour `Retry-After` (default 60 s). On 413, shrink the payload. 403 means VAPID or JWT trouble.
- **VAPID rules:**
  - `VAPID_SUBJECT` must be a real `mailto:` or `https:` URL. Apple returns `403 BadJwtToken` for localhost subjects 📄.
  - **Never rotate the VAPID keys.** Existing subscriptions are bound to the public key.
- **Fan-out runs in `after()` after the triggering request**, with a concurrency of 20–50.
  - CPU cost is about 0.06–0.14 ms per send ✅, so it is network-bound. A few dozen endpoints take about 1 s.
  - Dedupe per event and user in Postgres (`notification_log` unique key).
- **Email: Resend Free** — 3,000/month, **100/day** (each recipient counts), 3 domains, 10 req/s ✅📄.
  - Send from a subdomain (`notify.<domain>`).
  - DNS verification takes ~15 min and can take up to 72 h, so **a human must do it ≥ 3 days before Nov 1**.
  - Use `resend` 6.34.1 + `react-email` 6.11.3. **`@react-email/components` is deprecated** ✅.
- **Telegram: a plain bot is allowed.**
  - 📄✅ Blockchain Guidelines: "these rules **only apply** to Mini Apps and their bots… Regular Telegram bots that **do not** have a Mini App component are exempt" (re-read 2026-10-21; text unchanged since the 2025-09-18 snapshot).
  - **Never add any Mini App surface** (main app, `/newapp`, `web_app` buttons, web-app menu button). That would put the bot under ToS §7.4: "must not direct or link users… where cryptoassets not based on TON are promoted or utilized".
  - All bots still need a **privacy policy** (§4).
- **Telegram stack: grammY 1.46.0** (Bot API 10.3).
  - Use `webhookCallback(bot, "std/http", { secretToken })` in an App Router route ✅ (tested offline).
  - Use `url` buttons (not `web_app`).
  - Bind a group with `t.me/<bot>?startgroup=<one-time-token>`.
  - Limits: 20 messages/min per group, ~1 msg/s per chat 📄.
  - Point production at the production domain only. Preview URLs sit behind Vercel Authentication, and Telegram does not follow redirects.

## Plan check
| Claim in the original plan | Verdict |
|---|---|
| C2/TL;DR: "Use a plain Telegram bot (bots without Mini Apps are exempt) that links to the PWA" | ✅ **Confirmed.** Both the Guidelines and the Bot Developer ToS were re-read on 2026-10-21. Only Mini Apps are bound to TON; §7.4 "Mini Apps must not direct or link users…" is scoped to Mini Apps. ⚠️ Residual risks: §5.2(h) bans "regulated or questionable goods and services" (undefined), and adding any Mini App would bring the bot under §7. |
| C2: "`/newpot` returns a link; approval requests post to the group ('Maya wants $84… Approve in Pot →')" | ✅ Feasible with an InlineKeyboard `url` button. ⚠️ Group privacy mode is on by default, so members must type `/newpot@PotBot` unless the bot was the last bot to post. The `startgroup` deep link also works. |
| C2: "links say 'Open in Safari to install'" | ⚠️ Telegram 2026-06-11 blog: links "can be opened right in the Telegram Browser or in your preferred app". Test NEAR Auth sign-in in Telegram's in-app browser → web, auth. |
| C2: "Re-read the bot ToS first" | ✅ Done. There was no change to §7 since Sep 2025. Bot-wide clauses that apply: §4 privacy policy, §4.4 encryption at rest, §5.2(b) no unsolicited messages, §6.2 Stars-only for digital goods (don't sell anything through the bot). |
| C3 Phase 0: "register the bot with BotFather" | ⚠️ **Human action, not done.** See *BotFather steps*. Create two bots (prod and preview/staging). |
| P-10: "Push for 'needs your approval' and 'money arrived' on installed PWA; email fallback; bot posts" | ✅ Feasible on Vercel with no worker. iOS push requires a Home Screen install (→ web). |
| C6: `/api/notify` web push (VAPID), email, Telegram bot | ✅ **But split it.** Fan-out should be an internal server module called from `/api/relay`, the 1Click workflow and others, not a public endpoint. Public routes: `/api/push/subscribe`, `/api/push/unsubscribe`, `/api/telegram` (webhook). |
| C6 data model: `user(…, push_sub, tg_chat_id)` | ❌ **Corrected.** A user has **many** push subscriptions (one per device or browser; `endpoint` unique; deleted on 404/410). A Telegram **chat id belongs to a Pot** (the group), while a Telegram **user id** belongs to a user. See *Data model*. |
| C7 day 11: "Push, email, bot" | ⚠️ Code can wait until day 11, but **email DNS verification (up to 72 h) and BotFather setup must happen in Phase 0**. |

## Reference

### N1. Events → recipients → channels
These are proposals. Product-ux owns the copy, which must contain no crypto words (C5).

| Event (server trigger) | Recipients | Push (TTL / Urgency / Topic) | Telegram group | Email |
|---|---|---|---|---|
| `approval_needed`: a request went to vote (outcome of a relayed `request_spend`) | members with a vote, minus the requester | TTL = time to request expiry (24–72 h) / `high` / `req-<pot>-<id>` | post with a `url` button, store `message_id` | only if the user has no live push subscription |
| `request_resolved`: approved, declined or executed | requester (+ voters) | 1–24 h / `normal` / the same topic (replaces) | `editMessageText` on the stored message | no |
| `money_arrived`: contribution recorded (relayed `ft_transfer_call` outcome) | members (or just the organizer, product call) | 1–24 h / `normal` | optional | no |
| `deposit_status`: 1Click `SUCCESS` / `INCOMPLETE_DEPOSIT` / `REFUNDED` / `FAILED` / 20 min silent (workflow in backend-infra) | depositor | 24 h / `high` ("Your $150 arrived. Tap to add it to Lisbon Trip") | no | yes (money-related) |
| `member_joined` | organizer | 24 h / `low` | optional "Leo joined" | no |
| `pot_closed` | all members | 24 h / `normal` | post | yes |

Never put balances, account IDs or tx hashes in push or Telegram text. Use only the in-app deep link (`navigate` / `url`).

### N2. Web Push (server)
**Library.**
- `web-push` 3.6.7 ✅, `engines: node >= 16`.
- `sendNotification` throws `Error("'x' is an invalid option")` for anything outside `headers, gcmAPIKey, vapidDetails, TTL, contentEncoding, urgency, topic, proxy, agent, timeout` ✅ ([web-push-lib.js](https://github.com/web-push-libs/web-push/blob/master/src/web-push-lib.js)).
- Defaults ✅:
  - TTL is **2,419,200 s (28 days)**, so always set it.
  - Urgency is `normal`.
  - The VAPID JWT `exp` is now + 12 h.
  - Content-Type is `application/octet-stream`.
- Web-Crypto alternatives are not recommended:
  - `@pushforge/builder` 2.0.5 and `webpush-webcrypto` 1.0.5 use legacy `aesgcm`.
  - `@block65/webcrypto-web-push` 2.0.0 pads every body to 4,096 B, which can break the Firefox Android bridge ✅.

**Subscription shape** 📄 (Push API IDL): `{ endpoint, expirationTime: number|null, keys: { p256dh, auth } }`, with the keys in base64url and no padding. Store one row per device, unique on `endpoint`.

**Size limits:**

| Push service | Limit | Status |
|---|---|---|
| RFC 8030 §7.2 | services "MUST NOT return a 413… 4096 bytes or less" | 📄 |
| RFC 8291 aes128gcm | 4,096 B body = **3,993 B plaintext** (fixed overhead 103 B: 86 header + 1 delimiter + 16 tag) | ✅ measured (3,994 B → 4,097 B body, not rejected by the lib) |
| FCM (Chrome) | "Maximum payload… 4096 bytes" | 📄 (native FCM page, inferred for VAPID) |
| Mozilla autopush | 413 above 4,028 chars; **via FCM bridge (Firefox Android) "only 2744 bytes"** | 📄; ✅ 2,641 B plaintext → 2,744 B body |
| Apple (`web.push.apple.com`) | `PayloadTooLarge` over 4 KB | 📄 |

**Apple specifics** 📄 ([Sending web push notifications](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)):
- TTL must be positive; otherwise you get `BadTtl`.
- Apple stores messages for ≤ 30 days.
- `Topic` is ≤ 32 characters from the URL-safe base64 set. A `/` throws in web-push ✅.
- Set `Urgency: high` for immediate delivery.
- `BadJwtToken` fires if `sub` is not a URL or `mailto:`, the `aud` is wrong, or `exp` is more than one day ahead.
- "Don't refresh your JWT more frequently than once per hour" → cache the VAPID `Authorization` header per push-service origin. Pass `vapidDetails: null` with `headers: { Authorization }` ✅ (preserved).
- You don't need an Apple developer account. Allow egress to `https://*.push.apple.com`.

**Error handling:**

| Status | Action |
|---|---|
| 201/202 | ok → `last_ok_at = now()` |
| 404, 410 | delete the subscription 📄 (RFC 8030 404 = expired; web.dev: 410 "should be removed"; Apple 410 "device token has expired") |
| 413 | bug: payload too large, do not retry |
| 429 | wait `Retry-After` (default 60 s) and retry once, otherwise drop |
| 403 | VAPID misconfig: alert the team; on `VapidPkHashMismatch` delete the subscription ⚠️ |
| 5xx / timeout | retry with jittered backoff (≤ 2 tries inside `after()`) |

**Declarative Web Push** 📄 ([WebKit blog 2025-03-27](https://webkit.org/blog/16535/meet-declarative-web-push/), [Push API ED](https://w3c.github.io/push-api/)) and ✅ (`NotificationJSONParser.cpp` on WebKit main):
- `"web_push": 8030` is required at the top level ("the magic value that opts the rest of your push message into declarative parsing").
- `notification.title` must be non-empty. `notification.navigate` is required; **use an absolute https URL**, because WebKit parses it without a base ⚠️.
- WebKit reads `title, navigate, dir, lang, body, tag, icon, silent, data`. The spec has more (`actions[]`, `image`, `badge`, …) that WebKit ignores.
- `app_badge`: WebKit moved it to the **top level** on 2025-05-23, while the Safari 18.4/18.5 blog examples put it inside `notification`. ⚠️ Send it in both places for 18.x.
- `mutable` is top level. When it is true, the SW `push` event fires with `event.notification`; if the SW fails to show a replacement, Safari shows the declarative fallback.
- No special Content-Type is needed. Detection is by the JSON key.
- Support:
  - Safari iOS/iPadOS 18.4 (Home Screen web apps) and macOS Safari 18.5: yes.
  - Safari 27.0 (2026-09-17): no changes.
  - **Chrome / Firefox: not shipped** ✅. So every browser except Safari runs your SW `push` handler on the same JSON → web.

### N3. Email
- **Resend** ✅📄 ([pricing](https://resend.com/pricing)):
  - Free: **3,000/month, 100/day** (UTC day; each To/CC/BCC counts; over the cap → `429 daily_quota_exceeded`), **3 domains**, 30-day retention.
  - **10 req/s** per team. Batch API: 100 emails per call.
  - Pro: $20/month for 50k (no daily cap).
- **Vercel Marketplace:** Resend is "Vercel Native" (billed by Vercel, provisions `RESEND_API_KEY`). The flow assumes the domain is on Vercel 📄.
- **Test sender:** `onboarding@resend.dev` only sends to your own address. Anything else returns 403 "You can only send testing emails to your own email address" 📄.
- **DNS** 📄 ([add a domain](https://resend.com/docs/add-a-domain)): add these on a sending subdomain, e.g. `notify.<domain>`:
  - MX `send.notify` → `feedback-smtp.<region>.amazonses.com` (priority 10)
  - TXT `send.notify` → `"v=spf1 include:amazonses.com ~all"`
  - TXT `resend._domainkey.notify` → `p=…`
  - `_dmarc.<domain>` TXT `"v=DMARC1; p=none; rua=mailto:…"`
  - Verification: "often verify within 15 minutes… occasionally take up to 72 hours".
- **Packages** ✅:
  - `resend` 6.34.1 (Node ≥ 20). It has `send(payload, { idempotencyKey })`, sent as the `Idempotency-Key` header ✅ (dist typings).
  - `react-email` 6.11.3 exports `Html`, `Button`, `Text`, `Tailwind`.
  - `@react-email/components` is **deprecated** (last version 1.0.12).
- **Alternatives** 📄 (2026-10-21):

  | Provider | Free tier / catch |
  |---|---|
  | Postmark | 100/month free; **manual account approval** before sending outside your domains (< 24 h on weekdays); $15/month for 10k |
  | Amazon SES | sandbox: verified recipients only, 200/day, 1/s; production access "within 96 hours"; $0.10 per 1k |
  | SendGrid | **no free plan** (60-day trial since 2025-03-25) |
  | Mailgun | 100/day free, 1 domain |
  | Brevo | 300/day after account approval, Brevo branding ⚠️ |
  | Mailtrap | 4,000/month, 150/day |
  | Loops / Plunk | branding on free plans |

- **Deliverability** 📄:
  - The Gmail/Yahoo bulk-sender rules (SPF+DKIM+DMARC alignment, RFC 8058 one-click unsubscribe) apply at about 5,000/day, and Gmail says "Transactional messages are excluded" from the unsubscribe rule.
  - Microsoft rejects non-compliant mail from domains sending over 5,000/day with `550 5.7.515` (since 2025-05-05).
  - At Pot's volume, SPF + DKIM + DMARC `p=none` is enough.
  - A **new domain has no reputation**. Expect some spam-folder placement ⚠️. Resend's warm-up guidance is ≤ 150 emails on day 1.
  - Keep the content plain, leave click tracking off, link to your own domain, and ask testers to "Not spam" the first mails.

### N4. Telegram
**Policy** (re-read 2026-10-21; none of these pages shows a "last updated" date):
- 📄 [Blockchain Guidelines](https://core.telegram.org/bots/blockchain-guidelines):
  - "For clarity, these rules **only apply** to Mini Apps and their bots on the Telegram platform. Regular Telegram bots that **do not** have a Mini App component are exempt." ✅ (fetched myself)
  - The Mini App rules include "Directing or linking users to external platforms or websites where cryptoassets not based on TON are promoted or utilized" as not permitted.
- 📄 [Bot Developer ToS](https://telegram.org/tos/bot-developers):
  - TPA = "Bots and Mini Apps".
  - §7.1–7.4 are all phrased as "Mini Apps…". §7 also reaches "within its connected bot" for Mini Apps that implement crypto.
  - **Bot-wide** clauses:
    - §4 "All TPA must be bound by a privacy policy that is easily accessible…" (set it in @BotFather).
    - §4.4 encryption at rest.
    - §5.2(b) no spam or unsolicited messages.
    - §5.2(h) no "illegal, pirated, regulated or questionable goods" ⚠️ undefined.
    - §6.2 digital goods must use Telegram Stars.
    - §6.3 you are responsible for securing financial assets you handle.
- **`url` vs `web_app` button** 📄 ([Bot API](https://core.telegram.org/bots/api#inlinekeyboardbutton)):
  - `url` = "HTTP or tg:// URL to be opened when the button is pressed".
  - `web_app` = "the Web App that will be launched… Available only in private chats".
  - A `url` button is not one of the seven Mini App launch methods ([Mini Apps](https://core.telegram.org/bots/webapps)). ⚠️ The ToS never defines "Mini App component", so this is an inference.
  - Assert `getMe().has_main_web_app === false` in a health check.

**Bot API facts** 📄 (Bot API **10.3**, 2026-08-24):
- **Webhook:**
  - `setWebhook`: `url` (HTTPS), `secret_token` (1–256 chars `[A-Za-z0-9_-]`) → header `X-Telegram-Bot-Api-Secret-Token`.
  - `max_connections` 1–100 (default 40), `allowed_updates` (default excludes `chat_member` and reactions; **includes `my_chat_member`**), `drop_pending_updates`.
  - Ports 443/80/88/8443. "Redirects are not supported".
  - Non-2xx responses are retried "after a reasonable amount of attempts". Updates are not kept beyond 24 h.
  - ✅ The tdlib Bot API server source backs off from 1 s, doubling, capped at a random 60–120 s, and honours `Retry-After` ≤ 3600 s ⚠️ (assuming the hosted service matches).
  - Dedupe on `update_id`.
- **Messages and buttons:**
  - `sendMessage` text is 1–4096 chars after entity parsing.
  - `callback_data` is 1–64 bytes. `copy_text` buttons since 7.11.
  - Button `style` (`danger`/`success`/`primary`) since 9.4; `disabled` buttons since 10.3.
  - Ephemeral messages since 10.2: "within 15 seconds of the incoming eligible action". Useful for a private `/link` reply inside a group.
- **Rate limits** (FAQ):
  - "avoid sending more than one message per second" per chat.
  - "In a group… not… more than 20 messages per minute".
  - About 30 msgs/s broadcast overall.
- **Privacy mode** (default ON) still delivers:
  - `/command@this_bot`
  - general commands if the bot was last to post
  - replies to the bot
  - service messages
  - Keep it ON (data minimisation, §4.3).
- **Groups:**
  - `Chat.id` has ≤ 52 significant bits → store as `BIGINT`.
  - Handle `migrate_to_chat_id` (group → supergroup).
  - Deep links: payload `[A-Za-z0-9_-]{1,64}`. `?start=` arrives as `/start <payload>` in a DM; `?startgroup=` arrives in the group as `/start@bot <payload>`, which passes privacy mode and gives you `chat.id`.

**Libraries** ✅ (`npm view`, 2026-10-21):
- **grammY 1.46.0** (2026-08-26, Bot API 10.3) — **recommended.**
  - App Router needs the **`"std/http"`** adapter. The `"next-js"` adapter is the Pages Router `(req,res)` signature ✅.
  - `webhookCallback` timeout is 10 s by default with `onTimeout: "throw"`. `secretToken` is compared in constant time ✅.
  - Pass `botInfo` to skip `getMe` on cold start.
- Telegraf 4.16.3: last release 2024-02-29 (Bot API 7.1). Avoid.
- Vercel Chat SDK `chat` / `@chat-adapter/telegram` 4.43.0 (2026-10-19): **public beta**.
  - Needs a Redis/Postgres state adapter (24 h dedupe).
  - No `my_chat_member`, `style`, `login_url` or `copy_text`.
  - Not worth it for one platform.

**Flows:**
1. **Link a group to a Pot:**
   - The organizer taps "Connect Telegram group".
   - The server stores `tg_link_token(pot_id, token, expires_at=now+15min)` and shows `https://t.me/<PotBot>?startgroup=<token>`.
   - The user picks a group. The bot receives `my_chat_member` (status `member`) and `/start@PotBot <token>`.
   - Verify the token (single use), then upsert `telegram_chat(pot_id, chat_id BIGINT)`.
   - Reply "This group now gets Lisbon Trip requests".
2. **Post an approval request:**
   - `sendMessage(chat_id, "Maya wants $84 for groceries.", { reply_markup: { inline_keyboard: [[{ text: "Approve in Pot →", url: "https://<prod>/p/lisbon/requests/12" }]] } })`.
   - Store `message_id`. On resolution, `editMessageText` to "Approved by the group".
   - Stay ≤ 20 posts/min per group.
3. **Link a user (DMs):**
   - Settings → `https://t.me/<PotBot>?start=<token>` → `/start <token>` in the DM.
   - Bind `from.id` to the user. Bots can only DM users who started them.
   - Telegram Login (OIDC; Allowed URLs in BotFather) is overkill for the MVP.
4. **`/newpot`:** reply with a `url` button to `https://<prod>/new?src=tg` (no Mini App).

**BotFather steps** (human; 📄 there is also a @BotFather Mini App UI):
1. `/newbot`: the display name, plus a username that is **5–32 chars, Latin letters, digits and `_`, ending in `bot`, and cannot be changed later**.
   - Create **two bots**: `<Pot>Bot` (prod) and `<Pot>DevBot` (preview/staging), because each bot has one webhook.
2. Put the token **only** in Vercel env (Secret). Rotate it with `/token` (📄) or `/revoke` (⚠️ secondary).
3. Run `/setdescription` (≤ 512), `/setabouttext` (≤ 120), `/setuserpic`, and `/setcommands` (`start`, `newpot`, `link`, `help`). `setMyCommands` from code also works.
4. `/setjoingroups` → **Enable**. `/setprivacy` → **keep Enabled** (the default).
5. Set the **Privacy Policy URL** in Bot Settings (⚠️ exact menu name not verified). Pot needs its own policy, because the standard TPA policy §6.2 doesn't cover linking Telegram IDs to accounts.
6. **Do not** run `/newapp`, enable a Main Mini App, set a web-app menu button, use the attachment menu, or turn on Guest Mode or bot-to-bot.
7. `/setdomain` is only needed for `login_url` buttons or the legacy login widget. Skip it for the MVP.
8. Set the webhook from a one-off script or the deploy step: `setWebhook(url=https://<prod-domain>/api/telegram, secret_token=<TELEGRAM_WEBHOOK_SECRET>, allowed_updates=["message","callback_query","my_chat_member"], drop_pending_updates=true)`.

### N5. Data model (notification tables; Postgres)
```
push_subscription(id, user_id FK, endpoint TEXT UNIQUE, p256dh TEXT, auth TEXT, expiration_time TIMESTAMPTZ NULL,
                  user_agent TEXT, created_at, last_ok_at, fail_count INT DEFAULT 0)
telegram_user(user_id FK UNIQUE, tg_user_id BIGINT UNIQUE, linked_at)
telegram_chat(pot_id FK, chat_id BIGINT UNIQUE, linked_by_user_id, linked_at, active BOOL)
tg_link_token(token TEXT PK, kind ENUM('user','group'), user_id, pot_id NULL, expires_at, used_at NULL)
notification_log(event_key TEXT, user_id, channel ENUM('push','email','telegram'), sent_at, status,
                 PRIMARY KEY(event_key, user_id, channel))      -- idempotency for retries/duplicate triggers
telegram_post(pot_id, request_id, chat_id BIGINT, message_id BIGINT, PRIMARY KEY(pot_id, request_id, chat_id))
notification_pref(user_id, event_type, push BOOL, email BOOL)    -- optional for MVP
```
`event_key` examples: `approval_needed:<dao>:<proposal_id>`, `deposit:<deposit_address>:SUCCESS`.

## Snippets
Untested compositions unless marked. The pieces were tested in the scratchpad (`infra/push-email/`, `infra/telegram/grammy-test/`).

**Send one push** (web-push 3.6.7; the option names were checked against the source ✅):
```ts
// lib/notify/push.ts  — server only
import webpush, { WebPushError } from 'web-push';

webpush.setVapidDetails(process.env.VAPID_SUBJECT!,               // 'mailto:push@<real-domain>'
                        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
                        process.env.VAPID_PRIVATE_KEY!);

export type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };
export async function sendPush(sub: Sub, payload: object,
  o: { ttl: number; urgency: 'very-low' | 'low' | 'normal' | 'high'; topic?: string }) {
  const body = JSON.stringify(payload);
  if (Buffer.byteLength(body) > 2500) throw new Error('push payload > 2500 B'); // FF Android bridge = 2,641 B max
  try {
    const r = await webpush.sendNotification(sub, body, { TTL: o.ttl, urgency: o.urgency, topic: o.topic, timeout: 10_000 });
    return { ok: true as const, status: r.statusCode };
  } catch (e) {
    const s = (e as WebPushError).statusCode;
    return { ok: false as const, status: s, gone: s === 404 || s === 410,
             retryAfter: (e as WebPushError).headers?.['retry-after'] };
  }
}
```

**Declarative payload** (✅ 325 B → 428 B encrypted body):
```json
{"web_push":8030,
 "notification":{"title":"Maya needs your approval","body":"$400 · Boat day · Lisbon Trip",
  "navigate":"https://pot.example/p/lisbon/requests/12","lang":"en-US","dir":"ltr",
  "tag":"req-lisbon-12","silent":false,
  "data":{"type":"approval_needed","potId":"lisbon","requestId":12}},
 "app_badge":1,"mutable":false}
```
Send it with `{ ttl: 86400, urgency: 'high', topic: 'req-lisbon-12' }`. SW fallback for non-Safari browsers (→ web): read `event.data?.json()?.notification`, then call `showNotification(n.title, { body, tag, lang, dir, data: { ...n.data, url: n.navigate } })`, and on `notificationclick` call `clients.openWindow(data.url)`.

**Fan-out after the response** (Next 16 `after()`, a concurrency limiter, and dedupe):
```ts
import { after } from 'next/server';
after(async () => {
  const targets = await db.pushTargetsFor(event);            // excludes rows already in notification_log
  const queue = [...targets];
  await Promise.all(Array.from({ length: 25 }, async () => {
    for (let t; (t = queue.shift()); ) {
      const r = await sendPush(t.sub, event.payload, event.pushOpts);
      if (r.ok) await db.logSent(event.key, t.userId, 'push');
      else if (r.gone) await db.deleteSubscription(t.sub.endpoint);
    }
  }));
});
```

**Telegram webhook** (grammY 1.46.0, `"std/http"` adapter; the offline test passed ✅):
```ts
// app/api/telegram/route.ts
import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!, { botInfo: JSON.parse(process.env.TELEGRAM_BOT_INFO!) });
bot.command('start', async (ctx) => { /* ctx.match = deep-link token → bind user (DM) or group (chat.type!=='private') */ });
bot.command('newpot', (ctx) => ctx.reply('Start a Pot for this group:',
  { reply_markup: new InlineKeyboard().url('Create a Pot →', 'https://pot.example/new?src=tg') }));
bot.on('my_chat_member', async (ctx) => { /* bot added/removed; mark telegram_chat.active */ });
export const POST = webhookCallback(bot, 'std/http', { secretToken: process.env.TELEGRAM_WEBHOOK_SECRET! });
```

**Email** (resend 6.34.1; the option name was checked in the typings ✅):
```ts
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);
await resend.emails.send(
  { from: 'Pot <alerts@notify.pot.example>', to: [email], subject: 'Maya needs your approval: $400',
    react: ApprovalEmail({ pot: 'Lisbon Trip', amount: '$400', url }) },
  { idempotencyKey: `approval_needed:${dao}:${proposalId}:${userId}` });
```

## Gotchas & failure modes
- **web-push:**
  - It doesn't cap the payload (a 3,994 B plaintext produces a 4,097 B body and is sent) ✅.
  - On Node 24 there is a `url.parse` deprecation warning, fixed only on master (#943).
  - Apple sometimes accepts the push but delivers nothing (#939, open) → test on a real iPhone on day 11.
- **Never default the TTL** (28 days). A stale "needs approval" push arriving after the vote closed is worse than none.
- **Topic** must be ≤ 32 URL-safe base64 chars. web-push throws on `/` ✅.
- **The VAPID public key is baked into every subscription.**
  - Rotating it orphans all subscriptions.
  - Use the same keys in Preview and Production if they share a DB. If not, use separate keys and a separate DB.
- **Declarative push quirks:**
  - The `app_badge` location changed in May 2025 (send it in both places).
  - `navigate` must be absolute.
  - Chrome/Firefox ignore the declarative path, so the SW must handle the same JSON.
- **Telegram:**
  - Webhooks to **preview** URLs fail. Deployment Protection doesn't apply to production domains, but Telegram can't pass Vercel Authentication and doesn't follow redirects (watch for trailing-slash 308s).
  - Use a separate DevBot for previews, or `?x-vercel-protection-bypass=<secret>` on the webhook URL 📄.
  - Groups get 20 posts/min. A busy Pot or a retry storm gets 429 → `retry_after`.
  - Privacy mode hides plain-text messages: users must type `/newpot@PotBot`.
  - Group-to-supergroup migration changes `chat.id` (`migrate_to_chat_id`).
  - Adding **any** Mini App surface later puts the whole bot under ToS §7.
- **Resend:**
  - The 100/day free cap counts **recipients**: a 6-member "pot closed" email costs 6.
  - The `resend.dev` sender only reaches your own address.
  - A new domain may land in spam.

## Costs, limits, latencies (measured vs documented)
| Item | Value | Status |
|---|---|---|
| web-push CPU per send (fresh JWT / cached header) | 0.143 ms / 0.063 ms | ✅ measured (Node 22.22) |
| Max plaintext per push (4,096 B record) | 3,993 B | ✅ measured |
| Firefox Android bridge body cap | 2,744 B (= 2,641 B plaintext) | 📄 + ✅ |
| Push delivery latency to device | not measured (needs a real device); typically seconds ⚠️ | ⚠️ |
| Resend Free | 3,000/month, 100/day, 3 domains, 10 req/s; Pro $20/month for 50k | 📄 ✅ (pricing page fetched) |
| Resend domain verification | ~15 min typical, ≤ 72 h | 📄 |
| Telegram group / chat / global | 20 msg/min per group; ~1 msg/s per chat; ~30 msg/s overall | 📄 |
| Telegram webhook retries | backoff 1 s doubling, cap 60–120 s; updates dropped after 24 h | ✅ (tdlib source) / 📄 |
| grammY webhook timeout | 10 s default | 📄 |
| Cost for the hackathon | $0 (all free tiers); +$20/month if Resend goes over 100/day | 📄 |

## Open questions / needs a human
- **Domain:** Pot needs a real domain (or subdomain) for (a) the Resend sending subdomain `notify.<domain>`, (b) `VAPID_SUBJECT=mailto:push@<domain>`, and (c) the privacy policy URL required by Telegram ToS §4. Which domain? Is it on Vercel DNS (enables Resend auto-configure)?
- **Human, Phase 0 (≥ 3 days before Nov 1):**
  - Create the Resend account (or `vc i resend`), add `notify.<domain>`, set DNS, wait for verification, and create `RESEND_API_KEY`.
  - Generate VAPID keys once (`npx web-push generate-vapid-keys --json`) and store `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (Secret) and `VAPID_SUBJECT`.
- **Human, BotFather:** create the prod and dev bots, choose permanent usernames, set the commands, privacy policy, join-groups ON and privacy ON. Store `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` and `TELEGRAM_BOT_INFO` (the `getMe` JSON) as Secrets.
- **Product decision:** is the Telegram bot in scope at all? It is first in the C3 cut order. If yes, which events post to groups?
- → **web:**
  - The SW must handle the declarative JSON shape above (title/body/navigate/tag/data).
  - The subscribe POST body = the `PushSubscription.toJSON()`.
  - Unsubscribe on logout.
  - Test NEAR Auth sign-in inside Telegram's in-app browser.
- → **auth:** is the user's email (and `email_verified`) available server-side from the NEAR Auth session for the email fallback?
- → **product-ux:** notification copy for each N1 event (no crypto words), quiet hours, and whether `money_arrived` notifies everyone or only the organizer.
- ⚠️ **Not verified:** the exact BotFather menu name for the privacy policy, `/revoke` vs `/token`, and whether Telegram's §5.2(h) "regulated… goods and services" will ever be applied to bots linking to money apps (no enforcement precedent found).

## Sources
All accessed 2026-10-21.
- https://www.npmjs.com/package/web-push and https://github.com/web-push-libs/web-push (issues #939, #943, #977, #978; README VAPID subject warning): version, maintenance, Apple localhost warning
- https://github.com/web-push-libs/web-push/blob/master/src/web-push-lib.js: allowed option keys and defaults (TTL 2419200)
- https://datatracker.ietf.org/doc/html/rfc8030 §7.2 and https://datatracker.ietf.org/doc/html/rfc8291 §4: 4096 B and 3993 B limits
- https://firebase.google.com/docs/cloud-messaging/customize-messages/set-message-type: FCM 4096 B
- https://mozilla-services.github.io/autopush-rs/http.html: 4028 / 2744 B limits
- https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers: Apple errors, TTL, Topic, JWT rules
- https://webkit.org/blog/16535/meet-declarative-web-push/ and https://w3c.github.io/push-api/: Declarative Web Push format and algorithm
- https://github.com/WebKit/WebKit (Source/WebCore/Modules/notifications/NotificationJSONParser.cpp, commit "Relocate 'app_badge'…" 2025-05-23): parsed fields
- https://github.com/mdn/browser-compat-data and https://bugzilla.mozilla.org/show_bug.cgi?id=1935325: Chrome/Firefox support status
- https://vercel.com/docs/functions/runtimes/edge: "Starting in Next.js 16.3, setting `runtime = 'edge'` is no longer supported" (fetched myself)
- https://resend.com/pricing (fetched myself), https://resend.com/docs/add-a-domain, https://resend.com/docs/knowledge-base (quotas): Resend tiers, DNS, timing
- https://www.npmjs.com/package/resend (6.34.1 typings: `idempotencyKey`), https://www.npmjs.com/package/react-email, https://www.npmjs.com/package/@react-email/components (deprecated)
- https://postmarkapp.com/pricing, https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html, https://sendgrid.com/pricing, https://www.mailgun.com/pricing, https://www.brevo.com/pricing, https://mailtrap.io/pricing: alternatives
- https://support.google.com/a/answer/81126, https://support.google.com/a/answer/14229414, https://senders.yahooinc.com/best-practices/, https://techcommunity.microsoft.com (Outlook high-volume sender requirements, 2025): deliverability rules
- https://core.telegram.org/bots/blockchain-guidelines (fetched myself): Mini-App-only scope, bot exemption
- https://telegram.org/tos/bot-developers (fetched myself): TPA definition, §4, §5.2, §6.2, §7
- https://telegram.org/tos/mini-apps, https://telegram.org/privacy-tpa, https://core.telegram.org/bots/payments-stars: user ToS, standard privacy policy, Stars-only
- https://core.telegram.org/bots/webapps: Mini App launch methods
- https://core.telegram.org/bots/api, https://core.telegram.org/bots/faq, https://core.telegram.org/bots/features, https://core.telegram.org/api/links: Bot API 10.3, webhook, limits, deep links, privacy mode
- https://github.com/tdlib/telegram-bot-api (telegram-bot-api/WebhookActor.cpp): retry/backoff behaviour
- https://telegram.org/blog (2026-06-11 post): in-app browser behaviour
- https://grammy.dev/hosting/vercel and https://grammy.dev/ref/core/webhookcallback, npm `grammy` 1.46.0, `telegraf` 4.16.3: library facts
- https://chat-sdk.dev and https://vercel.com/blog (Chat SDK public beta, 2026-02-23 / 2026-03-19), npm `chat` / `@chat-adapter/telegram` 4.43.0
- https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation: bypass secret as a query parameter
