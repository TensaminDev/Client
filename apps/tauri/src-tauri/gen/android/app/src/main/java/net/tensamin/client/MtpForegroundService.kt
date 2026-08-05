package net.tensamin.client

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class MtpForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      MtpSecureStore.setEnabled(this, false)
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }

    createChannel(this)
    val notification = buildNotification(this, "Connecting")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    val config = MtpSecureStore.loadConfig(this)
    if (config == null || !MtpSecureStore.isEnabled(this)) {
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }

    try {
      NativeMtpBridge.nativeAttach(applicationContext)
      NativeMtpBridge.nativeStart(config)
      NativeMtpBridge.log(2, "Started MTP foreground service")
    } catch (error: Throwable) {
      NativeMtpBridge.log(0, "Failed to start MTP foreground service", error)
      updateNotification(this, "Connection failed")
    }
    return START_STICKY
  }

  override fun onDestroy() {
    if (!MtpSecureStore.isEnabled(this)) NativeMtpBridge.nativeStop()
    super.onDestroy()
  }

  companion object {
    private const val CHANNEL_ID = "tensamin-connection"
    private const val NOTIFICATION_ID = 2201
    private const val ACTION_STOP = "net.tensamin.client.STOP_MTP"

    fun updateNotification(context: Context, status: String) {
      if (!MtpSecureStore.isEnabled(context)) return
      createChannel(context)
      context.getSystemService(NotificationManager::class.java)
        .notify(NOTIFICATION_ID, buildNotification(context, status))
    }

    private fun createChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      context.getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(
          CHANNEL_ID,
          "Background connection",
          NotificationManager.IMPORTANCE_LOW,
        ).apply { description = "Keeps Tensamin connected for incoming messages" },
      )
    }

    private fun buildNotification(context: Context, status: String): Notification {
      val openIntent = PendingIntent.getActivity(
        context,
        0,
        Intent(context, MainActivity::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      val stopIntent = PendingIntent.getService(
        context,
        1,
        Intent(context, MtpForegroundService::class.java).setAction(ACTION_STOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      return NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.stat_notify_sync)
        .setContentTitle("Tensamin background connection")
        .setContentText(status)
        .setContentIntent(openIntent)
        .setOngoing(true)
        .setCategory(Notification.CATEGORY_SERVICE)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopIntent)
        .build()
    }
  }
}
