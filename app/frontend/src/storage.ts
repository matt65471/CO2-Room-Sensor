// localStorage helpers that never throw (storage can be blocked, e.g. in private mode)

export function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked; the choice just won't be remembered
  }
}
