export interface Profile { id: string; name: string; color: string }
const defaults: Profile[] = [{ id: 'default', name: 'Mon profil', color: '#177bb4' }];
export const profileColors = ['#177bb4', '#c4383d', '#d79c29', '#319779', '#8255a5'];
export function getProfiles(): Profile[] {
    try {
        const value = JSON.parse(localStorage.getItem('movieverse_profiles') || 'null');
        if (Array.isArray(value) && value.length && value.length <= 5 && value.every(p => typeof p.id === 'string' && typeof p.name === 'string' && profileColors.includes(p.color))) return value;
    } catch { /* A damaged preference must not prevent browsing. */ }
    return defaults.map(p => ({ ...p }));
}
export function getActiveProfile(): Profile {
    return getProfiles().find(p => p.id === localStorage.getItem('movieverse_active_profile')) || getProfiles()[0]!;
}
export function saveProfiles(profiles: Profile[]) {
    localStorage.setItem('movieverse_profiles', JSON.stringify(profiles));
}
export function profileStorageKey(key: string): string {
    const id = getActiveProfile().id;
    // Preserve the existing library and history for the original profile.
    return id === 'default' ? key : `${key}_${id}`;
}
