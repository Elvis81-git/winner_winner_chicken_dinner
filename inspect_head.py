import sys
sys.stdout.reconfigure(encoding='utf-8')

def print_first_20_lines(file_path):
    print(f"=== {file_path} ===")
    with open(file_path, "rb") as f:
        head = f.read(200)
    print("Head bytes:", head[:50])
    
    # Try decoding
    for enc in ['utf-8', 'utf-16', 'big5', 'gbk', 'latin-1']:
        try:
            text = head.decode(enc)
            print(f"Decoded with {enc}: {text[:100]}")
            break
        except Exception as e:
            pass

print_first_20_lines("public/index.html")
print_first_20_lines("public/app.js")
