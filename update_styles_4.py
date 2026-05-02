import sys

path = r'C:\Users\pc\.gemini\antigravity\scratch\movieverse\src\style.css'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    # Remove existing genre-filters styles (they will be hidden)
    if '.genre-filters {' in line:
        new_lines.append('.genre-filters {\n    display: none !important;\n}\n')
        skip = True
        continue
    if skip and '}' in line:
        skip = False
        continue
    if skip:
        continue
    
    # Update mobile-filter-btn to be general filter-btn
    if '.mobile-filter-btn {' in line:
        new_lines.append('.filter-btn {\n')
        new_lines.append('    display: flex;\n')
        new_lines.append('    background: rgba(255, 255, 255, 0.05);\n')
        new_lines.append('    border: 1px solid rgba(255, 255, 255, 0.1);\n')
        new_lines.append('    color: #fff;\n')
        new_lines.append('    padding: 12px 24px;\n')
        new_lines.append('    border-radius: 12px;\n')
        new_lines.append('    font-size: 15px;\n')
        new_lines.append('    font-weight: 700;\n')
        new_lines.append('    margin-left: 4rem;\n')
        new_lines.append('    align-items: center;\n')
        new_lines.append('    gap: 12px;\n')
        new_lines.append('    cursor: pointer;\n')
        new_lines.append('    backdrop-filter: blur(10px);\n')
        new_lines.append('    transition: all 0.3s ease;\n')
        new_lines.append('    text-transform: uppercase;\n')
        new_lines.append('    letter-spacing: 1px;\n')
        new_lines.append('}\n\n')
        new_lines.append('.filter-btn:hover {\n')
        new_lines.append('    background: rgba(255, 255, 255, 0.15);\n')
        new_lines.append('    border-color: #ef4444;\n')
        new_lines.append('    transform: translateY(-2px);\n')
        new_lines.append('    box-shadow: 0 5px 15px rgba(239, 68, 68, 0.2);\n')
        new_lines.append('}\n')
        skip = True
        continue

    # Update overlay to be a centered modal on desktop
    if '.mobile-genre-overlay {' in line:
        new_lines.append('.genre-overlay {\n')
        new_lines.append('    position: fixed;\n')
        new_lines.append('    inset: 0;\n')
        new_lines.append('    background: rgba(0,0,0,0.85);\n')
        new_lines.append('    backdrop-filter: blur(12px);\n')
        new_lines.append('    z-index: 2000;\n')
        new_lines.append('    display: flex;\n')
        new_lines.append('    align-items: center;\n')
        new_lines.append('    justify-content: center;\n')
        new_lines.append('    opacity: 0;\n')
        new_lines.append('    pointer-events: none;\n')
        new_lines.append('    transition: all 0.3s ease;\n')
        new_lines.append('}\n')
        skip = True
        continue
    
    if '.mobile-genre-content {' in line:
        new_lines.append('.genre-overlay-content {\n')
        new_lines.append('    width: 90%;\n')
        new_lines.append('    max-width: 600px;\n')
        new_lines.append('    background: #0a0a0a;\n')
        new_lines.append('    border: 1px solid rgba(255,255,255,0.1);\n')
        new_lines.append('    border-radius: 24px;\n')
        new_lines.append('    padding: 40px;\n')
        new_lines.append('    transform: scale(0.9) translateY(20px);\n')
        new_lines.append('    transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1.1);\n')
        new_lines.append('}\n')
        skip = True
        continue

    if '.mobile-genre-overlay.active .mobile-genre-content {' in line:
        new_lines.append('.genre-overlay.active {\n    opacity: 1;\n    pointer-events: auto;\n}\n\n')
        new_lines.append('.genre-overlay.active .genre-overlay-content {\n    transform: scale(1) translateY(0);\n}\n')
        skip = True
        continue
        
    if '.mobile-genre-grid {' in line:
        new_lines.append('.genre-grid {\n')
        new_lines.append('    display: grid;\n')
        new_lines.append('    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));\n')
        new_lines.append('    gap: 12px;\n')
        new_lines.append('    max-height: 70vh;\n')
        new_lines.append('    overflow-y: auto;\n')
        new_lines.append('    padding-right: 10px;\n')
        new_lines.append('}\n')
        skip = True
        continue

    if '.mobile-genre-item {' in line:
        new_lines.append('.genre-item {\n')
        new_lines.append('    background: rgba(255,255,255,0.03);\n')
        new_lines.append('    border: 1px solid rgba(255,255,255,0.08);\n')
        new_lines.append('    color: #A3A3A3;\n')
        new_lines.append('    padding: 18px;\n')
        new_lines.append('    border-radius: 12px;\n')
        new_lines.append('    text-align: center;\n')
        new_lines.append('    font-weight: 600;\n')
        new_lines.append('    cursor: pointer;\n')
        new_lines.append('    transition: all 0.2s ease;\n')
        new_lines.append('}\n')
        skip = True
        continue

    if '.mobile-genre-item.active {' in line:
        new_lines.append('.genre-item.active, .genre-item:hover {\n')
        new_lines.append('    background: #ef4444;\n')
        new_lines.append('    border-color: #ef4444;\n')
        new_lines.append('    color: #fff;\n')
        new_lines.append('    transform: scale(1.02);\n')
        new_lines.append('}\n')
        skip = True
        continue

    # Cleanup media queries
    if '@media (max-width: 768px) {' in line:
        skip = True
        continue
    if skip and '    .mobile-filter-btn { display: flex; }' in line:
        continue
    if skip and '    .genre-filters-container { margin-top: 60px; }' in line:
        new_lines.append('@media (max-width: 768px) {\n')
        new_lines.append('    .filter-btn { margin-left: 1.5rem; }\n')
        new_lines.append('    .genre-filters-container { margin-top: 60px; }\n')
        new_lines.append('    .genre-overlay { align-items: flex-end; }\n')
        new_lines.append('    .genre-overlay-content { width: 100%; border-radius: 24px 24px 0 0; padding: 25px; }\n')
        new_lines.append('    .genre-grid { grid-template-columns: repeat(2, 1fr); }\n')
        new_lines.append('}\n')
        skip = False
        continue

    new_lines.append(line)

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
