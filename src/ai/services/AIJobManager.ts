import { AIError } from "../core/AIError";
import type { AIJob, AIJobStatus, AIRequest, AIResult } from "../types";

export interface AIJobTask {
  request: AIRequest;
  label: string;
  execute: (signal: AbortSignal, onProgress: (percent: number) => void) => Promise<AIResult>;
}

const JOB_ORDER: AIJobStatus[] = ["queued", "running", "completed", "failed", "cancelled"];

interface Deferred<T> {
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}

/**
 * Async AI job queue. Slow provider calls are serialized here so the main UI
 * never blocks. Jobs support cancellation and status transitions are mirrored
 * into the editor store through the onState callback.
 */
export class AIJobManager {
  private jobs: AIJob[] = [];
  private queue: string[] = [];
  private tasks = new Map<string, AIJobTask>();
  private deferred = new Map<string, Deferred<AIResult>>();
  private controllers = new Map<string, AbortController>();
  private active = 0;
  private maxConcurrent: number;
  private onState: (jobs: AIJob[]) => void;
  private autoTrim: number;

  constructor(onState: (jobs: AIJob[]) => void, opts: { maxConcurrent?: number; autoTrim?: number } = {}) {
    this.maxConcurrent = opts.maxConcurrent ?? 1;
    this.onState = onState;
    this.autoTrim = opts.autoTrim ?? 30;
  }

  private commit(): void {
    this.onState(this.list());
  }

  private touch(id: string, patch: Partial<AIJob>): void {
    const job = this.jobs.find((j) => j.id === id);
    if (!job) return;
    Object.assign(job, patch);
    this.jobs.sort((a, b) => {
      const i = JOB_ORDER.indexOf(a.status) - JOB_ORDER.indexOf(b.status);
      if (i !== 0) return i;
      return a.createdAt - b.createdAt;
    });
    this.commit();
  }

  enqueue(task: AIJobTask): Promise<AIResult> {
    const job: AIJob = {
      id: task.request.id,
      operation: task.request.operation,
      provider: task.request.provider,
      model: task.request.model,
      status: "queued",
      progress: 0,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      error: null,
      label: task.label,
      result: null,
      cancelled: false,
    };
    this.jobs.push(job);
    this.tasks.set(task.request.id, task);
    this.queue.push(task.request.id);

    const run = this.awaitResult(job.id);
    this.commit();
    this.pump();
    return run;
  }

  private awaitResult(id: string): Promise<AIResult> {
    return new Promise<AIResult>((resolve, reject) => {
      this.deferred.set(id, { resolve, reject });
    });
  }

  private settle(id: string, result?: AIResult, error?: unknown): void {
    const d = this.deferred.get(id);
    if (!d) return;
    this.deferred.delete(id);
    const job = this.jobs.find((j) => j.id === id);
    if (result) d.resolve(result);
    else d.reject(error instanceof AIError ? error : new AIError("unknown", AIError.userSafe(error), job?.operation));
  }

  private pump(): void {
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const id = this.queue.shift();
      if (!id) break;
      const job = this.jobs.find((j) => j.id === id);
      const task = this.tasks.get(id);
      if (!job || !task) continue;
      this.runJob(job, task);
    }
  }

  private runJob(job: AIJob, task: AIJobTask): void {
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    this.active += 1;
    job.status = "running";
    job.startedAt = Date.now();
    this.touch(job.id, { status: "running", startedAt: job.startedAt, progress: 0 });

    const onProgress = (p: number): void => {
      if (job.cancelled || job.status !== "running") return;
      const clamped = Math.max(0, Math.min(100, Math.round(p)));
      if (Math.abs(clamped - job.progress) >= 1) {
        job.progress = clamped;
        this.commit();
      }
    };

    task.execute(controller.signal, onProgress)
      .then((result) => {
        this.active -= 1;
        const before = this.jobs.length;
        job.status = "completed";
        job.progress = 100;
        job.result = result;
        job.completedAt = Date.now();
        this.touch(job.id, { status: "completed", progress: 100, result, completedAt: job.completedAt });
        this.settle(job.id, result);
        this.cleanup(job.id, before);
        this.pump();
      })
      .catch((err) => {
        this.active -= 1;
        const cancelled = job.cancelled || AIError.isCancellation(err) || controller.signal.aborted;
        job.status = cancelled ? "cancelled" : "failed";
        job.error = AIError.userSafe(err);
        job.completedAt = Date.now();
        this.touch(job.id, { status: job.status, error: job.error, completedAt: job.completedAt });
        this.settle(job.id, undefined, err);
        this.cleanup(job.id, this.jobs.length);
        this.pump();
      });
  }

  private cleanup(id: string, expectedSize: number): void {
    if (this.jobs.length > this.autoTrim) {
      this.trim();
    } else if (expectedSize > this.jobs.length) {
      this.trim();
    }
    this.tasks.delete(id);
    this.controllers.delete(id);
  }

  cancel(id: string): boolean {
    const job = this.jobs.find((j) => j.id === id);
    if (!job) return false;
    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") return false;
    job.cancelled = true;
    this.controllers.get(id)?.abort();
    if (job.status === "queued") {
      const qi = this.queue.indexOf(id);
      if (qi >= 0) this.queue.splice(qi, 1);
      job.status = "cancelled";
      job.completedAt = Date.now();
      job.error = null;
      this.touch(job.id, { status: "cancelled", completedAt: job.completedAt, error: null });
      this.settle(id, undefined, new AIError("cancelled", undefined, job.operation));
      return true;
    }
    return true;
  }

  cancelAll(): void {
    for (const id of this.queue.slice()) this.cancel(id);
    for (const job of this.jobs.filter((j) => j.status === "running")) this.cancel(job.id);
  }

  list(): AIJob[] {
    return this.jobs.map((j) => ({ ...j, result: j.result }));
  }

  countActive(): number {
    return this.jobs.filter((j) => j.status === "queued" || j.status === "running").length;
  }

  private trim(): void {
    const activeJobs = this.jobs.filter((j) => j.status === "queued" || j.status === "running");
    const done = this.jobs.filter((j) => j.status !== "queued" && j.status !== "running").slice(-this.autoTrim);
    this.jobs = [...activeJobs, ...done];
    for (const id of Array.from(this.tasks.keys())) {
      if (!this.jobs.some((j) => j.id === id)) this.tasks.delete(id);
    }
  }
}