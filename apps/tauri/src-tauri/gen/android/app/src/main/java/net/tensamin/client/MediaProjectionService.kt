package net.tensamin.client

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.media.ImageReader
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.util.Base64
import android.util.DisplayMetrics
import androidx.core.content.ContextCompat
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject

class MediaProjectionService : Service() {
  private var projection: MediaProjection? = null
  private var virtualDisplay: VirtualDisplay? = null
  private var imageReader: ImageReader? = null
  private var captureThread: HandlerThread? = null
  private var audioRecord: AudioRecord? = null
  private var audioThread: Thread? = null
  private val captureActive = AtomicBoolean(false)
  private var lastFrameAt = 0L

  private val projectionCallback = object : MediaProjection.Callback() {
    override fun onStop() {
      stopCapture(stopProjection = false, emitStopped = true)
      stopSelf()
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopCapture(stopProjection = true, emitStopped = true)
      stopSelf()
      return START_NOT_STICKY
    }

    val permissionData = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent?.getParcelableExtra(EXTRA_PERMISSION_DATA, Intent::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent?.getParcelableExtra(EXTRA_PERMISSION_DATA)
    }
    val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, Int.MIN_VALUE) ?: Int.MIN_VALUE
    if (permissionData == null || resultCode == Int.MIN_VALUE) {
      MobileMediaEvents.emitError("Screen capture permission data is missing")
      stopSelf()
      return START_NOT_STICKY
    }

    val includeAudio = intent?.getBooleanExtra(EXTRA_INCLUDE_AUDIO, false) ?: false
    try {
      startForegroundNotification()
      startCapture(resultCode, permissionData, includeAudio)
    } catch (error: Throwable) {
      stopCapture(stopProjection = true, emitStopped = false)
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      MobileMediaEvents.emitError(error.message ?: "Unable to start screen capture")
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    stopCapture(stopProjection = true, emitStopped = true)
    super.onDestroy()
  }

  private fun startForegroundNotification() {
    val notificationManager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      notificationManager.createNotificationChannel(
        NotificationChannel(
          NOTIFICATION_CHANNEL_ID,
          "Screen sharing",
          NotificationManager.IMPORTANCE_LOW,
        ),
      )
    }

    val stopIntent = Intent(this, MediaProjectionService::class.java).setAction(ACTION_STOP)
    val stopPendingIntent = PendingIntent.getService(
      this,
      0,
      stopIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      android.app.Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
    } else {
      android.app.Notification.Builder(this)
    }
      .setSmallIcon(android.R.drawable.ic_menu_share)
      .setContentTitle("Tensamin is sharing your screen")
      .setContentText("Tap Stop to end screen sharing")
      .setOngoing(true)
      .setCategory(android.app.Notification.CATEGORY_SERVICE)
      .addAction(android.R.drawable.ic_media_pause, "Stop", stopPendingIntent)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  @Suppress("DEPRECATION")
  private fun startCapture(resultCode: Int, permissionData: Intent, includeAudio: Boolean) {
    stopCapture(stopProjection = true, emitStopped = false)

    val manager = getSystemService(MediaProjectionManager::class.java)
    val newProjection = manager.getMediaProjection(resultCode, permissionData)
      ?: error("Android did not provide a screen capture session")
    projection = newProjection

    val thread = HandlerThread("tensamin-screen-capture").also { it.start() }
    captureThread = thread
    val handler = Handler(thread.looper)
    newProjection.registerCallback(projectionCallback, handler)

    val metrics = DisplayMetrics()
    getSystemService(android.view.WindowManager::class.java).defaultDisplay.getRealMetrics(metrics)
    val displayWidth = metrics.widthPixels
    val displayHeight = metrics.heightPixels
    val width = minOf(displayWidth, MAX_FRAME_WIDTH)
    val height = (displayHeight.toLong() * width / displayWidth).toInt()
    val density = metrics.densityDpi
    val reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
    imageReader = reader
    reader.setOnImageAvailableListener({ source -> captureFrame(source, width, height) }, handler)

    virtualDisplay = newProjection.createVirtualDisplay(
      "Tensamin screen sharing",
      width,
      height,
      density,
      DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
      reader.surface,
      null,
      handler,
    )
    captureActive.set(true)

    val audioStarted = includeAudio && startAudioCapture(newProjection)
    MobileMediaEvents.emit(
      "tensamin-mobile-screen-started",
      JSONObject().put("includeAudio", audioStarted),
    )
  }

