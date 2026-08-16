# Nudgeboard Security Audit

**Date:** 16 August 2026  
**Scope:** Desktop Electron app (`desktop-app/`) and React Native mobile app (`mobile/`)  
**Method:** Source review of pairing, transport, storage, IPC, execution, and OS manifests. No penetration test was run on a live network.

This document is a snapshot of residual risk, not a certification. Pairing a phone to a PC so it can launch apps and send keystrokes is **intentional remote control**. The goal is to keep that power inside a user-initiated, same-Wi-Fi trust boundary.

Related: [PLAY_STORE_REVIEW.md](./PLAY_STORE_REVIEW.md) (Google Play rejection risk for the Android app).

---

## Executive summary

Electron process isolation on the desktop is in good shape (`sandbox`, `contextIsolation`, no `nodeIntegration`, Forge fuses, production CSP). The **dominant risk is the LAN control plane**:

1. The bridge listens on **all interfaces** (`0.0.0.0:47890`) over **cleartext WebSocket**.
2. The **pairing token is reused as the long-lived reconnect credential**.
3. Tokens sit in **plaintext files** (desktop `nudgeboard.json`, mobile AsyncStorage).
4. A 6-digit PIN can fully pair a device **without a desktop confirmation click**, with **no rate limit**.

A same-Wi-Fi attacker who sees a reconnect (or a QR / PIN during pairing) can drive every tile on that deck: open apps, run custom `.ps1`/`.bat` flows, send Ctrl+L-style keystrokes, lock the machine.

Fix transport + token lifecycle first. Then lock down script launch and IPC validation.

| Severity | Count | Highest-impact items |
| --- | --- | --- |
| Critical | 2 | Cleartext WS on `0.0.0.0`; Android release signed with the debug keystore |
| High | 6 | Token reuse, PIN auto-trust, no pairing lockout, plaintext tokens, QR host not constrained, script RCE by design |
| Medium | 8 | Renderer pairing-token leak, unsanitized IPC, AppleScript/xdotool injection, `openExternal` any scheme, LAN `/24` scan, weak `Math.random` OTP |
| Low / Info | 8 | Timing on token compare, CSP `'unsafe-inline'` styles, cosmetic fingerprint, ProGuard off |

---

## Threat model

| Actor | What they can do today |
| --- | --- |
| LAN passive eavesdropper (rogue AP, ARP spoof, shared café Wi-Fi) | Recover the long-lived token from `reconnect` / `hello_ok` → full deck control |
| LAN active attacker during an open pairing window | Shoulder-surf PIN, brute-force 6 digits, or capture QR → persistent trust |
| Malicious paired phone | Fire every configured tile. Cannot rewrite the deck over the wire (press-only protocol) |
| XSS in the desktop renderer | Steal live pairing token from the snapshot; plant malicious custom flows via IPC |
| Local malware / another OS user who can read the profile | Steal tokens and flow paths from disk / AsyncStorage |
| Hostile QR | Phone connects wherever `host` says and sends OTP + device metadata |

**Assumption the product currently relies on:** “same Wi-Fi” equals “trusted network.” That is not true on public or shared Wi-Fi.

---

## Desktop findings

### Critical

#### D-C1 — Cleartext WebSocket on all interfaces

- **Where:** `desktop-app/src/main/bridge.ts` (`httpServer.listen(..., '0.0.0.0')`), `hello_ok` / `handleReconnect`
- **What:** The bridge binds `0.0.0.0` (LAN and any routed interface) and uses `ws://` with no TLS. Reconnect auth is `device.id` + `token`. `hello_ok` **re-sends** that token on every successful auth.
- **Impact:** On-path LAN attacker who observes one reconnect owns the deck until the user unpairs.
- **Fix:**
  - Bind to the chosen LAN IPv4 (or localhost + an explicit tunnel), not every interface.
  - Use `wss` with a pairing-pinned / TOFU cert, or an OS-local relay.
  - Issue a **session** key after pairing; never echo the long-lived secret on reconnect.

