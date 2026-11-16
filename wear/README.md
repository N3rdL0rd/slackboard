# Slackboard for Wear OS

The watch app is a remote for the phone and a heart-rate recorder in one app.

- **Remote (home):** the climb the phone's climb screen is showing: a clock, the grade in its band colour, the name, angle, mirror and
  stars, and a ring that is the place in the list, or the timer while one runs. Swipe sideways, turn the bezel, or tap the screen's
  edges for the next and previous climb (it stops at the ends, as the phone does). Tap the middle for more facts about the climb. The
  last three seconds of a timer, and of a hang or rest in a training session, buzz on the watch; the screen is kept on while the app
  is open (a setting lets it dim to the always-on view instead).
- **Training:** when the phone is on a training session the same screen shows the set, its countdown and one button (Start, Done,
  Skip rest). The actions list has Pause and +30 s.
- **Actions (swipe up):** light the climb on the board, mirror, start or stop the timer and pick its length, log a send or attempts,
  and, while recording, mark where an attempt starts, ends or where you fell. Below those: the heart-rate recorder and the settings.
- **Not shown:** holds. The watch only shows the grade, the name and a few facts.
- **Tile and complication:** the streak, today's plan and the week's sends, from figures the phone last sent. Add the tile from the
  watch's tile list and the complication from a watch face's complication picker.
- **States:** phone not connected, the phone app not open, a phone and watch of different versions, no climb open, an empty list.
  Each says what is wrong and what to do.

The recorder is as before: Start and Stop, the heart rate, the elapsed time; a recording shows a return chip on the watch face.

The phone side is `modules/slackboard-wear` (the Data Layer module) and `src/core/wear.ts`
(message validation). The recorder's messages are listed in `Protocol.kt`; the remote's are in `Remote.kt` and
`src/core/remote.ts` (commands, state, answers, summary). Keep each set in step, and raise `REMOTE_VERSION` / `Remote.VERSION` with any
change of shape: a phone and watch on different versions refuse each other's messages and say so.

How it works: the watch tells the phone it is open (a `hello` now and every 30 s, `bye` when it leaves); only then the phone sends
its state (`src/state/remote.ts`), whenever the climb, the timer or the training set changes. A command from the watch is applied by the
phone exactly as the same action on the phone would be, and the next state is the answer, so the watch never shows a guess. A command
older than 15 seconds when the phone reads it is dropped.

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

## What a session sends

Heart rate every few seconds, the workout's running totals (calories, elevation gained, heart-rate average, minimum and maximum), elevation
samples, and one row of motion a second: acceleration and rotation strength with their peaks, gravity through the watch's three axes, and
air pressure. Raw sensor readings are never sent. The messages are listed in `Protocol.kt`. `What can this watch do?` on the watch (or
Settings > Watch on the phone) reports what the watch supports.

## Looking at the remote on an emulator

A debuggable build takes extras on its launch intent that fake the phone, so every screen can be seen without a link:
`--ez debugLinked true`, `--es debugState '<state json>'` (the shape in `src/core/remote.ts`), `--es debugAck '{"v":1,"id":"x","ok":true,"text":"Flash logged"}'`,
`--es debugScreen Actions|TimerLength|LogSend|LogAttempt|Recorder|Settings`, `--ez debugAmbient true` and `--es debugSummary '{...}'`.
Release builds ignore them.
