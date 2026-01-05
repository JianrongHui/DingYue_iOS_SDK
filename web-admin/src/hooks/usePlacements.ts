import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";
import { listPlacementsByApps } from "../api/placements";
import { getErrorMessage, shouldUseFallback } from "../api/client";
import type { Placement } from "../api/types";
import { seedPlacements } from "../data/admin_seed";

type UsePlacementsResult = {
  placements: Placement[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setPlacements: Dispatch<SetStateAction<Placement[]>>;
};

export const usePlacements = (appIds: string[] = []): UsePlacementsResult => {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPlacementsByApps(appIds);
      setPlacements(data);
    } catch (loadError) {
      if (shouldUseFallback(loadError)) {
        setPlacements(seedPlacements);
        setError("API unavailable. Showing mock placements.");
      } else {
        setError(getErrorMessage(loadError));
      }
    } finally {
      setLoading(false);
    }
  }, [appIds]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { placements, loading, error, refresh, setPlacements };
};
