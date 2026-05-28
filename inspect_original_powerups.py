import sys
sys.stdout.reconfigure(encoding='utf-8')

with open("e:/test/zomibe/server/game.js", "r", encoding="utf-8", errors="ignore") as f:
    content = f.read()

# Let's find checkPowerups
idx = content.find("checkPowerups")
if idx != -1:
    print("Found checkPowerups in original game.js:")
    print(content[idx:idx+1500])
else:
    print("checkPowerups not found in original game.js")
