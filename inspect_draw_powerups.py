import sys
sys.stdout.reconfigure(encoding='utf-8')

with open("public/app.js", "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

for idx in range(980, min(1030, len(lines))):
    print(f"{idx+1}: {lines[idx]}", end="")
