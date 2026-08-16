import Foundation
import Security
import CryptoKit

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

  @objc func deriveKeyHex(_ token: String) -> String {
    let key = SymmetricKey(data: Data("nudgeboard-e2ee-v1".utf8))
    let hmac = HMAC<SHA256>.authenticationCode(for: Data(token.utf8), using: key)
    return Data(hmac).map { String(format: "%02x", $0) }.joined()
  }

  @objc func encryptAesGcm(_ keyHex: String, plaintext: String, seq: NSNumber) -> [String: Any] {
    guard let keyData = Data(hexString: keyHex), keyData.count == 32 else {
      return [:]
    }
    let key = SymmetricKey(data: keyData)
    guard let nonce = try? AES.GCM.Nonce() else {
      return [:]
    }
    let aad = Data("seq:\(seq.intValue)".utf8)
    guard let sealed = try? AES.GCM.seal(Data(plaintext.utf8), using: key, nonce: nonce, authenticating: aad) else {
      return [:]
    }
    let ivString = Data(sealed.nonce).base64EncodedString()
    let dataString = sealed.ciphertext.base64EncodedString()
    let tagString = sealed.tag.base64EncodedString()
    return [
      "iv": ivString,
      "data": dataString,
      "tag": tagString,
      "seq": seq
    ]
  }

  @objc func decryptAesGcm(_ keyHex: String, ivBase64: String, dataBase64: String, tagBase64: String, seq: NSNumber) -> String {
    guard let keyData = Data(hexString: keyHex), keyData.count == 32,
          let ivData = Data(base64Encoded: ivBase64),
          let nonce = try? AES.GCM.Nonce(data: ivData),
          let ciphertext = Data(base64Encoded: dataBase64),
          let tag = Data(base64Encoded: tagBase64) else {
      return ""
    }
    let key = SymmetricKey(data: keyData)
    let aad = Data("seq:\(seq.intValue)".utf8)
    guard let sealedBox = try? AES.GCM.SealedBox(nonce: nonce, ciphertext: ciphertext, tag: tag),
          let decrypted = try? AES.GCM.open(sealedBox, using: key, authenticating: aad) else {
      return ""
    }
    return String(data: decrypted, encoding: .utf8) ?? ""
  }
}

private extension Data {
  init?(hexString: String) {
    let len = hexString.count / 2
    var data = Data(capacity: len)
    var index = hexString.startIndex
    for _ in 0..<len {
      let nextIndex = hexString.index(index, offsetBy: 2)
      guard let byte = UInt8(hexString[index..<nextIndex], radix: 16) else { return nil }
      data.append(byte)
      index = nextIndex
    }
    self = data
  }
}
