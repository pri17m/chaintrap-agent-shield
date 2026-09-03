export interface AnalyzeJob {
  job_id: string;
  status: string;
  message?: string;
}

export interface JobStatus {
  job_id: string;
  extension_id: string;
  status: string;
  progress_percent?: number;
  progress_message?: string;
  error_message?: string | null;
  report_url?: string | null;
  risk_score?: number | null;
  risk_level?: string | null;
}

export class ChaintrapClient {
  constructor(
    private readonly apiBase: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.apiKey) {
      h["X-API-Key"] = this.apiKey;
    }
    return h;
  }

  async analyzeExtension(extensionId: string, browser: "vscode" | "openvsx" = "vscode"): Promise<AnalyzeJob> {
    const url = `${this.apiBase.replace(/\/$/, "")}/api/v1/analyze`;
    const resp = await this.fetchImpl(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        extension_id: extensionId,
        browser,
        fast_mode: true,
      }),
    });
    if (!resp.ok) {
      throw new Error(`Chaintrap analyze failed: ${resp.status}`);
    }
    return (await resp.json()) as AnalyzeJob;
  }

  async getJob(jobId: string): Promise<JobStatus> {
    const url = `${this.apiBase.replace(/\/$/, "")}/api/v1/jobs/${encodeURIComponent(jobId)}`;
    const resp = await this.fetchImpl(url, { headers: this.headers() });
    if (!resp.ok) {
      throw new Error(`Chaintrap job poll failed: ${resp.status}`);
    }
    return (await resp.json()) as JobStatus;
  }

  async pollJob(jobId: string, { timeoutMs = 120_000, intervalMs = 2500 } = {}): Promise<JobStatus> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const job = await this.getJob(jobId);
      if (["completed", "failed", "cancelled", "error"].includes((job.status || "").toLowerCase())) {
        return job;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`Chaintrap job ${jobId} timed out`);
  }
}
