import sys
sys.stdout.reconfigure(encoding='utf-8')

with open("public/style.css", "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

for idx in range(max(0, len(lines) - 30), len(lines)):
    print(f"{idx+1}: {lines[idx]}", end="")
