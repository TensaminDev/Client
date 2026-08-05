package net.tensamin.client

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class MtpBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (
      intent.action == Intent.ACTION_BOOT_COMPLETED &&
      MtpSecureStore.isEnabled(context) &&
      MtpSecureStore.hasConfig(context)
    ) {
      NativeMtpBridge.startService(context)
    }
  }
}
