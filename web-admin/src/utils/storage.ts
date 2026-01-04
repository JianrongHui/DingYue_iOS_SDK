export const getItems = <T>(key: string): T[] => {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("Invalid storage payload");
    }
    return parsed as T[];
  } catch (error) {
    throw new Error(`Failed to parse localStorage for ${key}`);
  }
};

export const setItems = <T>(key: string, items: T[]): void => {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(items));
};

export const generateId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
};
