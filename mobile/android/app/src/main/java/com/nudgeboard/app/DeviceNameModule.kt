package com.nudgeboard.app

import android.content.SharedPreferences
import android.os.Build
import android.provider.Settings
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import java.net.NetworkInterface
import java.security.SecureRandom

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
