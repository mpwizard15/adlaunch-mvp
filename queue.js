// Minimal in-process job queue with retry/backoff. In production use BullMQ/Redis
// or a managed queue (architecture doc §1) — the worker contract stays the same.

const { runLaunchJob } = require("./launchWorker");

const pending = [];
let working = false;

function enqueue(jobId) {
  pending.push(jobId);
  pump();
}

async function pump() {
  if (working) return;
  working = true;
  while (pending.length) {
    const jobId = pending.shift();
    try {
      await runLaunchJob(jobId);
    } catch (err) {
      // runLaunchJob marks state=retry while attempts remain; requeue with small backoff.
      const job = require("./store").db.jobs.get(jobId);
      if (job && job.state === "retry") {
        setTimeout(() => enqueue(jobId), 500);
      }
    }
  }
  working = false;
}

module.exports = { enqueue };
