import os

file_path = 'src/main.ts'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove backslash before backticks
content = content.replace('\\`', '`')
# Remove backslash before ${
content = content.replace('\\${', '${')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("File fixed.")
