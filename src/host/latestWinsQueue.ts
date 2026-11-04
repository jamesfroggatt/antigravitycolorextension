// Runs one async job at a time. While a job is running, only the most recent request is kept,
// so fast slider drags never pile up writes to settings.json.

export class LatestWinsQueue<T> {
  private pending: { value: T } | undefined;
  private running = false;
  private idleWaiters: Array<() => void> = [];

  constructor(
    private readonly worker: (value: T) => Promise<void>,
    private readonly onError: (err: unknown) => void = () => undefined,
  ) {}

  /** True while a job is running or waiting. */
  get busy(): boolean {
    return this.running || this.pending !== undefined;
  }

  push(value: T): void {
    this.pending = { value };
    if (!this.running) void this.drain();
  }

  /** Resolves once every queued job has finished. */
  whenIdle(): Promise<void> {
    if (!this.busy) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private async drain(): Promise<void> {
    this.running = true;
    try {
      while (this.pending) {
        const { value } = this.pending;
        this.pending = undefined;
        try {
          await this.worker(value);
        } catch (err) {
          this.onError(err);
        }
      }
    } finally {
      this.running = false;
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      waiters.forEach((resolve) => resolve());
    }
  }
}
