# Google Play review risk — Nudgeboard mobile

**Date:** 16 August 2026  
**App:** `mobile/` (React Native, Android `applicationId` currently `com.mobile`)  
**Policies referenced:** [User Data](https://support.google.com/googleplay/android-developer/answer/10144311), [Data safety form](https://support.google.com/googleplay/android-developer/answer/10787469), [Deceptive Behavior](https://support.google.com/googleplay/android-developer/answer/9888077), target API (new apps/updates must target API 36 by 31 August 2026).

This is not a Play Console pre-review. It is a source-based list of **what is likely to get this binary rejected or blocked on upload**, versus what is fine if you disclose it honestly.

Full security write-up: [SECURITY_AUDIT.md](./SECURITY_AUDIT.md).

---

## Short answer

**Yes — as the project sits today, a Play upload is likely to fail or be rejected.** The blockers are packaging and policy paperwork more than “this product type is banned.”

A Stream Deck–style companion that talks to **the user’s own PC on the same Wi-Fi** is allowed if:

- the listing says that clearly (not “security,” not hidden remote control),
- camera is only for QR pairing and you explain it before/at the prompt,
- you host a real privacy policy and fill Data safety to match the code,
- you are not signed with the debug keystore and not using `com.mobile`.

LAN scanning + cleartext `ws://` will get **questions**, not an automatic malware ban, if you disclose them.

---

## Likely reject or upload failure

Fix these before the first production AAB. Several are one-way (`applicationId`).

### 1. Package name `com.mobile`

- **Evidence:** `mobile/android/app/build.gradle` — `namespace` / `applicationId` `"com.mobile"`
- **Why it fails:** Generic / example IDs collide, look like a template, and can be blocked or cause ownership fights. **You cannot change `applicationId` after the first upload** without a new listing.
- **Do this:** Pick a reverse-DNS id you own, e.g. `com.nudgeboard.app`, **before** any Play track.

### 2. Release signed with the debug keystore

- **Evidence:** `mobile/android/app/build.gradle` — `release { signingConfig signingConfigs.debug }` and hardcoded `android` / `androiddebugkey`
- **Why it fails:** Play App Signing / integrity will not accept a debug-signed production artifact as a real release. It is also a security issue ([SECURITY_AUDIT.md](./SECURITY_AUDIT.md) M-C1).
- **Do this:** Create an upload keystore, enable Play App Signing, never commit the production key.

### 3. No privacy policy

- **Evidence:** No policy URL, in-app link, or hosted page in the repo
- **Why it fails:** Play’s User Data policy requires a **public privacy policy in Play Console and inside the app for every app**, including apps with no cloud backend. Camera + device name + app-generated IDs + pairing tokens make this non-optional.
- **Do this:** HTTPS page that states, in plain language:
  - Camera is used only to scan a pairing QR; frames are not uploaded
  - The app talks to your PC on the local network (HTTP/WS), not to Nudgeboard servers (if that stays true)
  - Device name/model and an app-generated id are sent to **that PC** for pairing
  - Pairing tokens are stored on the phone; how to unpair / wipe
  - No ads / no analytics (if still true)
  - Contact email  
  Link it in Console **and** from an in-app About/Help screen.

### 4. Data safety form missing or “we collect nothing”

- **Evidence:** No Data safety artifacts; code stores `deviceId`, fingerprints, pairing `token`s; uses camera; talks over the LAN
- **Why it fails:** A mismatch between the form, the privacy policy, and the binary is one of the most common 2026 rejections. “No data collected” is false even if nothing goes to *your* cloud.
- **Declare at least:**
  - **Device or other IDs** — app-generated `deviceId` / fingerprint (collected, not shared with third parties, stored on device)
  - **App activity / device communications** as needed for “connect to the user’s PC”
  - **Photos and videos:** usually **not collected** if you never save or upload camera frames (QR is processed on-device). Be precise; do not claim “no camera” if you request `CAMERA`
  - **Advertising ID:** not used — say so
- Re-check the **merged** AndroidManifest after a release build so Vision Camera did not inject extra data types.

### 5. Camera permission with no in-app disclosure before the system dialog

- **Evidence:** `ScanScreen.tsx` calls `requestPermission()` on mount; `AndroidManifest` has `CAMERA`; iOS string is good (`NSCameraUsageDescription`)
- **Why it can fail:** User Data / Photos and videos policies expect a **prominent in-app explanation of why you need the camera before** the OS prompt, especially when the permission is sensitive. Auto-prompt on screen open is a common review note.
- **Do this:** Short screen: “Nudgeboard uses the camera only to scan the QR on your PC. Nothing is uploaded.” → Continue → then `requestPermission()`. Never request camera on the deck screen.

---

## Possible reject (disclose, don’t hide)

These are not automatic bans. They become rejects if the listing, Data safety, or permissions look like spyware or don’t match the binary.

### 6. App-wide cleartext traffic

- **Evidence:** `android:usesCleartextTraffic="true"` and no `network_security_config`
- **Risk:** Security review flag. iOS already does this better (`NSAllowsArbitraryLoads=false`, `NSAllowsLocalNetworking=true`).
- **Do this:** Add a network security config that permits cleartext **only** for RFC1918 (`10/8`, `172.16/12`, `192.168/16`). Mention LAN HTTP/WS in the privacy policy.

### 7. LAN host scanning

- **Evidence:** `mobile/src/lan.ts` probes up to a full `/24` (or 762 fallback IPs) looking for `/nudgeboard/pairing`
- **Risk:** Reviewers and malware scanners treat wide LAN probes as reconnaissance. Fine for a “enter the 6-digit code” fallback **if you say so**.
- **Do this:** Store listing + privacy policy: “If you type the pairing code, the app may briefly look for your PC on the local Wi-Fi.” Prefer QR (host already in the payload) so scan is not the default path. mDNS would look cleaner.

### 8. Remote control of a PC (Deceptive Behavior)

- **Evidence:** Product: tap tile → desktop `press` → launch apps / send keystrokes
- **Risk:** Not banned. **Hidden** remote control, “antivirus,” or “system cleaner” framing *is* banned. Metadata must match behavior.
- **Do this:** Title/description/screenshots: “Companion for **your** Windows/Mac PC on the same Wi-Fi. Pair with a QR, then launch apps you set up on the computer.” Show pairing + the deck. Do not claim the phone can control *other people’s* machines. Unpair must be obvious (you already have Log out).

### 9. Persistent device identifier

- **Evidence:** `store.ts` persists `deviceId` / `fingerprint` in AsyncStorage
- **Risk:** Not GAID/IMEI (good). Still a device identifier for Data safety. If you say “we don’t collect IDs,” reject.
- **Do this:** Disclose app-generated IDs; they stay on device + the paired PC.

### 10. “Account” wording vs account-deletion policy

- **Evidence:** Local desktop profiles + tokens; no cloud user account
- **Risk:** Play requires a **web** account-deletion path for apps that **create accounts**. If the listing says “sign in / account,” reviewers may demand a website deletion flow you don’t have.
- **Do this:** Call it **pairing**, not an account. Document unpair on phone and on the desktop app. Do not add a fake login.

### 11. Incomplete listing / template branding

- **Evidence:** `app.json` `"name": "mobile"`, `versionName "1.0"`, `versionCode 1`
- **Risk:** Soft reject or policy friction until screenshots, feature graphic, and a non-template name are ready. Crashes on the pre-launch report also reject.

---

## Unlikely to reject (you’re already in good shape)

| Topic | Why it’s OK |
| --- | --- |
| Target API too old | `targetSdkVersion = 36` already (required for new apps/updates by 31 Aug 2026) |
| Restricted permissions | App manifest only has `INTERNET` + `CAMERA`. No SMS, call log, accessibility, device admin, `QUERY_ALL_PACKAGES`, `REQUEST_INSTALL_PACKAGES`, notification listener, background location, foreground service |
| Photo library / `READ_MEDIA_*` | Not requested in the app manifest (confirm merged manifest) |
| Advertising ID | Not in dependencies; declare unused |
| Families / kids | Do **not** opt into Designed for Families |
| VPN / crypto / SMS | Not present |
| iOS empty location string | Play N/A; **will** hurt Apple review — delete `NSLocationWhenInUseUsageDescription` if you don’t use location |

---

## What Play will think you collect (honest Data safety draft)

Use this as a starting checklist; adjust if you add analytics later.

| Data type | Collected? | Shared with third parties? | Purpose |
| --- | --- | --- | --- |
| Camera (live QR) | Processed on device; **do not** say you collect photos if you never save/upload | No | App functionality (pairing) |
| Device or other IDs | Yes — app-generated id + short fingerprint | No (only sent to the user’s PC) | App functionality |
| Device name / model | Yes — shown on the PC pairing UI | No | App functionality |
| Approximate / precise location | No (unless a library injects it — check merged manifest) | — | — |
| Files and docs | No | — | — |
| Audio | No | — | — |
| Personal info (name, email) | No, unless you add accounts | — | — |

Encryption in transit: **today, no** (cleartext WS). Either say “data is sent over the local network without TLS” in the policy, or add TLS before you claim encryption.

---

## Pre-submit checklist

1. Change `applicationId` off `com.mobile`.
2. Production signing + Play App Signing.
3. Host privacy policy (HTTPS) and link it in-app.
4. Fill Data safety to match the table above.
5. Camera purpose screen **before** `requestPermission()`.
6. Listing copy: own-PC companion, same Wi-Fi, QR pairing, what a tile does.
7. Screenshots of pairing + deck (no unrelated stock photos).
8. Scope cleartext to LAN **or** document why HTTP/WS on the LAN is required.
9. Build a release AAB and inspect **merged manifest** for surprise permissions.
10. Pre-launch report: pairing + deck must not crash.
11. Do not mark as a kids app.
12. If you add Firebase/Ads later, redo Data safety the same day.

---

## Bottom line

| Will Play reject this *kind* of app? | No, if you describe it as a user-owned PC companion. |
| --- | --- |
| Will Play reject *this* binary as-is? | **Very likely yes** — `com.mobile`, debug signing, no privacy policy, Data safety blank, camera auto-prompt. |
| After packaging + policy hygiene? | Residual risk is LAN scan + cleartext + remote-control honesty. Those are manageable with disclosure, not product removal. |
