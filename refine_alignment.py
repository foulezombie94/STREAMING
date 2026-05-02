import sys

path = r'C:\Users\pc\.gemini\antigravity\scratch\movieverse\src\style.css'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove profile-pic styles
import re
content = re.sub(r'\.profile-pic\s*\{[^{}]*\}', '', content, flags=re.DOTALL)
content = re.sub(r'\.profile-pic:hover\s*\{[^{}]*\}', '', content, flags=re.DOTALL)

# 2. Simplify search bar to JUST an icon (no background, no border by default)
content = content.replace(
    '.search-container {',
    '.search-container {\n    background: transparent;\n    border: none;\n    padding: 0;\n    display: flex;\n    align-items: center;\n    cursor: pointer;'
)

# 3. Handle alignment in navbar
content = content.replace(
    '.navbar {',
    '.navbar {\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n    padding: 1.2rem 4rem;'
)

# 4. Refine mobile alignment and search
mobile_refinements = """
@media (max-width: 768px) {
    .navbar { padding: 1rem 1.5rem; justify-content: space-between; }
    .nav-links { display: none !important; }
    .nav-actions { gap: 15px; }
    .nav-actions .icon:first-of-type { display: none; } /* Hide bell */
    .search-container { background: transparent; border: none; }
    .search-icon { width: 24px; height: 24px; color: #FFF; }
    .search-input { width: 0; opacity: 0; }
    .search-container:focus-within .search-input { width: 150px; opacity: 1; background: rgba(255,255,255,0.1); border-radius: 20px; padding: 5px 10px; margin-left: 5px; }
}
"""

# Append mobile refinements and remove old ones
content = re.sub(r'@media\s*\(max-width:\s*768px\)\s*\{.*\}', mobile_refinements, content, flags=re.DOTALL)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
