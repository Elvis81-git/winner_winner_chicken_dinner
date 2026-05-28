import sys
sys.stdout.reconfigure(encoding='utf-8')

with open("public/app.js", "r", encoding="utf-8", errors="ignore") as f:
    content = f.read()

# Search for players-roster or rosterList
idx = content.find("rosterList")
while idx != -1:
    print(f"Found rosterList at index {idx}:")
    start = max(0, idx - 50)
    end = min(len(content), idx + 350)
    print(content[start:end])
    print("---")
    idx = content.find("rosterList", idx + 1)
