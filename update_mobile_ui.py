import sys

path = r'C:\Users\pc\.gemini\antigravity\scratch\movieverse\src\style.css'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add bottom nav styles and mobile refinements at the end
bottom_nav_css = """
/* --- BOTTOM NAV MOBILE --- */
.bottom-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 70px;
    background: rgba(5, 5, 5, 0.85);
    backdrop-filter: blur(20px);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: none; /* Cache par défaut */
    justify-content: space-around;
    align-items: center;
    z-index: 1000;
    padding-bottom: env(safe-area-inset-bottom);
}

.bottom-nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    color: #A3A3A3;
    text-decoration: none;
    transition: all 0.3s ease;
}

.bottom-nav-item svg {
    width: 24px;
    height: 24px;
    fill: currentColor;
}

.bottom-nav-item span {
    font-size: 10px;
    font-weight: 600;
}

.bottom-nav-item.active {
    color: #ef4444;
}

/* --- MOBILE REFINEMENTS --- */
@media (max-width: 768px) {
    .navbar { padding: 1rem 1.5rem; }
    .nav-links { display: none !important; }
    .nav-actions .icon { display: none; } /* On cache la cloche pour gagner de la place */
    .profile-pic { width: 32px; height: 32px; }
    
    .bottom-nav { display: flex; }
    
    .hero-content { width: 90%; padding-left: 1.5rem; padding-top: 15vh; }
    .hero h1 { font-size: 32px; line-height: 1.2; }
    .hero-synopsis { font-size: 13px; -webkit-line-clamp: 3; }
    
    .genre-filters-container { margin-top: 60px; padding: 10px 1.5rem; }
    .mobile-filter-btn { 
        width: 100%; 
        justify-content: center; 
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15);
    }
    
    main { padding-bottom: 80px; } /* Espace pour la bottom nav */
    
    .carousel-container { gap: 15px; }
    .movie-card { flex: 0 0 150px; }
}

@media (max-width: 480px) {
    .hero h1 { font-size: 28px; }
    .hero-buttons { flex-direction: column; }
    .movie-card { flex: 0 0 130px; }
}
"""

with open(path, 'a', encoding='utf-8') as f:
    f.write(bottom_nav_css)
