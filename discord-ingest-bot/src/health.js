/**
 * Health tracking + HTTP healthcheck server.
 *
 * Anti-zombie:
 * - markEvent() is called on every Discord gateway event
 * - watchdog interval kills the process if gateway is unresponsive (systemd restarts)
 * - HTTP /healthz returns 200 only if gateway is READY and event is fresh
 *
 * Wired by index.js. Memory-only — no persistence needed.
 */
import http from 'http';

const WS_READY = 0;
const STALE_EVENT_MS = parseInt(process.env.HEALTH_STALE_MS || '600000', 10);
const WATCHDOG_INTERVAL_MS = parseInt(process.env.HEALTH_WATCHDOG_INTERVAL_MS || '60000', 10);
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || '8787', 10);
const startTime = Date.now();

let lastEventAt = Date.now();
let lastEventKind = 'init';
let clientRef = null;
let watchdogTimer = null;
let httpServer = null;

export function markEvent(kind = 'unknown') {
  lastEventAt = Date.now();
  lastEventKind = kind;
}

export function attachClient(client) {
  clientRef = client;
}

export function getHealth() {
  const now = Date.now();
  const wsStatus = clientRef?.ws?.status ?? -1;
  const ping = clientRef?.ws?.ping ?? -1;
  const ageMs = now - lastEventAt;
  const isReady = wsStatus === WS_READY;
  const isFresh = ageMs < STALE_EVENT_MS;
  const healthy = isReady && isFresh;

  return {
    healthy,
    ws_status: wsStatus,
    ws_ping_ms: ping,
    last_event_kind: lastEventKind,
    last_event_age_ms: ageMs,
    uptime_ms: now - startTime,
    rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    heap_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  };
}

export function startHealthServer(port = HEALTH_PORT) {
  if (httpServer) return httpServer;

  httpServer = http.createServer((req, res) => {
    if (req.url === '/healthz' || req.url === '/health') {
      const h = getHealth();
      res.writeHead(h.healthy ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(h));
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });

  httpServer.listen(port, '127.0.0.1', () => {
    console.log(`[health] listening on http://127.0.0.1:${port}/healthz`);
  });

  httpServer.on('error', (err) => {
    console.error('[health] server error:', err.message);
  });

  return httpServer;
}

export function startWatchdog({ onZombie } = {}) {
  if (watchdogTimer) return;

  watchdogTimer = setInterval(() => {
    const h = getHealth();

    // Always log a heartbeat so we can correlate via journalctl
    console.log(`[health] heartbeat ws=${h.ws_status} ping=${h.ws_ping_ms}ms age=${Math.round(h.last_event_age_ms / 1000)}s rss=${h.rss_mb}MB`);

    if (!h.healthy) {
      console.error(`[health] UNHEALTHY ws=${h.ws_status} age=${h.last_event_age_ms}ms — triggering recovery`);
      if (onZombie) onZombie(h);
    }
  }, WATCHDOG_INTERVAL_MS);

  watchdogTimer.unref?.();
}

export function stopHealth() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
}
