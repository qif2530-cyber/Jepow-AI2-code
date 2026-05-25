/** Desktop local assets / projects namespace per logged-in user */
export function getLocalUserId(): string {
  try {
    const raw = localStorage.getItem('ais-user');
    if (!raw) return 'default';
    return String(JSON.parse(raw).id || 'default');
  } catch {
    return 'default';
  }
}
