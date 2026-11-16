#!/bin/zsh
# Erzeugt die Übungsillustrationen mit der Antigravity-CLI (siehe docs/GRAPHICS.md).
# Aufruf: generate.sh <Arbeitsordner> <motifs.tsv> [parallele Läufe]
# Im Arbeitsordner muss style-reference.jpg liegen. Fertige Bilder landen in out/<id>.jpg
# (960 px breit), die Originale in orig/. Vorhandene Bilder werden übersprungen.
set -u
WORK="$1"
MOTIFS="$2"
JOBS="${3:-2}"
BRAIN="$HOME/.gemini/antigravity-cli/brain"
STYLE="Style: the file style-reference.jpg in the current directory is the binding style reference. Pass it as a reference/input image to your image generation tool and match it exactly: the same faceless bald gender-neutral mannequin figure in light grey-white with thin black contour lines, the same flat vector look with solid fills, the same mid-grey equipment, the same near-black background (#0a0a0a) with a thin floor line, and the working muscles filled in the same bright lime green (#a3e635) as clean simple shapes. Only the pose, the viewing angle and the equipment change. 4:3 landscape, whole body and all equipment fully visible and centred. Anatomically correct: exactly two arms and two legs, natural joints, each hand holds its equipment. No text, no letters, no numbers, no logos, no arrows, only one person."

mkdir -p "$WORK/out" "$WORK/orig" "$WORK/logs"
cd "$WORK" || exit 1

run_one() {
  local id="$1" motif="$2"
  [[ -f "out/$id.jpg" ]] && return 0
  local name="cf_${id//-/_}"
  agy -p "Generate one image with your image generation tool and name it $name. Do not write code and do not draw it with Python or SVG; use real AI image generation. Motif: $motif $STYLE" \
    --model gemini-3.8-flash-medium --print-timeout 300s > "logs/$id.txt" 2>&1 < /dev/null
  # Kontingent des Abos aufgebraucht: Serie beenden, der nächste Lauf macht hier weiter.
  if grep -q "RESOURCE_EXHAUSTED" "logs/$id.txt"; then
    touch quota.flag
    echo "quota $id" >> progress.txt
    return 0
  fi
  # Die CLI erzeugt teils mehrere Anläufe; der neueste zählt.
  local newest
  newest=$(find "$BRAIN" -type f -name "${name}*.jpg" -not -path "*/.system_generated/*" -exec stat -f "%m %N" {} + 2>/dev/null | sort -n | tail -1 | cut -d" " -f2-)
  if [[ -n "$newest" ]]; then
    cp "$newest" "orig/$id.jpg"
    sips -Z 960 -s format jpeg -s formatOptions 72 "orig/$id.jpg" --out "out/$id.jpg" > /dev/null 2>&1
    echo "ok $id" >> progress.txt
  else
    echo "failed $id" >> progress.txt
  fi
}

rm -f quota.flag
echo "run $(date +%Y-%m-%dT%H:%M)" >> progress.txt
running=0
while IFS=$'\t' read -r id motif; do
  [[ -z "$id" ]] && continue
  [[ -f quota.flag ]] && break
  run_one "$id" "$motif" &
  running=$((running + 1))
  if (( running >= JOBS )); then
    wait
    running=0
  fi
done < "$MOTIFS"
wait
if [[ -f quota.flag ]]; then
  echo "stopped: quota" >> progress.txt
else
  echo "run finished" >> progress.txt
fi
