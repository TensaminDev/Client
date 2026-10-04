package net.tensamin.client

import android.app.Application

class TensaminApplication : Application() {
  override fun onCreate() {
    super.onCreate()
    // Set TLS roots before loading the native library. Certificate discovery
    // caches its environment on first use, including background-service startup.
    val roots = java.io.File(cacheDir, "android-system-ca-certificates.pem")
    val store = java.security.KeyStore.getInstance("AndroidCAStore").apply { load(null) }
    roots.bufferedWriter().use { writer ->
      val aliases = store.aliases()
      while (aliases.hasMoreElements()) {
        val certificate = store.getCertificate(aliases.nextElement()) ?: continue
        writer.write("-----BEGIN CERTIFICATE-----\n")
        android.util.Base64.encodeToString(certificate.encoded, android.util.Base64.NO_WRAP)
          .chunked(64).forEach { writer.write(it + "\n") }
        writer.write("-----END CERTIFICATE-----\n")
      }
    }
    android.system.Os.setenv("SSL_CERT_FILE", roots.absolutePath, true)
    // MTP's Android plugin reads this before starting its background service.
    check(getSharedPreferences("mtp-library", 0).edit().putString("name", "mobile_lib").commit())
    // Also runs in a boot-started service process, before any activity exists.
    NativeMtpBridge.nativeAttach(applicationContext)
  }
}
