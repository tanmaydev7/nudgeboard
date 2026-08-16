# NudgeBoard

**Turn your iPhone or Android device into an interactive Stream Deck-style macro pad for your PC, Mac, or Linux workstation.**

NudgeBoard provides a responsive, low-latency companion deck right from your pocket. Launch applications, trigger tools, and navigate custom action pages with a single tap over your local Wi-Fi network—with **zero cloud dependency**, **no third-party accounts**, and **instant response times**.

---

## Highlights

- **Instant QR Code Pairing**: Scan a QR code from the desktop screen to pair your phone in seconds.
- **Manual PIN Fallback with LAN Auto-Discovery**: No working camera? Enter a 6-digit PIN while the mobile app automatically discovers your computer across your local subnet.
- **8-Slot Grid with Multi-Page Carousel**: 4 columns × 2 rows responsive macro pad with smooth horizontal paging for up to 8 pages (64 custom shortcuts).
- **Automated Desktop App Cataloging**: Automatically discovers installed software—including Windows Start Menu shortcuts, MSIX/UWP Store applications, macOS `.app` bundles, and Linux `.desktop` entries.
- **High-Res Icon Extraction**: Automatically extracts and streams crisp, high-resolution application icons directly to your phone.
- **Multi-Device & Multi-Profile Support**: Pair multiple phones to one computer or manage multiple computers on one phone, with distinct macro layouts per device.
- **100% Local & Privacy-First**: Operates exclusively over your local network using direct WebSocket connections. No telemetry, no external servers, no subscriptions.

---

## Architecture & Code Flow

For an in-depth technical breakdown of the network protocols, message schemas, sequence diagrams, and file-by-file code trace, read the [**Full Architecture & Technical Code Flow Guide (ARCHITECTURE.md)**](./ARCHITECTURE.md).

### How Mobile & Desktop Communicate (Summary)

```
┌────────────────────────┐                   ┌────────────────────────┐
│     Mobile Client      │                   │      Desktop Host      │
│  (React Native + RNVC) │                   │  (Electron + React 19) │
└───────────┬────────────┘                   └───────────┬────────────┘
            │                                            │
            │ 1. Scan QR Code or Probe LAN               │
            │    (ws://<desktop-ip>:47890)               │
            │ ─────────────────────────────────────────► │
            │                                            │
            │ 2. Handshake: `hello` / `hello_pin` / `reconnect`
            │    (with cryptographic token / OTP)        │
            │ ─────────────────────────────────────────► │
            │                                            │
            │ 3. Authenticated: `hello_ok`               │
            │    Broadcasts current deck & base64 icons  │
            │ ◄───────────────────────────────────────── │
            │                                            │
            │ 4. User taps Tile: `{ type: 'press', id }` │
            │ ─────────────────────────────────────────► │
            │                                            │
            │                                    5. Launches App!
            │                                       (Process execution)
```

1. **Host Setup**: When the desktop app opens, it starts a local HTTP/WebSocket bridge server on port `47890` (hunting up to port `47909` if occupied) and exposes an ephemeral pairing token.
2. **Pairing**:
   - **QR Flow**: The mobile app scans the desktop QR code using `react-native-vision-camera`, generates a 6-digit OTP, and connects over WebSocket. The user enters the OTP into the desktop UI to verify ownership (`crypto.timingSafeEqual`).
   - **PIN Flow**: If camera scanning is skipped, the user inputs the 6-digit desktop PIN. The phone concurrently probes the `/24` subnet (`GET /nudgeboard/pairing`) to auto-discover the desktop host and completes pairing.
