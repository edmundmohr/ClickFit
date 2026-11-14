/**
 * Einstieg des Workers. OpenNext erzeugt `.open-next/worker.js` für die Web-App; dieser
 * Einstieg reicht Anfragen dorthin weiter und verarbeitet zusätzlich die Queue für die
 * Pausen-Benachrichtigung. Gebündelt wird die Datei von Wrangler nach dem OpenNext-Build;
 * die Typen des erzeugten Workers beschreibt `open-next-worker.d.ts`.
 */
import handler, { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
import { handleRestTimerBatch } from "./src/server/rest-timer-consumer";

export { BucketCachePurge, DOQueueHandler, DOShardedTagCache };

const worker = {
  fetch: handler.fetch,
  queue: handleRestTimerBatch,
};

export default worker;
