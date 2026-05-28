import sys
sys.stdout.reconfigure(encoding='utf-8')

with open("public/app.js", "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if "effect" in line.lower() and ("socket.on" in line.lower() or "draw" in line.lower() or "push" in line.lower()):
        print(f"Line {idx+1}: {line.strip()}")
