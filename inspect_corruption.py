import sys
sys.stdout.reconfigure(encoding='utf-8')

with open("server/game.js", "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

print(f"Total lines in game.js: {len(lines)}")
for idx in range(1090, min(1160, len(lines))):
    print(f"{idx+1}: {lines[idx]}", end="")
