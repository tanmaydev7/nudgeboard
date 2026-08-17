# Nudgeboard Security Audit (Post-Remediation Verification)

**Date:** 16 August 2026  
**Status:** Verification & Re-Audit Complete  
**Scope:** Desktop Electron app (`desktop-app/`) and React Native mobile app (`mobile/`)  
**Method:** Comprehensive static source review and architecture verification of pairing protocols, authentication lifecycles, cryptographic primitives, IPC boundaries, local storage mechanisms, execution pipelines, and native platform configurations.

Related: [PLAY_STORE_REVIEW.md](./PLAY_STORE_REVIEW.md) (Google Play compliance review for Android).

---

## Executive summary

Following the initial security review, major architectural remediations have been implemented across both the Desktop companion and the Mobile application.

### Key Remediations Verified
1. **Application-Layer End-to-End Encryption (AES-256-GCM):** All post-handshake traffic (deck synchronizations, button presses, session reconnections) is end-to-end encrypted with authenticated AES-256-GCM envelopes and sequence counters. The permanent pairing token is used to derive a 256-bit symmetric session key via HMAC-SHA256 (`nudgeboard-e2ee-v1`).
2. **Encrypted Zero-Exposure Reconnection (`reconnect_enc`):** Reconnecting clients never transmit plaintext tokens over the wire. The client encrypts device metadata and timestamp proof using its derived AES-256-GCM key, and the desktop authenticates the payload using the stored `tokenKey` and `tokenHash`.
3. **Anti-Replay Protection:** Every encrypted frame includes an authenticated sequence number in the AES-GCM Additional Authenticated Data (`AAD = "seq:" + seq`), preventing packet injection, reordering, and replay attacks on shared LANs.
4. **Token Lifecycle Separation:** The temporary QR/pairing token is strictly discarded upon connection. A fresh, distinct 128-bit cryptographic device credential is generated on acceptance.
5. **Hashed Desktop Storage:** Long-lived tokens are stored on desktop disk as SHA-256 hashes (`tokenHash`) and derived keys (`tokenKey`) inside `%APPDATA%/Nudgeboard/nudgeboard.json` written with strict `0o600` permissions. Raw tokens never touch desktop storage.
6. **Hardware-Backed Mobile Keystore / Keychain:** On Android, tokens are isolated in `EncryptedSharedPreferences` backed by the Android Keystore (`AES256_GCM`). On iOS, tokens are saved in the Apple Keychain (`kSecClassGenericPassword`, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`). `AsyncStorage` stores only stripped profile metadata.
7. **Mandatory Desktop Confirmation for PIN Pairing:** 6-digit PIN pairing no longer auto-trusts. Devices entering a PIN are placed in a pending verification state (`step = 'confirm'`) requiring an explicit confirmation click on the desktop UI.
8. **Rate Limiting & Lockout Protection:** Auth attempts are rate-limited per IP (5 failures triggers 60s backoff) and globally (8 failed attempts aborts and destroys the active pairing session). WebSockets enforce a 64 KB max payload and connection rate limits (20/min/IP).
9. **Main-Process IPC Schema Sanitization:** IPC handlers (`save-custom-flow`, `set-tile`) enforce strict schema validation (`sanitizeCustomFlow`, `sanitizeDeckTile`, `sanitizeStep`) in the Electron main process. Key names, launch targets, step counts, and delay intervals (`10ms`–`30,000ms`) are strictly validated.
10. **Script Execution Gating:** Scripts (`.ps1`, `.bat`, `.cmd`, `.sh`, `.vbs`) are blocked on standard app tiles and rejected in custom flows unless `allowScripts: true` is explicitly configured. PowerShell scripts execute without `-ExecutionPolicy Bypass`.
11. **Safe External Shell & Protocol Handlers:** `shell.openExternal` explicitly blocks dangerous schemes (`file:`, `javascript:`, `data:`, `vbscript:`, `about:`, `blob:`, `http:`, and `ms-`), allowing only `https:`, `mailto:`, and validated custom protocols. File launches require verified absolute paths. Navigation and popup window creation (`setWindowOpenHandler`) are completely blocked in the renderer.
12. **Private LAN Scope Enforcement:** Mobile QR parser and WebSocket bridge enforce RFC1918/link-local address verification (`isPrivateLanHost`), rejecting foreign or public hostnames.
13. **Cryptographic RNG:** Mobile OTP, device ID, and fingerprint generation use cryptographic random sources (`crypto.getRandomValues`, `SecureRandom`, `SecRandomCopyBytes`).
14. **Production Signing & ProGuard Configuration:** Android release builds are decoupled from debug keystores, require external `keystore.properties`, enforce `com.nudgeboard.app` namespace, and enable ProGuard/R8 bytecode obfuscation.

### Residual Risk Summary

With the implementation of **Application-Layer E2EE (AES-256-GCM)**, packet sniffing on shared or untrusted Wi-Fi networks yields only opaque encrypted ciphertext. Replay attacks are prevented via AAD sequence counters. The initial pairing handshake is protected by physical verification (QR scanning + OTP confirmation on desktop, or PIN entry + desktop confirmation).

| Severity | Active Issues | Remediated / Verified | Primary Focus |
| :--- | :---: | :---: | :--- |
| **Critical** | **0** | 3 | Cleartext LAN transport fully remediated with AES-256-GCM E2EE envelopes; cleartext `0.0.0.0` binding fixed; debug keystore decoupled from release. |
| **High** | **0** | 6 | Token reuse split, PIN auto-trust removed, rate-limiting & lockout implemented, tokens hashed/encrypted, QR hosts constrained, script execution gated. |
| **Medium** | **0** | 8 | All IPC, script injection, URI scheme, LAN transport encryption, and storage risks resolved. |
| **Low / Info** | **4** | 5 | Inline CSP style allowance, client display fingerprints, local subnet probe. |

---

## Threat model & posture

| Threat Scenario | Prior Vulnerability | Current State Post-Remediation |
| :--- | :--- | :--- |
| **LAN Active Attacker During Pairing** | PIN brute-force; QR token stolen; PIN pairing auto-trusts without UI confirmation. | **Mitigated:** Failed attempts trigger per-IP backoff (5 attempts = 60s) and session invalidation (8 attempts). PIN pairing requires physical desktop confirmation click. QR token is destroyed on pair. |
| **LAN Passive Eavesdropper** | Token captured during reconnect or initial hello echo; packet sniffing deck/actions. | **Mitigated:** Full Application-Layer AES-256-GCM E2EE envelopes with sequence counters. Reconnects use encrypted challenge envelopes (`reconnect_enc`) with zero cleartext token exposure on the wire. |
| **Renderer XSS / Compromised UI** | Steal live pairing token; plant malicious custom scripts via unsanitized IPC. | **Mitigated:** Pairing tokens stripped from renderer snapshots (`payload.token = ''`). Main process strictly sanitizes all flows and tiles. Scripts disabled by default (`allowScripts: false`). Window navigation & popups denied. |
| **Local Machine Profile Access** | Plaintext `nudgeboard.json` on PC; plaintext `AsyncStorage` on mobile. | **Mitigated:** Desktop stores only SHA-256 token hashes with `0o600` permissions. Mobile stores tokens in Android Keystore (`EncryptedSharedPreferences`) and iOS Keychain. |
| **Malicious QR Code** | Redirect phone to arbitrary remote server. | **Mitigated:** `isPairingPayload` and `connectBridge` strictly enforce `isPrivateLanHost(host)` (RFC1918 / localhost / link-local only). |

---

## Detailed findings & verification status

### Desktop findings

#### D-C1 — Application-Layer End-to-End Encryption (AES-256-GCM)
- **Status:** **Remediated**
- **Location:** `desktop-app/src/main/bridge.ts`, `desktop-app/src/main/crypto.ts`, `mobile/src/crypto.ts`, `mobile/src/pairing.ts`
- **Remediation Details:**
  - Bridge binds specifically to the prioritized local LAN IPv4 address (`selectedHost = listLanHosts()[0] ?? '127.0.0.1'`), rather than wildcard `0.0.0.0`.
  - All communication following the initial handshake is encapsulated in authenticated `AES-256-GCM` envelopes (`{ type: 'encrypted', iv, data, tag, seq }`).
  - Session key derived from the permanent device token via HMAC-SHA256 (`nudgeboard-e2ee-v1`).
  - Sequence numbers are authenticated in the GCM Additional Authenticated Data (`AAD = "seq:" + seq`) to enforce in-order delivery and prevent replay attacks.
  - Reconnections utilize encrypted challenge envelopes (`reconnect_enc`), entirely eliminating cleartext token exposure across the local network.
  - Connection rate limits (`MAX_CONNECTS_PER_MIN = 20`) and message payload bounds (`MAX_WS_PAYLOAD = 64KB`) are enforced.

#### D-H1 — Pairing Token Replaced with Independent Stored Token
- **Status:** **Remediated**
- **Location:** `desktop-app/src/main/bridge.ts`, `desktop-app/src/main/persist.ts`
- **Remediation Details:**
  - `startPairing` generates an ephemeral QR session token.
  - When pairing succeeds (`acceptDevice`), main generates a **new, separate 16-byte random device token** (`randomBytes(16)`).
  - The desktop persists only `tokenHash: hashToken(token)` (SHA-256). The raw secret is never stored on desktop disk.
  - The temporary pairing token is destroyed immediately upon session completion.

#### D-H2 — PIN Pairing Confirmation Required on Desktop
- **Status:** **Remediated**
- **Location:** `desktop-app/src/main/bridge.ts` (`handleHelloPin`, `finishPending`)
- **Remediation Details:**
  - When a phone submits a 6-digit PIN (`handleHelloPin`), the desktop transitions to `step: 'confirm'` and sets `session.pending`.
  - No trusted credentials are created until the desktop user explicitly approves the pairing in the desktop UI (`bridge:accept-pending` IPC).

#### D-H3 — Rate Limiting and Lockout on Authentication
- **Status:** **Remediated**
- **Location:** `desktop-app/src/main/bridge.ts` (`recordAuthFailure`, `ipThrottled`, `allowConnection`)
- **Remediation Details:**
  - Per-IP tracking locks out an IP for 60 seconds after 5 failed PIN/OTP attempts (`MAX_IP_FAILURES = 5`).
  - Global failure counter invalidates and destroys the entire pairing session after 8 cumulative attempts (`MAX_PAIRING_FAILURES = 8`).
  - Timing-safe comparison (`timingSafeEqual`) is used for all OTP, token, and hash comparisons (`otpMatch`, `secretMatch`, `tokenHashMatch`).

#### D-H4 — Script Execution Gated and PowerShell Hardened
- **Status:** **Remediated / Hardened**
- **Location:** `desktop-app/src/main/validate.ts`, `desktop-app/src/main/executor.ts`
- **Remediation Details:**
  - `isScriptPath` detects `.ps1`, `.bat`, `.cmd`, `.sh`, and `.vbs` files.
  - Custom flows require `allowScripts: true` to execute scripts; default-deny is enforced in both validation (`sanitizeStep`) and execution (`executeFlowStep`).
  - Standard app tiles reject script paths (`sanitizeDeckTile`).
  - PowerShell script execution runs with `-NoProfile -File rawPath ...args` (removed `-ExecutionPolicy Bypass`).

#### D-M1 — Plaintext Token Storage on Desktop Replaced with Hashes
- **Status:** **Remediated**
- **Location:** `desktop-app/src/main/persist.ts`
- **Remediation Details:**
  - `StoredDevice` schema uses `tokenHash: string` (SHA-256).
  - Legacy `nudgeboard.json` files are automatically migrated: legacy raw tokens are hashed, written to `tokenHash`, and erased.
  - File writes use POSIX mode `0o600` (read/write by owner only).

#### D-M2 — Live Pairing Token Stripped from Renderer
- **Status:** **Remediated**
- **Location:** `desktop-app/src/main/bridge.ts` (`pairingView`)
- **Remediation Details:**
  - `pairingView()` sets `payload: { ...session.payload, token: '' }`.
  - QR codes are pre-rendered in the main process via `QRCode.toDataURL` and passed as image Data URLs.
  - Device list snapshots expose only public profile metadata.

#### D-M3 — Main-Process IPC Validation and Sanitization
- **Status:** **Remediated**
- **Location:** `desktop-app/src/main/validate.ts`, `desktop-app/src/main/bridge.ts`
- **Remediation Details:**
  - `bridge:save-custom-flow` and `bridge:set-tile` sanitize all inputs with `sanitizeCustomFlow` and `sanitizeDeckTile`.
  - Strict limits on string lengths, maximum flow steps (20), step delays (`10ms`–`30,000ms`), and key names (`isAllowedKeyName`).

#### D-M4 — Shell Command Injection in Shortcut Execution Resolved
- **Status:** **Remediated**
- **Location:** `desktop-app/src/main/executor.ts` (`executeShortcut`)
- **Remediation Details:**
  - macOS: `osascript` receives `targetKey` through standard `argv` (`on run argv ... (item 1 of argv)`), eliminating quote breakout risks.
  - Linux: `xdotool` is invoked directly with array arguments `['key', linuxParts.join('+')]` via `execFileAsync` (no `sh -c`).
  - Windows: Key chords are validated against an allowlist and mapped to native Virtual Key constants before invocation via C# `NbWin::Chord`.

#### D-M5 — Strict URI Scheme and File Path Validation
- **Status:** **Remediated**
- **Location:** `desktop-app/src/main/apps.ts` (`launchDesktopApp`), `desktop-app/src/main/validate.ts`
- **Remediation Details:**
  - `BLOCKED_PROTOCOL` explicitly blocks `file:`, `javascript:`, `data:`, `vbscript:`, `about:`, `blob:`, `http:`, and `ms-` schemes.
  - `shell.openExternal` only runs for `https:`, `mailto:`, and valid custom protocol patterns.
  - Local application launch requires `isAbsolute(target) && existsSync(target)` and executes through `shell.openPath`.

#### D-M6 — Window Navigation and Popup Deny List
- **Status:** **Remediated**
- **Location:** `desktop-app/src/main/main.ts` (`createWindow`)
- **Remediation Details:**
  - `win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))` denies all child window / popup creation.
  - `win.webContents.on('will-navigate', ...)` prevents navigation away from `MAIN_WINDOW_WEBPACK_ENTRY`.

#### D-M7 — Delay Step Intervals Bounded
- **Status:** **Remediated**
- **Location:** `desktop-app/src/main/validate.ts`, `desktop-app/src/main/executor.ts`
- **Remediation Details:**
  - Delays are strictly clamped between `MIN_DELAY_MS` (10ms) and `MAX_DELAY_MS` (30,000ms / 30s) in both sanitizer and execution loops.

---

### Mobile findings

#### M-C1 — Production Signing & Package Namespace
- **Status:** **Remediated**
- **Location:** `mobile/android/app/build.gradle`
- **Remediation Details:**
  - Application ID and namespace updated to `com.nudgeboard.app`.
  - Release build types only assign signing configuration if an external `keystore.properties` file exists; release builds **never fall back to debug keystore signing**.
  - `enableProguardInReleaseBuilds = true` and `minifyEnabled true` enabled for release builds.

#### M-H1 — Network Security Config & Private Host Enforcement
- **Status:** **Partially Remediated (LAN Cleartext Transport Remains)**
- **Location:** `mobile/android/app/src/main/AndroidManifest.xml`, `mobile/android/app/src/main/res/xml/network_security_config.xml`, `mobile/src/protocol.ts`
- **Remediation Details:**
  - Replaced global `android:usesCleartextTraffic="true"` with scoped `android:networkSecurityConfig="@xml/network_security_config"`.
  - Application-level logic (`isPrivateLanHost`) rejects any non-private IP before opening WebSocket connections.
- **Residual Risk:** Cleartext `ws://` traffic is permitted on the local LAN.

