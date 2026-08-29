/** Poll interval (ms) for a running batch — `useEvalBatch`'s `refetchInterval`
 *  while `status === 'running'`. Lives here per the plan, not inside the hook. */
export const POLL_INTERVAL_MS = 2000;
