#!/bin/bash
# ── Smart Attendance — Download AI Models ────────────────────────────────
# Run this script ONCE before starting the AI Engine for the first time.
# Models will be saved to /app/models (or ./models if running locally).

MODEL_DIR="${1:-./models}"
mkdir -p "$MODEL_DIR"

echo "============================================"
echo " Smart Attendance — AI Model Downloader"
echo "============================================"
echo ""

# 1. InsightFace buffalo_l model (ArcFace recognition + detection)
echo "[1/2] Downloading InsightFace buffalo_l model..."
python3 -c "
import insightface
import os
os.makedirs('$MODEL_DIR', exist_ok=True)
app = insightface.app.FaceAnalysis(name='buffalo_l', root='$MODEL_DIR')
app.prepare(ctx_id=-1)
print('[OK] InsightFace buffalo_l model downloaded and verified.')
"

if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to download InsightFace model."
    echo "  Make sure 'insightface' is installed: pip install insightface onnxruntime"
    exit 1
fi

# 2. Silent-Face Anti-Spoofing model (optional)
echo ""
echo "[2/2] Silent-Face Anti-Spoofing model..."
echo "  → This model must be downloaded manually from:"
echo "    https://github.com/minivision-ai/Silent-Face-Anti-Spoofing"
echo "  → Place the model files in: $MODEL_DIR/anti_spoof/"
echo "  → If not installed, the engine will use heuristic fallback."

echo ""
echo "============================================"
echo " Download complete!"
echo " Model directory: $MODEL_DIR"
echo "============================================"
