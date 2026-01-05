import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";
import { listApps } from "../api/apps";
import { getErrorMessage, shouldUseFallback } from "../api/client";
import type { App } from "../api/types";
import { seedApps } from "../data/admin_seed";

type UseAppsResult = {
  apps: App[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setApps: Dispatch<SetStateAction<App[]>>;
};

export const useApps = (): UseAppsResult => {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listApps();
      setApps(data);
    } catch (loadError) {
      if (shouldUseFallback(loadError)) {
        setApps(seedApps);
        setError("API unavailable. Showing mock apps.");
      } else {
        setError(getErrorMessage(loadError));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { apps, loading, error, refresh, setApps };
};
