package net.tensamin.client

import android.content.Context
import android.webkit.WebView
import androidx.annotation.Keep
import java.lang.ref.WeakReference

@Keep
object NativeAccessibilityBridge {
  const val DEFAULT_INITIAL_SCALE = 290
  private const val MIN_INITIAL_SCALE = 210
  private const val MAX_INITIAL_SCALE = 500
  private const val PREFERENCES = "tensamin-accessibility"
  private const val INITIAL_SCALE = "initial-scale"

  private var webView = WeakReference<WebView>(null)

  init {
    System.loadLibrary("mobile_lib")
  }

  @JvmStatic external fun nativeAttach(context: Context)

  fun attach(webView: WebView) {
    this.webView = WeakReference(webView)
    webView.setInitialScale(getInitialScale(webView.context))
  }

  fun detach(webView: WebView) {
    if (this.webView.get() === webView) this.webView.clear()
  }

  fun getInitialScale(context: Context): Int {
    val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    val storedScale = preferences.getInt(INITIAL_SCALE, DEFAULT_INITIAL_SCALE)
    val scale = storedScale.coerceIn(MIN_INITIAL_SCALE, MAX_INITIAL_SCALE)
    if (scale != storedScale) preferences.edit().putInt(INITIAL_SCALE, scale).apply()
    return scale
  }

  fun setInitialScale(context: Context, initialScale: Int) {
    val nextScale = initialScale.coerceIn(MIN_INITIAL_SCALE, MAX_INITIAL_SCALE)
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .putInt(INITIAL_SCALE, nextScale)
      .apply()
    webView.get()?.let { currentWebView ->
      currentWebView.post { currentWebView.setInitialScale(nextScale) }
    }
  }
}
