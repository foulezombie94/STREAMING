import sys

path = r'C:\Users\pc\.gemini\antigravity\scratch\movieverse\src\style.css'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if '.genre-filters-container {' in line:
        new_lines.append('.genre-filters-container {\n')
        new_lines.append('    position: relative;\n')
        new_lines.append('    width: 100%;\n')
        new_lines.append('    z-index: 90;\n')
        new_lines.append('    background: transparent;\n')
        new_lines.append('    padding: 20px 0 0 0;\n')
        new_lines.append('    margin-top: 80px; /* Espace pour la navbar fixe */\n')
        new_lines.append('}\n')
        skip = True
        continue
    if skip and '}' in line:
        skip = False
        continue
    if skip:
        continue
    new_lines.append(line)

# Append new styles for mobile
new_lines.append('\n/* --- MOBILE FILTER STYLES --- */\n')
new_lines.append('.mobile-filter-btn {\n')
new_lines.append('    display: none;\n')
new_lines.append('    background: rgba(255, 255, 255, 0.05);\n')
new_lines.append('    border: 1px solid rgba(255, 255, 255, 0.1);\n')
new_lines.append('    color: #fff;\n')
new_lines.append('    padding: 12px 20px;\n')
new_lines.append('    border-radius: 8px;\n')
new_lines.append('    font-size: 14px;\n')
new_lines.append('    font-weight: 600;\n')
new_lines.append('    margin: 0 1.5rem;\n')
new_lines.append('    align-items: center;\n')
new_lines.append('    gap: 10px;\n')
new_lines.append('    cursor: pointer;\n')
new_lines.append('    backdrop-filter: blur(10px);\n')
new_lines.append('}\n\n')

new_lines.append('.mobile-genre-overlay {\n')
new_lines.append('    position: fixed;\n')
new_lines.append('    inset: 0;\n')
new_lines.append('    background: rgba(0,0,0,0.8);\n')
new_lines.append('    backdrop-filter: blur(10px);\n')
new_lines.append('    z-index: 2000;\n')
new_lines.append('    display: flex;\n')
new_lines.append('    align-items: flex-end;\n')
new_lines.append('    opacity: 0;\n')
new_lines.append('    pointer-events: none;\n')
new_lines.append('    transition: opacity 0.3s ease;\n')
new_lines.append('}\n\n')

new_lines.append('.mobile-genre-overlay.active {\n')
new_lines.append('    opacity: 1;\n')
new_lines.append('    pointer-events: auto;\n')
new_lines.append('}\n\n')

new_lines.append('.mobile-genre-content {\n')
new_lines.append('    width: 100%;\n')
new_lines.append('    background: #111;\n')
new_lines.append('    border-top: 1px solid rgba(255,255,255,0.1);\n')
new_lines.append('    border-top-left-radius: 20px;\n')
new_lines.append('    border-top-right-radius: 20px;\n')
new_lines.append('    padding: 25px;\n')
new_lines.append('    transform: translateY(100%);\n')
new_lines.append('    transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);\n')
new_lines.append('}\n\n')

new_lines.append('.mobile-genre-overlay.active .mobile-genre-content {\n')
new_lines.append('    transform: translateY(0);\n')
new_lines.append('}\n\n')

new_lines.append('.mobile-genre-header {\n')
new_lines.append('    display: flex;\n')
new_lines.append('    justify-content: space-between;\n')
new_lines.append('    align-items: center;\n')
new_lines.append('    margin-bottom: 20px;\n')
new_lines.append('}\n\n')

new_lines.append('.mobile-genre-grid {\n')
new_lines.append('    display: grid;\n')
new_lines.append('    grid-template-columns: repeat(2, 1fr);\n')
new_lines.append('    gap: 10px;\n')
new_lines.append('    max-height: 60vh;\n')
new_lines.append('    overflow-y: auto;\n')
new_lines.append('}\n\n')

new_lines.append('.mobile-genre-item {\n')
new_lines.append('    background: rgba(255,255,255,0.05);\n')
new_lines.append('    border: 1px solid rgba(255,255,255,0.1);\n')
new_lines.append('    color: #fff;\n')
new_lines.append('    padding: 15px;\n')
new_lines.append('    border-radius: 12px;\n')
new_lines.append('    text-align: center;\n')
new_lines.append('    font-weight: 600;\n')
new_lines.append('    cursor: pointer;\n')
new_lines.append('}\n\n')

new_lines.append('.mobile-genre-item.active {\n')
new_lines.append('    background: #ef4444;\n')
new_lines.append('    border-color: #ef4444;\n')
new_lines.append('}\n\n')

new_lines.append('@media (max-width: 768px) {\n')
new_lines.append('    .genre-filters { display: none; }\n')
new_lines.append('    .mobile-filter-btn { display: flex; }\n')
new_lines.append('    .genre-filters-container { margin-top: 60px; }\n')
new_lines.append('}\n')

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
