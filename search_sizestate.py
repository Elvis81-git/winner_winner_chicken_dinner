import sys
sys.stdout.reconfigure(encoding='utf-8')

with open("server/game.js", "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if "sizeState" in line or "big" in line or "small" in line:
        # print line and context
        print(f"Line {idx+1}: {line.strip()}")
