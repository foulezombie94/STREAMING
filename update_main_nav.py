import sys

path = r'C:\Users\pc\.gemini\antigravity\scratch\movieverse\src\main.ts'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    if '// 4. Gestion de la Navigation' in line:
        new_lines.append('// 4. Gestion de la Navigation (Top & Bottom)\n')
        new_lines.append('const bottomNavItems = document.querySelectorAll(\'.bottom-nav-item\');\n\n')
        new_lines.append('function handleNavigation(type: any) {\n')
        new_lines.append('    [navItems, bottomNavItems].forEach(collection => {\n')
        new_lines.append('        collection.forEach(i => {\n')
        new_lines.append('            if (i.getAttribute(\'data-type\') === type) i.classList.add(\'active\');\n')
        new_lines.append('            else i.classList.remove(\'active\');\n')
        new_lines.append('        });\n')
        new_lines.append('    });\n\n')
        new_lines.append('    currentType = type as \'movie\' | \'tv\' | \'trending\';\n')
        new_lines.append('    activeGenreId = null; \n\n')
        new_lines.append('    if (sectionTitle) {\n')
        new_lines.append('        if (currentType === \'trending\') sectionTitle.textContent = \'Tendances Actuelles\';\n')
        new_lines.append('        else if (currentType === \'tv\') sectionTitle.textContent = \'Séries Populaires\';\n')
        new_lines.append('        else sectionTitle.textContent = \'Films Populaires\';\n')
        new_lines.append('    }\n\n')
        new_lines.append('    renderGenres(currentType);\n')
        new_lines.append('    fetchPopularData(currentType);\n')
        new_lines.append('    window.scrollTo({ top: 0, behavior: \'smooth\' });\n')
        new_lines.append('}\n\n')
        new_lines.append('[navItems, bottomNavItems].forEach(collection => {\n')
        new_lines.append('    collection.forEach(item => {\n')
        new_lines.append('        item.addEventListener(\'click\', (e) => {\n')
        new_lines.append('            e.preventDefault();\n')
        new_lines.append('            const type = item.getAttribute(\'data-type\');\n')
        new_lines.append('            if (type) handleNavigation(type);\n')
        new_lines.append('        });\n')
        new_lines.append('    });\n')
        new_lines.append('});\n')
        skip = True
        continue
    
    # We want to skip the old navItems.forEach loop
    # It ends at line 85 approximately
    if skip:
        if '});' in line and i > 75: # Stop skipping after the loop
            skip = False
        continue
        
    new_lines.append(line)

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
