import type { Finding } from "../types";
import type { AckPanelResult } from "./ackWebview";

export async function acknowledgeFindingWithPanel(opts: {
  finding: Finding;
  prompt: (finding: Finding) => Promise<AckPanelResult>;
  acknowledge: (findingId: string) => Promise<void>;
}): Promise<boolean> {
  const result = await opts.prompt(opts.finding);
  if (result !== "ack") {
    return false;
  }
  await opts.acknowledge(opts.finding.id);
  return true;
}

