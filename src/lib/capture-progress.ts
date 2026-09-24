export type CaptureProgress = {
  percent: number | null;
  stage: string;
};

const PROGRESS_PATTERN = /^PROGRESS:(\d{1,3}):(.*)$/;

export function getCaptureProgress(
  status: string,
  log: string[] | null | undefined,
): CaptureProgress {
  if (status === "queued") return { percent: 0, stage: "Waiting for Mac mini" };
  if (status === "done") return { percent: 100, stage: "Capture complete" };
  if (status === "failed") return { percent: null, stage: "Capture stopped" };

  for (const line of [...(log ?? [])].reverse()) {
    const match = line.match(PROGRESS_PATTERN);
    if (match) {
      return {
        percent: Math.max(0, Math.min(100, Number(match[1]))),
        stage: match[2]?.trim() || "Processing capture",
      };
    }
  }

  return { percent: null, stage: "Processing · awaiting progress update" };
}

export function visibleWorkerLogs(log: string[] | null | undefined) {
  return (log ?? []).filter((line) => !PROGRESS_PATTERN.test(line));
}