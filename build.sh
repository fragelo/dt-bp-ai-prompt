#!/usr/bin/env bash
# build.sh — packages the Dynatrace app zip for upload
# Usage: ./build.sh [path-to-main.css]
#
# main.css (Dynatrace Stelvio design system) is NOT in the repo.
# Provide it as the first argument, or place it at ui/main.css manually.

set -e

CSS_SRC="${1:-ui/main.css}"
OUTPUT="dt-log-analyst-app.zip"

if [ ! -f "$CSS_SRC" ]; then
  echo "ERROR: main.css not found at '$CSS_SRC'"
  echo ""
  echo "The Dynatrace Stelvio CSS is required but not bundled in this repo."
  echo "Extract it from an existing Dynatrace app bundle:"
  echo "  unzip existing-dt-app.zip ui/main.css -d ."
  echo ""
  echo "Then re-run: ./build.sh"
  exit 1
fi

# Copy CSS if provided from external path
if [ "$CSS_SRC" != "ui/main.css" ]; then
  cp "$CSS_SRC" ui/main.css
  echo "Copied $CSS_SRC → ui/main.css"
fi

rm -f "$OUTPUT"
zip -r "$OUTPUT" ui/ manifest.yaml icon.svg -x "*.DS_Store"

echo ""
echo "Built: $OUTPUT ($(du -sh "$OUTPUT" | cut -f1))"
echo "Upload to your Dynatrace tenant via App Management → Upload app"
