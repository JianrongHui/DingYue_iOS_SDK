import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";
import { listVariantsByPlacements } from "../api/variants";
import { getErrorMessage, shouldUseFallback } from "../api/client";
import type { Placement, Variant } from "../api/types";
import { seedVariants } from "../data/admin_seed";

type UseVariantsResult = {
  variants: Variant[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setVariants: Dispatch<SetStateAction<Variant[]>>;
};

export const useVariants = (placements: Placement[] = []): UseVariantsResult => {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listVariantsByPlacements(placements);
      setVariants(data);
    } catch (loadError) {
      if (shouldUseFallback(loadError)) {
        setVariants(seedVariants);
        setError("API unavailable. Showing mock variants.");
      } else {
        setError(getErrorMessage(loadError));
      }
    } finally {
      setLoading(false);
    }
  }, [placements]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { variants, loading, error, refresh, setVariants };
};
