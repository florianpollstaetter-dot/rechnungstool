import { useEffect, useCallback, useRef } from "react";

export function useAutosave<T>(key: string, data: T, setData: (data: T) => void) {
  const isInitialized = useRef(false);

  // Restore on mount
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;
    try {
      const saved = localStorage.getItem(`autosave_${key}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          setData(parsed);
        }
      }
    } catch { /* ignore */ }
  }, [key, setData]);

  // Save on change (debounced)
  useEffect(() => {
    if (!isInitialized.current) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(`autosave_${key}`, JSON.stringify(data));
      } catch { /* ignore */ }
    }, 500);
    return () => clearTimeout(timer);
  }, [key, data]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(`autosave_${key}`);
  }, [key]);

  return { clearDraft };
}
