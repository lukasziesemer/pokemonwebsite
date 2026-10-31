export interface ComparisonRunContext {
  gameVersionKey: string | null;
  gameVersionName: string | null;
  levelCap: number | null;
  runId: number | null;
}

export const EMPTY_COMPARISON_RUN_CONTEXT: ComparisonRunContext = {
  gameVersionKey: null,
  gameVersionName: null,
  levelCap: null,
  runId: null,
};
