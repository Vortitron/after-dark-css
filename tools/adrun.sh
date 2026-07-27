#!/bin/bash
# adrun.sh - run a real After Dark 4.0 module under Wine and capture it.
#
# The AD40/ tree is a complete Windows install: AFTERDAR.SCR plus ~44 .AD
# modules. Rather than guess at how each screensaver is meant to look, we run
# the original engine headless (Xvfb) and grab frames off the X display. That
# is our ground truth for every module in one go.
#
# The engine picks its module from the registry:
#   HKLM\Software\Berkeley Systems\After Dark\4.00      Path   = install dir
#   HKCU\Software\Berkeley Systems\After Dark           SelectedFolder = folder
#   HKCU\Software\Berkeley Systems\After Dark\Folders   <folder> = MODULE
#   HKCU\...\Module Settings\<folder>\<MODULE>          Control0..N = its options
#
#   tools/adrun.sh setup                  # one-off: stage the install into wine
#   tools/adrun.sh list                   # folder/module inventory
#   tools/adrun.sh shot AD10th MARBLES    # single png
#   tools/adrun.sh clip AD10th MARBLES 20 # 20s mp4 + frame png
#   tools/adrun.sh all                    # every module, one clip each
#
# Needs: the 32-bit wine sandbox (see AD_SANDBOX below), Xvfb, ffmpeg.

set -u

AD_ROOT=${AD_ROOT:-$(cd "$(dirname "$0")/.." && pwd)/AD40}
AD_SANDBOX=${AD_SANDBOX:?set AD_SANDBOX to the dir holding wine32/root and wineprefix}
AD_OUT=${AD_OUT:-$AD_SANDBOX/capture}
AD_DISPLAY=${AD_DISPLAY:-:97}
AD_SIZE=${AD_SIZE:-1024x768}
WINE_DIR="c:\\Program Files\\After Dark"
UNIX_DIR="$AD_SANDBOX/wineprefix/drive_c/Program Files/After Dark"

SB=$AD_SANDBOX/wine32/root
WINE_BIN=$SB/usr/lib/wine/wine
# `timeout` execs a real binary, so keep this an env prefix rather than a
# shell function - a function here silently never runs.
WINE_ENV=(env
  "WINEPREFIX=$AD_SANDBOX/wineprefix"
  "WINEDLLPATH=$SB/usr/lib/i386-linux-gnu/wine"
  "LD_LIBRARY_PATH=$SB/usr/lib/i386-linux-gnu:$SB/lib/i386-linux-gnu:$SB/usr/lib/i386-linux-gnu/wine"
  "WINELOADER=$WINE_BIN"
  "WINESERVER=$SB/usr/lib/wine/wineserver"
  "WINEDEBUG=${WINEDEBUG:--all}"
  "DISPLAY=$AD_DISPLAY")

wine32() { "${WINE_ENV[@]}" "$WINE_BIN" "$@"; }

start_xvfb() {
  if ! xdpyinfo -display "$AD_DISPLAY" >/dev/null 2>&1; then
    Xvfb "$AD_DISPLAY" -screen 0 "${AD_SIZE}x24" >/dev/null 2>&1 &
    sleep 2
  fi
}

# The folders the engine offers, and where each one comes from in AD40/.
FOLDERS=(AD10th AD40 Classic)
src_of() { case $1 in AD10th) echo AD10th ;; AD40) echo AD40 ;; Classic) echo CLASSIC ;; esac; }

