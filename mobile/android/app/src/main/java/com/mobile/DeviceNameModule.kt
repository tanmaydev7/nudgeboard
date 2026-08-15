package com.mobile

import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap

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