  private fun captureFrame(source: ImageReader, width: Int, height: Int) {
    val image = source.acquireLatestImage() ?: return
    try {
      val now = System.currentTimeMillis()
      if (!captureActive.get() || now - lastFrameAt < FRAME_INTERVAL_MS) return
      lastFrameAt = now

      val plane = image.planes[0]
      val paddedWidth = plane.rowStride / plane.pixelStride
      val paddedBitmap = Bitmap.createBitmap(paddedWidth, height, Bitmap.Config.ARGB_8888)
      paddedBitmap.copyPixelsFromBuffer(plane.buffer)
      val croppedBitmap = if (paddedWidth == width) {
        paddedBitmap
      } else {
        Bitmap.createBitmap(paddedBitmap, 0, 0, width, height).also { paddedBitmap.recycle() }
      }
      val outputBitmap = croppedBitmap

      val bytes = ByteArrayOutputStream()
      outputBitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, bytes)
      val outputWidth = outputBitmap.width
      val outputHeight = outputBitmap.height
      outputBitmap.recycle()
      MobileMediaEvents.emit(
        "tensamin-mobile-screen-frame",
        JSONObject()
          .put("data", Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP))
          .put("mimeType", "image/jpeg")
          .put("width", outputWidth)
          .put("height", outputHeight),
      )
    } catch (error: Throwable) {
      if (captureActive.get()) {
        MobileMediaEvents.emitError(error.message ?: "Unable to read a screen frame")
      }
    } finally {
      image.close()
    }
  }

  private fun startAudioCapture(activeProjection: MediaProjection): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      MobileMediaEvents.emitError("System audio capture requires Android 10 or newer")
      return false
    }
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      MobileMediaEvents.emitError("Microphone permission is required for system audio capture")
      return false
    }

    return try {
      val format = AudioFormat.Builder()
        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
        .setSampleRate(AUDIO_SAMPLE_RATE)
        .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
        .build()
      val configuration = AudioPlaybackCaptureConfiguration.Builder(activeProjection)
        .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
        .addMatchingUsage(AudioAttributes.USAGE_GAME)
        .build()
      val minimumBuffer = AudioRecord.getMinBufferSize(
        AUDIO_SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
      )
      check(minimumBuffer > 0) { "Android could not allocate a system audio buffer" }
      val bufferSize = maxOf(minimumBuffer * 2, AUDIO_BATCH_BYTES)
      val record = AudioRecord.Builder()
        .setAudioFormat(format)
        .setAudioPlaybackCaptureConfig(configuration)
        .setBufferSizeInBytes(bufferSize)
        .build()
      check(record.state == AudioRecord.STATE_INITIALIZED) {
        "Android could not initialize system audio capture"
      }
      audioRecord = record
      record.startRecording()
      audioThread = Thread({ readAudio(record) }, "tensamin-audio-capture").also { it.start() }
      true
    } catch (error: Throwable) {
      audioRecord?.release()
      audioRecord = null
      MobileMediaEvents.emitError(error.message ?: "Unable to capture system audio")
      false
    }
  }

  private fun readAudio(record: AudioRecord) {
    val buffer = ByteArray(AUDIO_BATCH_BYTES)
    while (captureActive.get() && !Thread.currentThread().isInterrupted) {
      val read = record.read(buffer, 0, buffer.size, AudioRecord.READ_BLOCKING)
      if (read > 0 && captureActive.get()) {
        MobileMediaEvents.emit(
          "tensamin-mobile-screen-audio",
          JSONObject()
            .put("data", Base64.encodeToString(buffer, 0, read, Base64.NO_WRAP))
            .put("sampleRate", AUDIO_SAMPLE_RATE)
            .put("channelCount", 1)
            .put("encoding", "pcm16le"),
        )
      } else if (read < 0 && captureActive.get()) {
        MobileMediaEvents.emitError("System audio capture stopped with code $read")
        return
      }
    }
  }

  @Synchronized
  private fun stopCapture(stopProjection: Boolean, emitStopped: Boolean) {
    val wasActive = captureActive.getAndSet(false)

    val record = audioRecord
    audioRecord = null
    try {
      record?.stop()
    } catch (_: IllegalStateException) {
    }
    record?.release()
    audioThread?.interrupt()
    audioThread = null

    imageReader?.setOnImageAvailableListener(null, null)
    virtualDisplay?.release()
    virtualDisplay = null
    imageReader?.close()
    imageReader = null

    val oldProjection = projection
    projection = null
    oldProjection?.unregisterCallback(projectionCallback)
    if (stopProjection) oldProjection?.stop()

    captureThread?.quitSafely()
    captureThread = null
    lastFrameAt = 0L

    if (wasActive && emitStopped) {
      MobileMediaEvents.emit("tensamin-mobile-screen-stopped")
    }
  }

  companion object {
    private const val ACTION_STOP = "net.tensamin.client.STOP_SCREEN_SHARE"
    private const val EXTRA_RESULT_CODE = "resultCode"
    private const val EXTRA_PERMISSION_DATA = "permissionData"
    private const val EXTRA_INCLUDE_AUDIO = "includeAudio"
    private const val NOTIFICATION_CHANNEL_ID = "screen-sharing"
    private const val NOTIFICATION_ID = 7314
    private const val FRAME_INTERVAL_MS = 75L
    private const val MAX_FRAME_WIDTH = 1280
    private const val JPEG_QUALITY = 72
    private const val AUDIO_SAMPLE_RATE = 48_000
    private const val AUDIO_BATCH_BYTES = 9_600

    fun start(context: Context, resultCode: Int, data: Intent, includeAudio: Boolean) {
      val intent = Intent(context, MediaProjectionService::class.java)
        .putExtra(EXTRA_RESULT_CODE, resultCode)
        .putExtra(EXTRA_PERMISSION_DATA, data)
        .putExtra(EXTRA_INCLUDE_AUDIO, includeAudio)
      ContextCompat.startForegroundService(context, intent)
    }

    fun stop(context: Context) {
      context.startService(
        Intent(context, MediaProjectionService::class.java).setAction(ACTION_STOP),
      )
    }
  }
}
