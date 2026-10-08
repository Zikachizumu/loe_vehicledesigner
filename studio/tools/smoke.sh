#!/usr/bin/env bash
# Paketlenmiş uygulamayı başlatır, verilen JS senaryosunu çalıştırır ve ekran görüntüsünü alır.
#   smoke.sh <çıktı.png> <senaryo.js> [exe klasörü]
# Senaryo: sayfa bağlamında çalışan bir async ifade (son değeri günlüğe yazılır).
set -e
OUT="$1"; JS="$2"; DIR="${3:-$HOME/Desktop/LOE Vehicle Studio}"
export LVS_SMOKE="$(cygpath -w "$OUT" 2>/dev/null || echo "$OUT")"
export LVS_SMOKE_JS="$(cat "$JS")"
rm -f "$OUT" "$OUT.log"
"$DIR/LOE Vehicle Studio.exe"
[ -f "$OUT.log" ] && head -c 3000 "$OUT.log"
