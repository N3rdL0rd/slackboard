#!/usr/bin/env bash
# Builds the Android app locally. Usage: scripts/build-android.sh [debug|release]
# Needs JDK 21 and the Android SDK (ANDROID_HOME). Set SLACKBOARD_KEYSTORE (+ _PASSWORD, SLACKBOARD_KEY_ALIAS, SLACKBOARD_KEY_PASSWORD)
# to sign a release with your own key; without them a release is signed with the debug key.
set -euo pipefail
cd "$(dirname "$0")/.."
variant="${1:-debug}"
: "${ANDROID_HOME:=$HOME/Android/Sdk}"
export ANDROID_HOME
npx expo prebuild --platform android --no-install
cd android
if [ "$variant" = release ]; then ./gradlew assembleRelease; else ./gradlew assembleDebug; fi
echo
find app/build/outputs/apk -name '*.apk' -newer ../app.json -print
