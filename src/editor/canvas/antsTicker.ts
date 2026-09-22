/**
 * Idempotent animation loop driver for the marching-ants selection overlay.
 *
 * Responsibilities (no hidden browser APIs inside — the browser rAF/cAF is
 * injected so drivers are unit-testable in node):
 *
 * - `start()` requests ONE frame. Calling it repeatedly while already running
 *   is a no-op, so multiple requestAnimationFrame chains can never overlap.
 * - Each tick re-checks `shouldRun`: when the selection disappears / is hidden
 *   the loop self-terminates (no further frame is requested).
 * - `stop()` cancels any pending frame immediately (engine teardown, editor
 *   unmount) so nothing leaks after destroy.
 * - Running again after a stop/self-stop just calls `start()`; state is fully
 *   restartable.
 */
export interface AntsTicker {
  readonly running: boolean;
  start(): void;
  stop(): void;
}

export interface AntsTickerOptions {
  requestFrame: (cb: (now: number) => void) => number;
  cancelFrame: (id: number) => void;
  shouldRun: () => boolean;
  onFrame: (now: number) => void;
}

export function createAntsTicker(opts: AntsTickerOptions): AntsTicker {
  let raf = 0;
  const tick = (now: number) => {
    raf = 0;
    if (!opts.shouldRun()) return;
    opts.onFrame(now);
    raf = opts.requestFrame(tick);
  };
  return {
    get running() {
      return raf !== 0;
    },
    start() {
      if (raf !== 0) return;
      if (!opts.shouldRun()) return;
      raf = opts.requestFrame(tick);
    },
    stop() {
      if (raf !== 0) {
        opts.cancelFrame(raf);
        raf = 0;
      }
    },
  };
}