import { runProcess, ProcessOp, ProcessParams } from "./processor";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent) => {
  const { id, op, width, height, data, params } = e.data as {
    id: number;
    op: ProcessOp;
    width: number;
    height: number;
    data: Uint8ClampedArray;
    params: ProcessParams;
  };
  try {
    const output = runProcess(op, width, height, data, params);
    ctx.postMessage({ id, width, height, data: output.buffer }, [output.buffer]);
  } catch (err) {
    ctx.postMessage({ id, error: String(err) });
  }
};

export type {};