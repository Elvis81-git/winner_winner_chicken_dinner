import sys
sys.stdout.reconfigure(encoding='utf-8')

with open("public/app.js", "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if "drawplayers" in line.lower() or "function drawplayer" in line.lower():
        print(f"Line {idx+1}: {line.strip()}")
