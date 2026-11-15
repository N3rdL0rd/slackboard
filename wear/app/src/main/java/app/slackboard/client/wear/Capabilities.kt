package app.slackboard.client.wear

import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.os.Build
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.ExerciseType
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * What this watch can report: the data types Health Services offers for a climbing workout, for live measuring and for passive
 * monitoring, the raw sensors the system lists, and whether Samsung's own health sensor service is there. Each part is read on its own,
 * so one that fails is reported as an error and the rest still arrive. Blocking: call it off the main thread.
 */
object Capabilities {
    private val worker = Executors.newSingleThreadExecutor()

    fun collect(context: Context): JSONObject {
        val errors = JSONArray()
        fun <T> part(name: String, f: () -> T): T? = try { f() } catch (e: Throwable) { errors.put("$name: ${e.javaClass.simpleName} ${e.message ?: ""}".trim()); null }
        val client = HealthServices.getClient(context)

        val workout = part("workout") {
            val caps = client.exerciseClient.getCapabilitiesAsync().get()
            caps.getExerciseTypeCapabilities(ExerciseType.ROCK_CLIMBING).supportedDataTypes.map { it.name }.distinct().sorted()
        }
        val measure = part("measure") { client.measureClient.getCapabilitiesAsync().get().supportedDataTypesMeasure.map { it.name }.distinct().sorted() }
        val passive = part("passive") { client.passiveMonitoringClient.getCapabilitiesAsync().get().supportedDataTypesPassiveMonitoring.map { it.name }.distinct().sorted() }
        val sensors = part("sensors") {
            val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
            sm.getSensorList(Sensor.TYPE_ALL).map { it.stringType.removePrefix("android.sensor.") }.distinct().sorted()
        }
        val samsung = part("samsung") {
            try {
                context.packageManager.getPackageInfo("com.samsung.android.service.health.tracking", 0)
                true
            } catch (_: PackageManager.NameNotFoundException) {
                false
            }
        }
        return JSONObject()
            .put("model", Build.MODEL)
            .put("sdk", Build.VERSION.SDK_INT)
            .put("workout", JSONArray(workout ?: emptyList<String>()))
            .put("measure", JSONArray(measure ?: emptyList<String>()))
            .put("passive", JSONArray(passive ?: emptyList<String>()))
            .put("sensors", JSONArray(sensors ?: emptyList<String>()))
            .put("samsungSensors", samsung ?: JSONObject.NULL)
            .put("errors", errors)
    }

    /** Reads everything and sends it to the phone, then calls `done`. */
    fun sendToPhone(context: Context, done: () -> Unit = {}) {
        val app = context.applicationContext
        worker.execute {
            Uplink.init(app)
            Uplink.send(Protocol.CAPABILITIES, collect(app))
            done()
        }
    }
}
