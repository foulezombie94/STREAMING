import sys

path = r'C:\Users\pc\.gemini\antigravity\scratch\movieverse\src\style.css'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

o = content.count('{')
c = content.count('}')
print(f"Open: {o}, Close: {c}")
