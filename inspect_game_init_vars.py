import sys
sys.stdout.reconfigure(encoding='utf-8')

with open("server/game.js", "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

print("--- addPlayer ---")
for idx, line in enumerate(lines):
    if "maxhealth: 100," in line.lower():
        for i in range(idx - 1, idx + 4):
            print(f"{i+1}: {lines[i]}", end="")
        break

print("\n--- initGame human ---")
for idx, line in enumerate(lines):
    if "p.maxhealth = 100;" in line.lower():
        for i in range(idx - 1, idx + 4):
            print(f"{i+1}: {lines[i]}", end="")
        break

print("\n--- initGame bot ---")
for idx, line in enumerate(lines):
    if "invisibility" in line.lower() and "selectedtrap" in line.lower():
        for i in range(idx - 1, idx + 8):
            print(f"{i+1}: {lines[i]}", end="")
        break

print("\n--- resetToLobby ---")
for idx, line in enumerate(lines):
    if "p.maxhealth = 100;" in line.lower():
        # Let's find the second one, since first is initGame
        if idx > 300:
            for i in range(idx - 1, idx + 4):
                print(f"{i+1}: {lines[i]}", end="")
            break