### High

#### D-H1 — Pairing token becomes the permanent device credential

- **Where:** `startPairing` → `pairingPayload(token)` → `acceptDevice(..., token)` in `bridge.ts`
- **What:** `randomBytes(16)` hex is embedded in the QR. On OTP/PIN success, **that same value** is stored as `StoredDevice.token` forever.
- **Impact:** Anyone who saw the QR (screen share, photo, renderer XSS) and later learns `device.id` can reconnect indefinitely.
- **Fix:** Invalidate the QR token immediately after pair. Issue a distinct device token only after OTP/PIN success. Store a hash on disk; keep the raw token only on the phone (ideally in Keystore/Keychain).

#### D-H2 — PIN pairing auto-trusts with no desktop confirm

- **Where:** `handleHelloPin` calls `acceptDevice(..., trusted: true)` and clears the session
- **What:** QR+OTP shows a pending device for the user to accept. PIN matching 6 digits **skips that UI**.
- **Impact:** A photo of the on-screen PIN during an open pairing window lets another LAN phone become a trusted device.
- **Fix:** Reuse the pending-device confirmation UI. Treat PIN as secondary.

#### D-H3 — No rate limit or lockout on PIN / OTP

- **Where:** `handleHello`, `handleHelloPin`, `bridge:verify-otp`
- **What:** Failed PIN closes the socket but does not throttle, backoff, or kill the session. PIN space is 100000–999999 (`makePairingPin`). OTP compare is timing-safe; attempts are unlimited within TTL (PIN window 5 minutes, OTP 2 minutes).
- **Impact:** Automated guessing against the PIN on the LAN during an active pairing window is realistic.
- **Fix:** Per-IP and global attempt budgets; invalidate after ~5–10 failures; exponential backoff.

#### D-H4 — Custom flows are local RCE; PowerShell uses `-ExecutionPolicy Bypass`

- **Where:** `desktop-app/src/main/executor.ts` (`.ps1` / `.bat` / `.cmd` / `.sh` spawn); browse filters in `bridge.ts` allow those extensions
- **What:** Launch steps run user paths as the logged-in desktop user. Paired phones only `press` by tile id — they cannot author tiles over WS — but any flow already on the deck runs with full user rights.
- **Impact:** Tampered `nudgeboard.json`, XSS-planted flows, or a user who added a hostile script = arbitrary code. The phone can trigger it repeatedly.
- **Fix:** Default-deny scripts; optional “allow scripts” gate; hash-pin allowed paths; do not use `Bypass` unless required; validate flows in main before save/execute.

### Medium

#### D-M1 — Long-lived tokens stored plaintext on disk

- **Where:** `desktop-app/src/main/persist.ts` → `%APPDATA%/Nudgeboard/nudgeboard.json`
- **Fix:** DPAPI / Keychain / libsecret; store hashes; tighten ACLs.

#### D-M2 — Live pairing token is sent to the renderer

- **Where:** `pairingView()` includes `payload: session.payload` (token inside)
- **Fix:** Keep QR generation in main. Send the renderer only `qrDataUrl` and non-secret fields. Device list snapshots already omit tokens — good.

#### D-M3 — IPC accepts unsanitized `CustomFlow` / `DeckTile`

- **Where:** `bridge:save-custom-flow`, `bridge:set-tile`; preload forwards objects as-is
- **Fix:** Schema-validate in main (allowlisted step types, key names, path roots). Reload `customFlow` from persisted flows rather than trusting the nested copy on the tile.

#### D-M4 — macOS / Linux shortcut strings are interpolated into a shell

- **Where:** `executor.ts` — `osascript` `keystroke "${targetKey}"`; Linux `` xdotool key ${linuxCombo} `` via `sh -c`
- **Impact:** A crafted `keys` array in a saved flow can break out of the quote.
- **Fix:** Allowlist key names; argv only; never interpolate into AppleScript or `sh -c`. Windows VK path is safer.