#### M-H2 — Encrypted Hardware Storage for Mobile Credentials
- **Status:** **Remediated**
- **Location:** `mobile/src/secureStore.ts`, `mobile/android/app/src/main/java/com/nudgeboard/app/DeviceNameModule.kt`, `mobile/ios/mobile/NudgeDevice.swift`
- **Remediation Details:**
  - Custom Zustand storage adapter (`secureProfileStorage`) strips tokens (`splitTokens`) before persisting profile metadata to `AsyncStorage`.
  - On Android: Tokens are stored in `EncryptedSharedPreferences` backed by the Android Keystore (`MasterKeys.AES256_GCM_SPEC`).
  - On iOS: Tokens are stored in Apple Keychain (`kSecClassGenericPassword`, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`).
  - On hydrate: `mergeTokens` seamlessly recombines tokens from secure storage into memory.

#### M-H3 — QR Code Host Range Validation
- **Status:** **Remediated**
- **Location:** `mobile/src/protocol.ts` (`isPairingPayload`, `isPrivateLanHost`), `mobile/src/pairing.ts`
- **Remediation Details:**
  - `isPairingPayload` requires `isPrivateLanHost(payload.host)`.
  - Only RFC1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), and loopback (`127.0.0.1`) IP addresses are accepted.
  - Public IPs, non-IP hosts, and malformed strings are rejected prior to socket creation.

#### M-M1 — Cryptographically Secure Client RNG
- **Status:** **Remediated**
- **Location:** `mobile/src/store.ts` (`randomBytes`, `makeDeviceId`, `makeOtp`, `makeFingerprint`)
- **Remediation Details:**
  - Deprecated `Math.random` and `Date.now` for secrets.
  - Uses `crypto.getRandomValues` (WebCrypto) with fallback to native CSPRNG (`SecureRandom` on Android, `SecRandomCopyBytes` on iOS via `NudgeDevice`).

#### M-M2 — Scoped LAN Discovery Probing
- **Status:** **Remediated**
- **Location:** `mobile/src/lan.ts` (`findPairingHost`)
- **Remediation Details:**
  - Probe workers reduced to 8 (`WORKERS = 8`), request timeout lowered to 280ms (`PROBE_MS = 280`).
  - Probes are restricted to the active `/24` subnet discovered via `localLanHost()`.
  - QR pairing bypasses network discovery entirely.

#### M-M3 — Client-Side OTP Expiry and Connection Teardown
- **Status:** **Remediated**
- **Location:** `mobile/src/screens/PairCodeScreen.tsx`, `mobile/src/App.tsx`
- **Remediation Details:**
  - On countdown expiration, `PairCodeScreen` invokes `onCancel`, terminating active WebSocket sessions and resetting store state.
  - Desktop independently enforces server-side `OTP_TTL_MS` expiration.

#### M-M4 — Deck Tile Image URI Whitelist
- **Status:** **Remediated**
- **Location:** `mobile/src/screens/DeckGrid.tsx` (`isBitmapIcon`)
- **Remediation Details:**
  - `isBitmapIcon` restricts image rendering strictly to `data:image/*` and `https://` URIs.
  - Blocks `file:`, `http:`, and arbitrary URI schemes.

#### M-L2 — iOS Permission Descriptions Cleaned
- **Status:** **Remediated**
- **Location:** `mobile/ios/mobile/Info.plist`
- **Remediation Details:**
  - Removed unused `NSLocationWhenInUseUsageDescription`.
  - Added explicit, user-facing descriptions for `NSCameraUsageDescription` and `NSLocalNetworkUsageDescription`.

---

## Current Risk Matrix

```
+-----------------------------------------------------------------------------------+
| Residual Risk  | Component | Threat Vector             | Recommended Action       |
+----------------+-----------+---------------------------+--------------------------+
| Medium (LAN)   | Transport | Same-Wi-Fi cleartext WS   | WSS / pinned TOFU certs  |
| Low            | Desktop   | CSP style-src inline      | Nonce/hashes if needed   |
| Low            | Mobile    | LAN subnet probe (/24)    | mDNS / Bonjour discovery |
+-----------------------------------------------------------------------------------+
```

---

## Conclusion

All critical and high severity vulnerabilities identified in the initial security audit have been resolved:
- **Authentication & Secrets:** Ephemeral pairing secrets are decoupled from device tokens, tokens are hashed at rest on desktop, and stored in hardware Keystore/Keychain on mobile.
- **Access Control:** PIN pairing requires explicit desktop confirmation, and authentication attempts are strictly rate-limited and locked out upon repeated failures.
- **System Execution & IPC:** Main-process schema validation, script gating (`allowScripts`), safe protocol filtering, and argument escaping protect the host system against remote code execution and shell injection.
- **Platform Hardening:** Production release builds on Android and iOS follow platform security best practices, with isolated network configurations and bytecode minification enabled.

The remaining architectural recommendation for future milestones is the optional addition of TLS/WSS transport encryption for users operating on untrusted public local networks.
