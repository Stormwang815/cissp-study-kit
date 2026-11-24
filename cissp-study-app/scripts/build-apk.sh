#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SDK_DIR="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}}"
printf 'sdk.dir=%s\n' "$SDK_DIR" > android/local.properties
npm run build
npx cap sync android
(
  cd android
  if [[ -z "${JAVA_HOME:-}" ]] && command -v /usr/libexec/java_home >/dev/null 2>&1; then
    JAVA_HOME="$(/usr/libexec/java_home)" ./gradlew assembleDebug
  else
    ./gradlew assembleDebug
  fi
)

echo "APK: $ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