# AFTERDAR.SCR only enables its 16-bit (NE) module loader when GetVersionEx
# reports a 9x platform id, so the prefix has to claim Windows 98 for those.
# The 32-bit modules in turn only render correctly with the NT default, hence
# one setting per module rather than one for the prefix.
winver_for() {
  local f
  for f in "$AD_ROOT"/*/"$1".[Aa][Dd]; do
    [ -e "$f" ] || continue
    python3 - "$f" <<'PY'
import struct, sys
b = open(sys.argv[1], "rb").read(0x400)
sig = b[struct.unpack_from("<I", b, 0x3C)[0]:][:2]
print("win98" if sig == b"NE" else "win7")
PY
    return
  done
  echo win7
}

# Point the engine at a module. Controls are optional "N=value" pairs matching
# the module's own settings panel (TYPE_1000 in the .AD resources).
select_module() {
  local folder=$1 mod=$2; shift 2
  local reg=$AD_SANDBOX/select.reg
  {
    printf 'REGEDIT4\r\n\r\n'
    printf '[HKEY_CURRENT_USER\\Software\\Wine]\r\n"Version"="%s"\r\n\r\n' "$(winver_for "$mod")"
    printf '[HKEY_LOCAL_MACHINE\\Software\\Berkeley Systems\\After Dark\\4.00]\r\n'
    printf '"Path"="C:\\\\Program Files\\\\After Dark"\r\n\r\n'
    printf '[HKEY_CURRENT_USER\\Software\\Berkeley Systems\\After Dark]\r\n'
    printf '"SelectedFolder"="%s"\r\n"Randomizer"=dword:00000000\r\n\r\n' "$folder"
    printf '[HKEY_CURRENT_USER\\Software\\Berkeley Systems\\After Dark\\Folders]\r\n'
    for f in "${FOLDERS[@]}"; do printf '"%s"="%s"\r\n' "$f" "$mod"; done
    printf '\r\n[HKEY_CURRENT_USER\\Software\\Berkeley Systems\\After Dark\\Module Settings\\%s\\%s]\r\n' "$folder" "$mod"
    for kv in "$@"; do
      printf '"Control%s"=dword:%08x\r\n' "${kv%%=*}" "${kv##*=}"
    done
  } > "$reg"
  wine32 regedit "$reg" >/dev/null 2>&1
  sleep 1
}

run_engine() {   # run_engine <seconds>
  timeout "$1" "${WINE_ENV[@]}" "$WINE_BIN" "$WINE_DIR\\AFTERDAR.SCR" /s >/dev/null 2>&1 &
}

# The engine takes over the whole display, so the previous run has to be gone
# before the next one starts or the newcomer just shows a black screen.
stop_engine() {
  pkill -f 'AFTERDAR\.SCR' 2>/dev/null
  local n=0
  while pgrep -f 'AFTERDAR\.SCR' >/dev/null && [ "$n" -lt 20 ]; do sleep 0.5; n=$((n + 1)); done
  sleep 1
}

cmd_setup() {
  cp -r "$AD_ROOT/ENGINE/." "$UNIX_DIR/"
  for f in "${FOLDERS[@]}"; do
    mkdir -p "$UNIX_DIR/$f"
    cp -r "$AD_ROOT/$(src_of "$f")/." "$UNIX_DIR/$f/"
    # the shared runtimes (ADXPL*.DLL and friends) have to sit next to the .scr
    cp -n "$UNIX_DIR/$f"/*.DLL "$UNIX_DIR/" 2>/dev/null
  done
  echo "staged $AD_ROOT -> $UNIX_DIR (${FOLDERS[*]})"
}

cmd_list() {
  for f in "${FOLDERS[@]}"; do
    printf '%s:\n' "$f"
    for m in "$AD_ROOT/$(src_of "$f")"/*.[Aa][Dd]; do
      [ -e "$m" ] || continue
      printf '  %s\n' "$(basename "${m%.*}")"
    done
  done
}

cmd_shot() {
  local folder=$1 mod=$2; shift 2
  start_xvfb; mkdir -p "$AD_OUT/$folder"
  select_module "$folder" "$mod" "$@"
  stop_engine
  run_engine 16
  sleep 9
  ffmpeg -nostdin -y -f x11grab -video_size "$AD_SIZE" -i "$AD_DISPLAY" -frames:v 1 \
         "$AD_OUT/$folder/$mod.png" -loglevel error
  stop_engine
  echo "$AD_OUT/$folder/$mod.png"
}

cmd_clip() {
  local folder=$1 mod=$2 secs=${3:-20}; shift 3 2>/dev/null || shift 2
  start_xvfb; mkdir -p "$AD_OUT/$folder"
  select_module "$folder" "$mod" "$@"
  stop_engine
  run_engine $((secs + 7))
  sleep 5
  ffmpeg -nostdin -y -f x11grab -framerate 15 -video_size "$AD_SIZE" -i "$AD_DISPLAY" \
         -t "$secs" -pix_fmt yuv420p "$AD_OUT/$folder/$mod.mp4" -loglevel error
  stop_engine
  ffmpeg -nostdin -y -i "$AD_OUT/$folder/$mod.mp4" -vf "select=eq(n\,$((secs * 15 / 2)))" \
         -frames:v 1 "$AD_OUT/$folder/$mod.png" -loglevel error
  echo "$AD_OUT/$folder/$mod.mp4"
}

cmd_all() {
  local secs=${1:-12}
  for f in "${FOLDERS[@]}"; do
    for m in "$AD_ROOT/$(src_of "$f")"/*.[Aa][Dd]; do
      [ -e "$m" ] || continue
      local mod; mod=$(basename "${m%.*}")
      echo "--- $f/$mod"
      cmd_clip "$f" "$mod" "$secs"
    done
  done
}

case ${1:-} in
  setup) cmd_setup ;;
  list)  cmd_list ;;
  shot)  shift; cmd_shot "$@" ;;
  clip)  shift; cmd_clip "$@" ;;
  all)   shift; cmd_all "$@" ;;
  *) sed -n '2,26p' "$0"; exit 1 ;;
esac
