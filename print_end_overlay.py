import sys
sys.stdout.reconfigure(encoding='utf-8')

with open("public/index.html", "r", encoding="utf-8", errors="ignore") as f:
    content = f.read()

idx = content.find('id="end-overlay"')
if idx != -1:
    print(content[idx-100:idx+800])
else:
    print("end-overlay not found")
