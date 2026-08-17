package com.nudgeboard.app

import android.content.SharedPreferences
import android.os.Build
import android.provider.Settings
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import java.net.NetworkInterface
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

class DeviceNameModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = NAME

  override fun getConstants(): MutableMap<String, Any> =
      hashMapOf(
        "marketName" to marketName(),
        "manufacturer" to Build.MANUFACTURER.orEmpty(),
        "model" to Build.MODEL.orEmpty().ifBlank { "Android" },
      )

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun getHints(): WritableMap = hints()

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun getLanHost(): String = lanHost()

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun saveSecret(key: String, value: String): Boolean {
    if (key.isBlank() || key.length > 64) {
      return false
    }
    return try {
      secrets().edit().putString(key, value).apply()
      true
    } catch (_: Exception) {
      false
    }
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun loadSecret(key: String): String {
    if (key.isBlank() || key.length > 64) {
      return ""
    }
    return try {
      secrets().getString(key, "").orEmpty()
    } catch (_: Exception) {
      ""
    }
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun deleteSecret(key: String): Boolean {
    if (key.isBlank()) {
      return false
    }
    return try {
      secrets().edit().remove(key).apply()
      true
    } catch (_: Exception) {
      false
    }
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun randomBytesHex(size: Int): String {
    val n = size.coerceIn(1, 64)
    val bytes = ByteArray(n)
    SecureRandom().nextBytes(bytes)
    val hex = StringBuilder(n * 2)
    for (b in bytes) {
      hex.append("%02x".format(b.toInt() and 0xff))
    }
    return hex.toString()
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun deriveKeyHex(token: String): String {
    return try {
      val mac = Mac.getInstance("HmacSHA256")
      val secret = SecretKeySpec("nudgeboard-e2ee-v1".toByteArray(Charsets.UTF_8), "HmacSHA256")
      mac.init(secret)
      val bytes = mac.doFinal(token.toByteArray(Charsets.UTF_8))
      val hex = StringBuilder(bytes.size * 2)
      for (b in bytes) {
        hex.append("%02x".format(b.toInt() and 0xff))
      }
      hex.toString()
    } catch (_: Exception) {
      ""
    }
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun encryptAesGcm(keyHex: String, plaintext: String, seq: Int): WritableMap {
    val keyBytes = hexToBytes(keyHex) ?: return Arguments.createMap()
    val iv = ByteArray(12)
    SecureRandom().nextBytes(iv)
    return try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      val spec = GCMParameterSpec(128, iv)
      val secretKey = SecretKeySpec(keyBytes, "AES")
      cipher.init(Cipher.ENCRYPT_MODE, secretKey, spec)
      cipher.updateAAD("seq:$seq".toByteArray(Charsets.UTF_8))
      val cipherWithTag = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
      val dataLen = cipherWithTag.size - 16
      if (dataLen < 0) return Arguments.createMap()
      val dataBytes = cipherWithTag.copyOfRange(0, dataLen)
      val tagBytes = cipherWithTag.copyOfRange(dataLen, cipherWithTag.size)

      Arguments.createMap().apply {
        putString("iv", Base64.encodeToString(iv, Base64.NO_WRAP))
        putString("data", Base64.encodeToString(dataBytes, Base64.NO_WRAP))
        putString("tag", Base64.encodeToString(tagBytes, Base64.NO_WRAP))
        putInt("seq", seq)
      }
    } catch (_: Exception) {
      Arguments.createMap()
    }
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun decryptAesGcm(keyHex: String, ivBase64: String, dataBase64: String, tagBase64: String, seq: Int): String {
    val keyBytes = hexToBytes(keyHex) ?: return ""
    return try {
      val iv = Base64.decode(ivBase64, Base64.DEFAULT)
      val data = Base64.decode(dataBase64, Base64.DEFAULT)
      val tag = Base64.decode(tagBase64, Base64.DEFAULT)
      val combined = ByteArray(data.size + tag.size)
      System.arraycopy(data, 0, combined, 0, data.size)
      System.arraycopy(tag, 0, combined, data.size, tag.size)

      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      val spec = GCMParameterSpec(128, iv)
      val secretKey = SecretKeySpec(keyBytes, "AES")
      cipher.init(Cipher.DECRYPT_MODE, secretKey, spec)
      cipher.updateAAD("seq:$seq".toByteArray(Charsets.UTF_8))
      val decrypted = cipher.doFinal(combined)
      String(decrypted, Charsets.UTF_8)
    } catch (_: Exception) {
      ""
    }
  }

  private fun hexToBytes(hex: String): ByteArray? {
    if (hex.length % 2 != 0) return null
    val bytes = ByteArray(hex.length / 2)
    for (i in bytes.indices) {
      val index = i * 2
      val v = hex.substring(index, index + 2).toIntOrNull(16) ?: return null
      bytes[i] = v.toByte()
    }
    return bytes
  }

  private fun secrets(): SharedPreferences {
    val master = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
    return EncryptedSharedPreferences.create(
      "nudgeboard_secrets",
      master,
      reactApplicationContext,
      EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
      EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
  }

  private fun lanHost(): String {
    val scored = mutableListOf<Pair<String, Int>>()
    val interfaces = NetworkInterface.getNetworkInterfaces() ?: return ""
    for (nic in interfaces) {
      for (address in nic.inetAddresses) {
        val ip = address.hostAddress.orEmpty()
        if (address.isLoopbackAddress || ip.contains(':') || ip.startsWith("169.254.")) {
          continue
        }
        val score =
          when {
            ip.startsWith("192.168.") -> 3
            ip.startsWith("10.") -> 2
            ip.matches(Regex("^172\\.(1[6-9]|2\\d|3[0-1])\\..*")) -> 1
            else -> 0
          }
        if (score > 0) {
          scored.add(ip to score)
        }
      }
    }
    return scored.maxByOrNull { it.second }?.first.orEmpty()
  }

  private fun hints(): WritableMap {
    val names = Arguments.createArray()
    for (name in deviceNames()) {
      names.pushString(name)
    }
    return Arguments.createMap().apply {
      putArray("names", names)
      putString("marketName", marketName())
      putString("manufacturer", Build.MANUFACTURER.orEmpty())
      putString("model", Build.MODEL.orEmpty().ifBlank { "Android" })
    }
  }

  private fun deviceNames(): List<String> {
    val names = linkedSetOf<String>()
    addName(names, systemProperty("persist.sys.device_name"))
    addName(
      names,
      Settings.Global.getString(
        reactApplicationContext.contentResolver,
        Settings.Global.DEVICE_NAME,
      ),
    )
    addName(
      names,
      Settings.System.getString(reactApplicationContext.contentResolver, "device_name"),
    )
    return names.toList()
  }

  private fun addName(names: MutableSet<String>, value: String?) {
    val name = value?.trim().orEmpty()
    if (name.isNotEmpty()) {
      names.add(name)
    }
  }

  private fun marketName(): String {
    val keys =
      arrayOf(
        "ro.product.marketname",
        "ro.product.vendor.marketname",
        "ro.vendor.oplus.market.name",
        "ro.oppo.market.name",
        "ro.vivo.market.name",
      )
    for (key in keys) {
      val value = systemProperty(key)
      if (value.isNotBlank()) {
        return value
      }
    }
    return ""
  }

  private fun systemProperty(key: String): String {
    return try {
      val clazz = Class.forName("android.os.SystemProperties")
      val get = clazz.getMethod("get", String::class.java, String::class.java)
      (get.invoke(null, key, "") as? String).orEmpty()
    } catch (_: Exception) {
      ""
    }
  }

  companion object {
    const val NAME = "NudgeDevice"
  }
}
