import sys
sys.stdout.reconfigure(encoding='utf-8')

with open("public/style.css", "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

start_line = -1
for idx, line in enumerate(lines):
    if "end-overlay" in line:
        start_line = idx
        break

if start_line != -1:
    for idx in range(max(0, start_line - 10), min(start_line + 60, len(lines))):
        print(f"{idx+1}: {lines[idx]}", end="")
else:
    print("end-overlay not found in style.css")