#### D-M5 — `shell.openExternal` for any `scheme://`

- **Where:** `apps.ts` `isProtocolLaunch` / `launchDesktopApp`
- **Fix:** Allowlist `https:` (and maybe `mailto:`). Open files only via `openPath` after an absolute-path + exists check. Block `file:`, `javascript:`, and unexpected `ms-` handlers unless the user explicitly picked them.

#### D-M6 — No navigation / `setWindowOpenHandler` deny list

- **Where:** `desktop-app/src/main/main.ts` window create
- **Fix:** Deny all navigation away from the app origin; deny `window.open` (or `shell.openExternal` for https only).

#### D-M7 — Unbounded flow delay

- **Where:** `executeFlowStep` `sleep(Math.max(10, step.ms))` with no max
- **Fix:** Cap (for example 30s); optionally cancel an in-flight flow on a new press.

### Low / info

| ID | Issue | Notes |
| --- | --- | --- |
| D-L1 | Token compare uses `===`, OTP uses `timingSafeEqual` | Impractical against 128-bit tokens; still easy to fix |
| D-L2 | Production CSP allows `'unsafe-inline'` styles | Slightly weaker XSS mitigation |
| D-L3 | `JSON.parse` then `as ClientMessage` | No runtime schema; robustness more than RCE |
| D-L4 | Device fingerprint is client-asserted | Display only; auth is the token |
| D-L5 | `ws` server has no `maxPayload` / connect rate limit | LAN DoS |
| D-I1 | Pairing probe CORS `*` | Leaks name + fingerprint while pairing, not the token |
| D-I2 | Press frames have no nonce | Replay is folded into cleartext MITM (D-C1) |

### Desktop — what is done well

- `webPreferences`: `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`
- Forge fuses: `RunAsNode` off, ASAR integrity, `OnlyLoadAppFromAsar`
- Production CSP (`default-src 'self'`)
- OTP compared with `timingSafeEqual`
- Pairing HTTP probe does **not** include the token
- Reconnect requires `trusted` + matching token
- `press` only runs tiles for that `deviceId` on a live socket
- Client protocol cannot rewrite the deck (`hello` / `reconnect` / `press` / `logout` only)
- Windows shortcut chords use a VK allowlist rather than raw string SendKeys
- Utility actions are a fixed command list
- Single-instance lock reduces duplicate bridges

---

## Mobile findings

### Critical

#### M-C1 — Release builds signed with the debug keystore

- **Where:** `mobile/android/app/build.gradle` (`release { signingConfig signingConfigs.debug }`)
- **Impact:** Play will reject or treat the upload as unsigned-for-production. Anyone can resign the same `applicationId` while you still use this config. **Change the package name and signing key before the first Play upload** — `applicationId` is sticky.
- **Fix:** Generate a private upload key; use Play App Signing; never ship `android`/`androiddebugkey`.

### High

#### M-H1 — Pairing and session secrets on cleartext LAN

- **Where:** `mobile/src/pairing.ts` (`ws://${host}:${port}`), `mobile/src/lan.ts` (`http://.../nudgeboard/pairing`), `AndroidManifest.xml` `android:usesCleartextTraffic="true"` (app-wide; no `network_security_config`)
- **Impact:** Same-Wi-Fi MITM can steal reconnect tokens and send `press`.
- **Fix:** `wss`/`https` with pin/TOFU. If LAN cleartext must remain for v1, **scope** it in `network_security_config` to RFC1918 only — not the whole internet.

#### M-H2 — Long-lived tokens in plaintext AsyncStorage

- **Where:** `mobile/src/store.ts` persist `partialize` includes `profiles` (each has `token`)
- **Fix:** Android EncryptedSharedPreferences / Keystore; iOS Keychain.

#### M-H3 — QR `host` is not required to be a private LAN address

