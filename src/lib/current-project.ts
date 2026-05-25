import { getLocalUserId } from './local-user-id';

export function getCurrentProjectId(): string | null {
  const userId = getLocalUserId();
  return localStorage.getItem(`ais-project-id-${userId}`);
}
