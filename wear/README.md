# Slackboard for Wear OS

A small watch app that records a climbing session with Health Services and sends the heart rate
to the phone app. It has one screen: a Start/Stop button, the current heart rate, the elapsed
time and whether the phone is linked. It is a separate Gradle project, because `android/` in the
repository root is generated and recreated by `expo prebuild`.

The phone side is `modules/slackboard-wear` (the Data Layer module) and `src/core/wear.ts`
(message validation). The messages are listed in `Protocol.kt`; keep the three in step.

## Build and install

```sh
cd wear
JAVA_HOME=/usr/lib/jvm/java-21-temurin-jdk ANDROID_HOME=$HOME/Android/Sdk ./gradlew assembleDebug
adb -s <watch> install -r app/build/outputs/apk/debug/app-debug.apk
```

The watch needs Developer options > ADB debugging and Wireless debugging, then
`adb pair <ip>:<port>` and `adb connect <ip>:<port>` as for a phone.

The application id is the same as the phone app's (`app.slackboard.client`), and the signing key
must be the same too: the Data Layer only links apps that share both. Debug builds of both use
the standard debug key.

## Try it without a watch

The Wear OS emulator (`system-images;android-33;android-wear;x86_64`, run with
`-gpu swangle_indirect`; `swiftshader_indirect` crashes) shows the screen and records. Turn on
fake sensor data:

```sh
adb -s emulator-5556 shell am broadcast -a whs.USE_SYNTHETIC_PROVIDERS com.google.android.wearable.healthservices
adb -s emulator-5556 shell am broadcast -a whs.synthetic.user.START_WALKING com.google.android.wearable.healthservices
adb -s emulator-5556 shell dumpsys battery unplug   # otherwise the charging screen covers the app
```

Linking a phone emulator to the watch emulator needs a Google account on the phone, so the
phone-to-watch messages are only tested on real devices.