- **Where:** `isPairingPayload` only checks `host` is a non-empty string; `connectBridge` connects to whatever the QR says
- **Impact:** Malicious QR → phone sends OTP, token, and device metadata to an attacker.
- **Fix:** Allow only RFC1918 (and maybe link-local). Show host + fingerprint and require a tap before connect.

### Medium

#### M-M1 — Weak client RNG

- **Where:** `makeOtp`, `makeDeviceId`, `makeFingerprint` use `Math.random` / `Date.now`
- **Fix:** `crypto.getRandomValues`. Desktop PIN already uses `randomBytes`.

#### M-M2 — Aggressive subnet HTTP probe

- **Where:** `findPairingHost` — up to 254 hosts on the phone’s `/24`, else 762 fallback addresses, 32 workers
- **Impact:** Looks like network reconnaissance to AV/EDR and to Play reviewers. See [PLAY_STORE_REVIEW.md](./PLAY_STORE_REVIEW.md).
- **Fix:** Prefer QR-supplied host or mDNS. If you keep a scan, rate-limit and disclose it.

#### M-M3 — OTP expiry is UI-only

- **Where:** `PairCodeScreen` countdown vs `App.tsx` connection effect
- **Fix:** On expire, close the WebSocket and `cancelPairing()`.

#### M-M4 — Deck icons allow `http://` and `file:` URIs

- **Where:** `DeckGrid.tsx` image `source`
- **Fix:** Allow only `data:image/*` (maybe `https:`). Block `file:` and arbitrary `http:`.

### Low / info

| ID | Issue | Notes |
| --- | --- | --- |
| M-L1 | Device name/model sent on every hello over cleartext | `DeviceNameModule.kt` + `getDeviceInfo()` |
| M-L2 | Empty `NSLocationWhenInUseUsageDescription` | iOS App Review risk; Play N/A. Remove the key if unused |
| M-L3 | Generic IDs: `com.mobile`, iOS `org.reactjs.native.example...` | Collision + store policy. Change **before first publish** |
| M-L4 | ProGuard/R8 off in release | Easier reverse engineering of the protocol |
| M-I1 | `allowBackup="false"` | Good |
| M-I2 | Manifest permissions are lean (`INTERNET` + `CAMERA`) | Good — confirm the **merged** manifest after Vision Camera |
| M-I3 | No ads / analytics SDKs in `package.json` | Good |
| M-I4 | `targetSdkVersion = 36` | Meets the 31 Aug 2026 Play target-API rule |
| M-I5 | iOS ATS: `NSAllowsArbitraryLoads=false`, `NSAllowsLocalNetworking=true` | Better than Android’s global cleartext flag |

---

## Cross-cutting recommendations (priority order)

1. **Stop treating “same Wi-Fi” as encryption.** TLS or a pinned pairing cert; bind the desktop to one LAN IP.
2. **Split pairing secret and device secret.** Rotate on pair. Hash at rest on the PC.
3. **Confirm PIN pairing on the desktop** and lock out after a few failures.
4. **Encrypt tokens on the phone** (Keystore/Keychain).
5. **Default-deny script launch** (`.ps1` / `.bat`) in custom flows.
6. **Validate IPC and protocol messages** in the Electron main process.
7. **Replace `com.mobile` + debug signing** before any Play upload.
8. **Scope Android cleartext** to RFC1918 via `network_security_config`.
9. **Reject QR hosts outside private ranges** and confirm before connect.
10. **Prefer mDNS / QR host** over blasting the whole `/24`.

---

## Out of scope / not found

- No cloud backend, no third-party analytics in the declared mobile dependencies
- No accessibility service, device-admin, SMS, or `QUERY_ALL_PACKAGES` in the app manifest
- Phone cannot push a new deck layout over the WebSocket
- This audit did not include a live MITM demo, malware scan of `node_modules`, or a merged-manifest permission dump from a release AAB
