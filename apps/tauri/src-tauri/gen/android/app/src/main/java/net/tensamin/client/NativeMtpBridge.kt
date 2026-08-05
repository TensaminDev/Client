package net.tensamin.client

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.annotation.Keep
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.content.LocusIdCompat
import androidx.core.content.ContextCompat
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat

@Keep
object NativeMtpBridge {
  private const val MESSAGE_CHANNEL = "tensamin-messages"

  init {
    System.loadLibrary("mobile_lib")
  }

  @JvmStatic external fun nativeAttach(context: Context)
  @JvmStatic external fun nativeStart(config: String)
  @JvmStatic external fun nativeStop()
  @JvmStatic external fun nativeSetUiState(visible: Boolean)
  @JvmStatic external fun nativeLog(level: Int, message: String, details: String)

  fun log(level: Int, message: String, error: Throwable? = null) {
    val details = error?.stackTraceToString().orEmpty()
    Log.println(if (level == 0) Log.ERROR else Log.INFO, "TensaminAndroid", "$message $details")
    nativeLog(level, message, details)
  }

  fun storeConfig(context: Context, config: String) {
    try {
      MtpSecureStore.saveConfig(context, config)
      if (MtpSecureStore.isEnabled(context)) startService(context)
      log(2, "Stored native MTP credentials")
    } catch (error: Throwable) {
      log(0, "Failed to store native MTP credentials", error)
      throw error
    }
  }

  fun hasConfig(context: Context): Boolean = MtpSecureStore.hasConfig(context)

  fun setServiceEnabled(context: Context, enabled: Boolean) {
    MtpSecureStore.setEnabled(context, enabled)
    if (enabled && MtpSecureStore.hasConfig(context)) startService(context) else stopService(context)
  }

  fun isIgnoringBatteryOptimizations(context: Context): Boolean =
    context.getSystemService(PowerManager::class.java)
      .isIgnoringBatteryOptimizations(context.packageName)

  fun requestBatteryExemption(context: Context) {
    val intent = Intent(
      Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
      Uri.parse("package:${context.packageName}"),
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
  }

  fun startService(context: Context) {
    ContextCompat.startForegroundService(
      context,
      Intent(context, MtpForegroundService::class.java),
    )
  }

  fun stopService(context: Context) {
    if (!context.stopService(Intent(context, MtpForegroundService::class.java))) nativeStop()
  }

  fun updateServiceStatus(context: Context, status: String) {
    MtpForegroundService.updateNotification(context, status)
  }

  fun postMessageNotification(
    context: Context,
    senderId: Long,
    sender: String,
    body: String,
    avatar: ByteArray,
  ) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(
          MESSAGE_CHANNEL,
          "Messages",
          NotificationManager.IMPORTANCE_HIGH,
        ).apply { description = "Incoming Tensamin messages" },
      )
    }
    val openIntent = Intent(
      Intent.ACTION_VIEW,
      Uri.parse("tensamin://chat?id=$senderId"),
      context,
      MainActivity::class.java,
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    val pendingIntent = PendingIntent.getActivity(
      context,
      senderId.hashCode(),
      openIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val avatarBitmap = avatar.takeIf { it.isNotEmpty() }?.let {
      BitmapFactory.decodeByteArray(it, 0, it.size)
    }
    val avatarIcon = avatarBitmap?.let(IconCompat::createWithAdaptiveBitmap)
    val person = Person.Builder()
      .setName(sender)
      .setKey(senderId.toString())
      .setIcon(avatarIcon)
      .build()
    val shortcutId = "chat-$senderId"
    val shortcut = ShortcutInfoCompat.Builder(context, shortcutId)
      .setShortLabel(sender)
      .setLongLived(true)
      .setPerson(person)
      .setIntent(openIntent)
      .apply { if (avatarIcon != null) setIcon(avatarIcon) }
      .build()
    ShortcutManagerCompat.pushDynamicShortcut(context, shortcut)

    val style = NotificationCompat.MessagingStyle(
      Person.Builder().setName("You").build(),
    ).addMessage(body, System.currentTimeMillis(), person)
    val notification = NotificationCompat.Builder(context, MESSAGE_CHANNEL)
      .setSmallIcon(R.drawable.ic_notification_small)
      .setContentTitle(sender)
      .setContentText(body)
      .setStyle(style)
      .setShortcutId(shortcutId)
      .setLocusId(LocusIdCompat(shortcutId))
      .setLargeIcon(avatarBitmap)
      .setCategory(Notification.CATEGORY_MESSAGE)
      .setAutoCancel(true)
      .setContentIntent(pendingIntent)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .build()
    context.getSystemService(NotificationManager::class.java)
      .notify(senderId.hashCode(), notification)
  }

  fun cancelMessageNotification(context: Context, senderId: Long) {
    context.getSystemService(NotificationManager::class.java)
      .cancel(senderId.hashCode())
  }

}
