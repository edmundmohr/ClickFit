import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Alle Seiten werden pro Request gerendert (App nur mit Anmeldung), daher kein Incremental Cache.
export default defineCloudflareConfig({});
