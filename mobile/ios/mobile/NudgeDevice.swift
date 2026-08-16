import Foundation
import Security

@objc(NudgeDevice)
class NudgeDevice: NSObject {
  private static let service = "com.nudgeboard.app"

  @objc static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc func saveSecret(_ key: String, value: String) -> NSNumber {
    guard !key.isEmpty, key.count <= 64 else {
      return 0
    }
    let data = Data(value.utf8)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: Self.service,
      kSecAttrAccount as String: key,
    ]
    SecItemDelete(query as CFDictionary)
    var add = query
    add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    return SecItemAdd(add as CFDictionary, nil) == errSecSuccess ? 1 : 0
  }

  @objc func loadSecret(_ key: String) -> String {
    guard !key.isEmpty, key.count <= 64 else {
      return ""
    }
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: Self.service,
      kSecAttrAccount as String: key,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess, let data = result as? Data else {
      return ""
    }
    return String(data: data, encoding: .utf8) ?? ""
  }

  @objc func deleteSecret(_ key: String) -> NSNumber {
    guard !key.isEmpty else {
      return 0
    }
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: Self.service,
      kSecAttrAccount as String: key,
    ]
    let status = SecItemDelete(query as CFDictionary)
    return status == errSecSuccess || status == errSecItemNotFound ? 1 : 0
  }

  @objc func randomBytesHex(_ size: NSNumber) -> String {
    let count = min(max(size.intValue, 1), 64)
    var bytes = [UInt8](repeating: 0, count: count)
    let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    guard status == errSecSuccess else {
      return ""
    }
    return bytes.map { String(format: "%02x", $0) }.joined()
  }
}
