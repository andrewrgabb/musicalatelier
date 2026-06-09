/**
 * The BullMQ producer side of the queue.
 *
 * The API is the PRODUCER: it adds jobs here and returns immediately. The
 * Python worker is the CONSUMER (apps/worker). They never call each other —
 * they cooperate only through this queue, using the shared job contract.
 */
import { Queue } from "bullmq";
import { TRANSCRIPTION_QUEUE } from "@musical-atelier/contracts";
import { redis } from "./redis.js";

// Reuse the shared ioredis connection (configured with the settings BullMQ
// needs). The queue name comes from the contract so producer and consumer
// agree.
export const transcriptionQueue = new Queue(TRANSCRIPTION_QUEUE, {
  connection: redis,
});
