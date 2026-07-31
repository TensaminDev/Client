package net.tensamin.client

import android.graphics.Rect
import android.os.Bundle
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.WindowManager
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var contentRoot: FrameLayout? = null
  private var contentChild: android.view.View? = null
  private var previousUsableHeight = 0
  private var attachLayoutListener: ViewTreeObserver.OnGlobalLayoutListener? = null

  override fun onWebViewCreate(webView: WebView) {
    webView.setInitialScale(300)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    WindowCompat.setDecorFitsSystemWindows(window, true)
    window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING)
    super.onCreate(savedInstanceState)
    installKeyboardResizeWorkaround()
  }

  override fun onDestroy() {
    attachLayoutListener?.let { listener ->
      contentRoot?.viewTreeObserver?.removeOnGlobalLayoutListener(listener)
    }
    attachLayoutListener = null
    contentRoot = null
    contentChild = null
    super.onDestroy()
  }

  private fun installKeyboardResizeWorkaround() {
    val content = window.decorView.findViewById<FrameLayout>(android.R.id.content)
    contentRoot = content

    val listener = ViewTreeObserver.OnGlobalLayoutListener {
      attachKeyboardResizeWorkaroundIfReady(content)
    }

    attachLayoutListener = listener
    content.viewTreeObserver.addOnGlobalLayoutListener(listener)
    content.post { attachKeyboardResizeWorkaroundIfReady(content) }
  }

  private fun attachKeyboardResizeWorkaroundIfReady(content: FrameLayout) {
    if (contentChild != null) {
      resizeContentForKeyboard(contentChild ?: return)
      return
    }

    val child = content.getChildAt(0) ?: return
    contentChild = child

    ViewCompat.setOnApplyWindowInsetsListener(content) { _, insets ->
      resizeContentForKeyboard(child, insets)
      insets
    }

    ViewCompat.requestApplyInsets(content)
    resizeContentForKeyboard(child)
  }

  private fun resizeContentForKeyboard(
    child: android.view.View,
    insets: WindowInsetsCompat? = ViewCompat.getRootWindowInsets(child),
  ) {
    val visibleFrame = Rect()
    child.getWindowVisibleDisplayFrame(visibleFrame)

    val rootHeight = child.rootView.height
    if (rootHeight <= 0) return

    val imeHeight = insets?.getInsets(WindowInsetsCompat.Type.ime())?.bottom ?: 0
    val keyboardHeight = maxOf(imeHeight, rootHeight - visibleFrame.bottom)
    val keyboardVisible = keyboardHeight > rootHeight * 0.15
    val usableHeight = if (keyboardVisible) rootHeight - keyboardHeight else ViewGroup.LayoutParams.MATCH_PARENT

    if (previousUsableHeight == usableHeight) return

    val params = child.layoutParams
    params.height = usableHeight
    child.layoutParams = params
    child.requestLayout()
    previousUsableHeight = usableHeight
  }
}
