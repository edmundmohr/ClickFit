/**
 * Typen für den von OpenNext erzeugten Worker. Die Datei `.open-next/worker.js` entsteht erst
 * beim Build; mit dieser Beschreibung lässt sich `worker.ts` auch davor prüfen.
 */
declare module "*/.open-next/worker.js" {
  const handler: {
    fetch: (request: Request, env: CloudflareEnv, ctx: ExecutionContext) => Promise<Response>;
  };
  export default handler;
  /** Durable Objects von OpenNext; hier ungenutzt, müssen aber exportiert bleiben. */
  export const BucketCachePurge: unknown;
  export const DOQueueHandler: unknown;
  export const DOShardedTagCache: unknown;
}
