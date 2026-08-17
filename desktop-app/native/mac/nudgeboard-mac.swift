import CoreGraphics
import Darwin
import Foundation

private typealias MRSendCommandFn = @convention(c) (UInt32, UnsafeRawPointer?) -> DarwinBoolean

private let vkShift: CGKeyCode = 56
private let vkControl: CGKeyCode = 59
private let vkOption: CGKeyCode = 58
private let vkCommand: CGKeyCode = 55

private let flagShift: CGEventFlags = CGEventFlags(rawValue: 0x00020000)
private let flagControl: CGEventFlags = CGEventFlags(rawValue: 0x00040000)
private let flagOption: CGEventFlags = CGEventFlags(rawValue: 0x00080000)
private let flagCommand: CGEventFlags = CGEventFlags(rawValue: 0x00100000)

private let keyNames: [Int64: String] = [
    0: "A", 1: "S", 2: "D", 3: "F", 4: "H", 5: "G", 6: "Z", 7: "X", 8: "C", 9: "V",
    11: "B", 12: "Q", 13: "W", 14: "E", 15: "R", 16: "Y", 17: "T",
    18: "1", 19: "2", 20: "3", 21: "4", 22: "6", 23: "5", 25: "9", 26: "7", 28: "8", 29: "0",
    31: "O", 32: "U", 34: "I", 35: "P", 36: "Enter", 37: "L", 38: "J", 40: "K",
    45: "N", 46: "M", 48: "Tab", 49: "Space", 51: "Backspace", 53: "Esc",
    96: "F5", 97: "F6", 98: "F7", 99: "F3", 100: "F8", 101: "F9", 103: "F11",
    109: "F10", 111: "F12", 115: "Home", 116: "PageUp", 118: "F4", 119: "End",
    120: "F2", 121: "PageDown", 122: "F1", 123: "Left", 124: "Right", 125: "Down", 126: "Up",
]

private let modifierCodes: Set<Int64> = [54, 55, 56, 58, 59, 60, 61, 62]

private func printUsage() {
    fputs(
        """
        usage:
          nudgeboard-mac nowplaying-send <command-id>
          nudgeboard-mac key-post <keyCode> <flags>
          nudgeboard-mac shortcut-capture

        """,
        stderr
    )
}

private func emit(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object),
          let line = String(data: data, encoding: .utf8)
    else {
        return
    }
    print(line)
    fflush(stdout)
}

private func nowPlayingSend(_ code: UInt32) -> Int32 {
    let path = "/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote"
    guard let handle = dlopen(path, RTLD_NOW) else {
        return 1
    }
    defer { dlclose(handle) }
    guard let symbol = dlsym(handle, "MRMediaRemoteSendCommand") else {
        return 1
    }
    let send = unsafeBitCast(symbol, to: MRSendCommandFn.self)
    let ok = send(code, nil)
    Thread.sleep(forTimeInterval: 0.4)
    return ok.boolValue ? 0 : 1
}

private func postKey(
    source: CGEventSource,
    keyCode: CGKeyCode,
    flags: CGEventFlags,
    down: Bool
) {
    guard let event = CGEvent(
        keyboardEventSource: source,
        virtualKey: keyCode,
        keyDown: down
    ) else {
        return
    }
    event.flags = flags
    event.post(tap: .cghidEventTap)
}

private func keyPost(keyCode: CGKeyCode, flagsRaw: UInt64) -> Int32 {
    let flags = CGEventFlags(rawValue: flagsRaw)
    guard let source = CGEventSource(stateID: .privateState)
        ?? CGEventSource(stateID: .hidSystemState)
    else {
        return 1
    }

    var mods: [CGKeyCode] = []
    if flags.contains(flagShift) { mods.append(vkShift) }
    if flags.contains(flagControl) { mods.append(vkControl) }
    if flags.contains(flagOption) { mods.append(vkOption) }
    if flags.contains(flagCommand) { mods.append(vkCommand) }

    for vk in mods {
        postKey(source: source, keyCode: vk, flags: flags, down: true)
    }
    Thread.sleep(forTimeInterval: 0.02)
    postKey(source: source, keyCode: keyCode, flags: flags, down: true)
    Thread.sleep(forTimeInterval: 0.04)
    postKey(source: source, keyCode: keyCode, flags: flags, down: false)
    Thread.sleep(forTimeInterval: 0.02)
    for vk in mods.reversed() {
        postKey(source: source, keyCode: vk, flags: [], down: false)
    }
    return 0
}

private func modsFromFlags(_ flags: CGEventFlags) -> [String] {
    var out: [String] = []
    if flags.contains(flagControl) { out.append("Ctrl") }
    if flags.contains(flagShift) { out.append("Shift") }
    if flags.contains(flagOption) { out.append("Option") }
    if flags.contains(flagCommand) { out.append("Cmd") }
    return out
}

private func tapCallback(
    proxy: CGEventTapProxy,
    type: CGEventType,
    event: CGEvent,
    refcon: UnsafeMutableRawPointer?
) -> Unmanaged<CGEvent>? {
    _ = proxy
    _ = refcon
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        return Unmanaged.passUnretained(event)
    }

    if type == .flagsChanged {
        emit(["keys": modsFromFlags(event.flags), "done": false])
        return Unmanaged.passUnretained(event)
    }

    if type == .keyDown {
        let repeatCount = event.getIntegerValueField(.keyboardEventAutorepeat)
        let code = event.getIntegerValueField(.keyboardEventKeycode)
        if repeatCount != 0 || modifierCodes.contains(code) {
            return Unmanaged.passUnretained(event)
        }
        let name = keyNames[code] ?? "Key\(code)"
        emit(["keys": modsFromFlags(event.flags) + [name], "done": true])
        return nil
    }

    return Unmanaged.passUnretained(event)
}

private func shortcutCapture() -> Int32 {
    setvbuf(stdout, nil, _IOLBF, 0)
    let mask: CGEventMask =
        (1 << CGEventType.keyDown.rawValue) | (1 << CGEventType.flagsChanged.rawValue)

    let tap = CGEvent.tapCreate(
        tap: .cghidEventTap,
        place: .headInsertEventTap,
        options: .defaultTap,
        eventsOfInterest: mask,
        callback: tapCallback,
        userInfo: nil
    ) ?? CGEvent.tapCreate(
        tap: .cgSessionEventTap,
        place: .headInsertEventTap,
        options: .defaultTap,
        eventsOfInterest: mask,
        callback: tapCallback,
        userInfo: nil
    )

    guard let tap else {
        emit(["error": "no_tap"])
        return 1
    }

    let src = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
    CFRunLoopAddSource(CFRunLoopGetCurrent(), src, .commonModes)
    CGEvent.tapEnable(tap: tap, enable: true)
    emit(["ok": true])
    CFRunLoopRun()
    return 0
}

@main
struct NudgeboardMac {
    static func main() {
        let args = CommandLine.arguments
        guard args.count >= 2 else {
            printUsage()
            exit(1)
        }

        switch args[1] {
        case "nowplaying-send":
            guard args.count >= 3, let code = UInt32(args[2]) else {
                printUsage()
                exit(1)
            }
            exit(nowPlayingSend(code))
        case "key-post":
            guard args.count >= 4,
                  let keyCode = UInt16(args[2]),
                  let flags = UInt64(args[3])
            else {
                printUsage()
                exit(1)
            }
            exit(keyPost(keyCode: CGKeyCode(keyCode), flagsRaw: flags))
        case "shortcut-capture":
            exit(shortcutCapture())
        default:
            printUsage()
            exit(1)
        }
    }
}
