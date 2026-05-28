import sys
sys.stdout.reconfigure(encoding='utf-8')

with open("server/game.js", "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

start_line = -1
for idx, line in enumerate(lines):
    if "updateboxes(" in line.lower() or "updateboxes = " in line.lower():
        start_line = idx
        break

if start_line != -1:
    for idx in range(start_line, min(start_line + 45, len(lines))):
        print(f"{idx+1}: {lines[idx]}", end="")
else:
    print("updateBoxes definition not found")