3. **Deck Sync**: The desktop scans installed operating system applications, resolves high-res icons to base64 PNG data URLs, and streams the active layout (`{ type: 'deck', columns: 4, rows: 2, tiles: [...] }`) to the phone.
4. **Action Execution**: Tapping a tile sends `{ type: 'press', id }` over the WebSocket. The desktop host maps the ID to the assigned application path and spawns the target process natively.

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Desktop App** | [Electron 43](https://www.electronjs.org/), [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Electron Forge](https://www.electronforge.io/), [Webpack](https://webpack.js.org/), [ws (WebSocket)](https://github.com/websockets/ws), [Zustand](https://github.com/pmndrs/zustand) |
| **Mobile App** | [React Native 0.86](https://reactnative.dev/), [TypeScript](https://www.typescriptlang.org/), [Zustand](https://github.com/pmndrs/zustand) + [AsyncStorage](https://github.com/react-native-async-storage/async-storage), [VisionCamera Barcode Scanner](https://github.com/mrousavy/react-native-vision-camera), [Gorhom Bottom Sheet](https://github.com/gorhom/react-native-bottom-sheet), [Kotlin Android Native Modules](https://kotlinlang.org/) |
| **Protocol** | Custom JSON-RPC over WebSocket, HTTP LAN discovery probe, base64 PNG icon streaming |

---

## Project Structure

```
nudgeboard/
├── ARCHITECTURE.md                 # Complete technical architecture & communication guide
├── README.md                       # Project overview and instructions
│
├── desktop-app/                    # Electron Desktop Application
│   ├── src/
│   │   ├── main/                   # Node.js Electron Main Process
│   │   │   ├── main.ts             # App lifecycle, window configuration, CSP security
│   │   │   ├── bridge.ts           # HTTP & WebSocket server, session pairing logic
│   │   │   ├── apps.ts             # OS app scanner (Windows, macOS, Linux) & launcher
│   │   │   └── persist.ts          # JSON persistence for paired devices and tiles
│   │   ├── preload/
│   │   │   └── preload.ts          # contextBridge IPC API bridge (`window.api`)
│   │   ├── shared/
│   │   │   ├── protocol.ts         # Shared wire protocol contracts & payloads
│   │   │   └── ipc-types.ts        # IPC contracts between Electron main and renderer
│   │   └── renderer/               # React 19 UI
│   │       ├── App.tsx             # Main view router (QR, OTP, Home Deck)
│   │       ├── store.ts            # Zustand client state
│   │       ├── index.css           # Desktop dark UI styling
│   │       └── screens/            # Home deck designer, app search, pairing screens
│   ├── package.json
│   └── forge.config.ts             # Electron Forge build & distribution configuration
│
└── mobile/                         # React Native Mobile Application
    ├── android/                    # Native Android project with custom Kotlin modules
    │   └── app/src/main/java/com/mobile/
    │       ├── DeviceNameModule.kt  # Native device identity hints & LAN IP resolver
    │       └── DeviceNamePackage.kt
    ├── ios/                        # Native iOS Xcode workspace & CocoaPods
    ├── src/
    │   ├── App.tsx                 # Root React Native app & WebSocket connection manager
    │   ├── protocol.ts             # Shared protocol definitions & helpers
    │   ├── pairing.ts              # WebSocket connector & device metadata assembler
    │   ├── lan.ts                  # Multi-threaded local subnet discovery
    │   ├── store.ts                # Zustand store with AsyncStorage persistence
    │   ├── deviceIdentity.ts       # Device name heuristic resolver
    │   └── screens/                # Camera scanner, OTP display, PIN input, Deck grid
    └── package.json
```

---

## Getting Started

### Prerequisites

- **Node.js**: `v20` or `v22+` recommended
- **npm** or **yarn**
- **Mobile Development**:
  - For Android: Android Studio, Android SDK (`API 34+`), and a physical device or emulator.
  - For iOS: macOS with Xcode 15+ and CocoaPods (`bundle install && bundle exec pod install`).

---

### 1. Setting Up the Desktop App

1. Navigate to the `desktop-app` directory:
   ```bash
   cd desktop-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Electron development application:
   ```bash
   npm start
   ```

4. *(Optional)* Package for production:
   ```bash
   npm run make
   ```
   Built installers and binaries will be output to the `desktop-app/out/make/` directory.

---

### 2. Setting Up the Mobile App

1. Navigate to the `mobile` directory:
   ```bash
   cd mobile
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the React Native Metro bundler:
   ```bash
   npm start
   ```

4. Run on Android or iOS:

   - **Android**:
     ```bash
     npm run android
     ```
   - **iOS**:
     ```bash
     cd ios && bundle exec pod install && cd ..
     npm run ios
     ```

---

## User Guide

1. **Launch Desktop App**: Open NudgeBoard on your computer. If no phone is paired, a pairing QR code and 6-digit PIN will be displayed.
2. **Open Mobile App**: Ensure your phone is connected to the same Wi-Fi network as your computer.
3. **Pair Device**:
   - Point the phone camera at the QR code on your monitor.
   - A 6-digit OTP will appear on your phone. Enter this code into the desktop app to confirm the link.
   - *Alternatively, tap "Enter code instead" on your phone to pair using the 6-digit PIN.*
4. **Customize Your Deck**:
   - In the desktop app, drag any application from the **App Library** into one of the 8 grid slots.
   - Add extra pages using the **+ Add page** button in the sidebar (supports up to 8 pages).
   - Clear any slot by clicking the **×** button on the slot.
5. **Launch with One Tap**:
   - The phone's deck updates in real-time with application names and icons.
   - Tap any tile on your phone to immediately launch the application on your PC!
   - Swipe horizontally on your phone to switch between action pages.

---

## Security & Privacy

- **Local Network Bound**: All traffic is strictly confined to your local Wi-Fi subnet.
- **Constant-Time Verification**: Verification tokens and pairing codes use `crypto.timingSafeEqual()` to guard against timing attacks.
- **Short-Lived Sessions**: Unpaired QR codes expire in 5 minutes; OTP verification requests expire in 2 minutes.
- **Strict Electron Sandboxing**: Electron renderer operates in isolated sandbox contexts (`contextIsolation: true`, `nodeIntegration: false`, production CSP).

---

## Contributing

Contributions, bug reports, and feature requests are welcome! Please open an issue or pull request on GitHub.

---

## License

This project is licensed under the [MIT License](./desktop-app/package.json).
