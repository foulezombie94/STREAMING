export function escapeHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}
export function imageUrl(path: string | undefined, size = 'w780'): string {
    if (!path) return '';
    if (path.startsWith('https://')) return path;
    return `https://image.tmdb.org/t/p/${size}${path}`;
}
export function icon(name: string): string {
    const paths: Record<string, string> = {
        play: '<path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none"/>',
        plus: '<path d="M12 4v16M4 12h16"/>',
        check: '<path d="m5 12 4 4L20 5"/>',
        close: '<path d="m6 6 12 12M6 18 18 6"/>',
        down: '<path d="m5 9 7 7 7-7"/>',
        like: '<path d="M7 10v11H3V10zm0 0 5-8c3 0 2 5 1 7h5c2 0 3 1 2 4l-2 7H7"/>',
        search: '<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
        user: '<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
        bell: '<path d="M5 10a7 7 0 0 1 14 0v7l2 2H3l2-2zM10 22h4"/>',
        edit: '<path d="m15 3 6 6-12 12H3v-6zm-2 2 6 6"/>',
        back: '<path d="m12 4-8 8 8 8M4 12h17"/>',
        volume: '<path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    };
    return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.down}</svg>`;
}
export function prepareDialog(dialog: HTMLDialogElement) {
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.classList.add('dialog-open');
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => {
        dialog.remove();
        if (!document.querySelector('dialog[open]')) document.body.classList.remove('dialog-open');
        previousFocus?.focus();
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
}
