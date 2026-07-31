package net.tensamin.client

import android.webkit.WebView
import java.lang.ref.WeakReference
import org.json.JSONObject

object MobileMediaEvents {
  private var webView = WeakReference<WebView>(null)

  fun attach(value: WebView) {
    webView = WeakReference(value)
  }

  fun detach() {
    webView.clear()
  }

  fun emitError(message: String) {
    emit("tensamin-mobile-screen-error", JSONObject().put("message", message))
  }

  fun emit(name: String, detail: JSONObject = JSONObject()) {
    val view = webView.get() ?: return
    val script = "window.dispatchEvent(new CustomEvent(" +
      JSONObject.quote(name) +
      ", { detail: " + detail.toString() + " }));"
    view.post { view.evaluateJavascript(script, null) }
  }
}
