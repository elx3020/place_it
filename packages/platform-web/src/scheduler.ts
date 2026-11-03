import type { Scheduler } from "@place-it/core";

export const createScheduler = (): Scheduler => ({
  request: (cb) => requestAnimationFrame(cb),
  cancel: (h) => cancelAnimationFrame(h),
  isHidden: () => document.hidden,
});
