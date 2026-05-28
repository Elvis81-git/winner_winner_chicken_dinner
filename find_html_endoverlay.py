import sys
sys.stdout.reconfigure(encoding='utf-8')

with open("public/index.html", "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if 'id="end-overlay"' in line:
        print(f"Start index: {idx+1}")
        for i in range(idx, min(idx + 15, len(lines))):
            print(f"{i+1}: {lines[i]}", end="")
        break
