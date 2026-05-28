import sys
sys.stdout.reconfigure(encoding='utf-8')

def detect_and_read(file_path):
    with open(file_path, "rb") as f:
        head = f.read(100)
    # Check for UTF-16 BOM
    if head.startswith(b'\xff\xfe') or head.startswith(b'\xfe\xff'):
        encoding = 'utf-16'
    else:
        encoding = 'utf-8'
    
    with open(file_path, "r", encoding=encoding, errors="ignore") as f:
        content = f.read()
    return content

def search_keywords(path, name):
    print(f"\n=== Searching in {name} ===")
    content = detect_and_read(path)
    lines = content.splitlines()
    
    keywords = ["roundachievements", "athlete", "hercules", "terminator", "wins", "leaderboard", "rank", "排行", "成就"]
    for idx, line in enumerate(lines):
        for kw in keywords:
            if kw in line.lower():
                print(f"Line {idx+1}: {line.strip()[:140]}")
                break

search_keywords("public/index.html", "index.html")
search_keywords("public/app.js", "app.js")
