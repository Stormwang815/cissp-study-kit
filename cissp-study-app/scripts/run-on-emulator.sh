#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SDK_DIR="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}}"
ADB="$SDK_DIR/platform-tools/adb"
EMU="$SDK_DIR/emulator/emulator"
AVD="${1:-CISSP_API35}"
APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"

if [[ ! -f "$APK" ]]; then
  "$ROOT/scripts/build-apk.sh"
fi

"$ADB" start-server
if ! "$ADB" devices | grep -q 'device$'; then
  nohup "$EMU" -avd "$AVD" -no-snapshot -no-audio -gpu host -memory 1536 -no-boot-anim > "$ROOT/emulator-$AVD.log" 2>&1 &
fi

echo "Waiting for emulator..."
for _ in {1..100}; do
  if "$ADB" devices | grep -q 'device$'; then
    if [[ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; then
      break
    fi
  fi
  sleep 3
done

"$ADB" install -r "$APK"
"$ADB" shell monkey -p com.local.cisspstudy -c android.intent.category.LAUNCHER 1
