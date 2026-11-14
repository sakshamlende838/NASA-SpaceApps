/**
 * Ignis Track — Production HTTP Server & API Gateway
 * NASA Space Apps Challenge 2026
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const engine = require('./data/engine');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=utf-8'
};

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
    'Cache-Control': 'no-cache'
  });
  res.end(payload);
}

function sendError(res, statusCode, code, message) {
  sendJson(res, statusCode, {
    error: {
      code,
      message
    }
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept'
    });
    return res.end();
  }

  // API Routes
  if (pathname.startsWith('/api/v1/')) {
    const route = pathname.replace('/api/v1', '');

    if (route === '/health') {
      return sendJson(res, 200, {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        environment: 'spaceapps-2026',
        database: 'harmonized-memory-store'
      });
    }

    if (route === '/meta/sources') {
      return sendJson(res, 200, {
        sources: config.sources,
        grid: config.grid,
        anomaly_config: config.anomaly
      });
    }

    if (route === '/meta/methodology') {
      return sendJson(res, 200, engine.getMethodologyReport());
    }

    if (route === '/aoi/presets') {
      return sendJson(res, 200, engine.getPresets());
    }

    if (route === '/aoi/validate' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const bbox = payload.bbox;
          if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) {
            return sendError(res, 400, 'INVALID_BBOX', 'Bounding box must be an array of [minLon, minLat, maxLon, maxLat].');
          }
          const [w, s, e, n] = bbox;
          if (w >= e || s >= n) {
            return sendError(res, 400, 'COORDINATE_ORDER', 'Coordinates must satisfy minLon < maxLon and minLat < maxLat.');
          }
          const latMid = (s + n) / 2;
          const latDist = (n - s) * 111.0;
          const lonDist = (e - w) * 111.0 * Math.cos((latMid * Math.PI) / 180);
          const areaKm2 = Math.round(latDist * lonDist);

          if (areaKm2 > config.limits.max_aoi_km2) {
            return sendError(res, 400, 'AOI_TOO_LARGE', `Area (${areaKm2.toLocaleString()} km²) exceeds limit.`);
          }

          return sendJson(res, 200, {
            valid: true,
            area_km2: areaKm2,
            bbox,
            center: [Number(((s + n) / 2).toFixed(4)), Number(((w + e) / 2).toFixed(4))]
          });
        } catch (e) {
          return sendError(res, 400, 'INVALID_JSON', 'Request payload could not be parsed.');
        }
      });
      return;
    }

    if (route === '/calendar') {
      const records = engine.getCalendar({
        aoi: query.aoi,
        start: query.start,
        end: query.end,
        sources: query.sources,
        minConf: query.min_conf,
        metric: query.metric
      });
      return sendJson(res, 200, records);
    }

    if (route === '/timeseries') {
      const series = engine.getTimeSeries({
        aoi: query.aoi,
        start: query.start,
        end: query.end,
        granularity: query.granularity || 'month'
      });
      return sendJson(res, 200, series);
    }

    if (route === '/summary') {
      const summary = engine.getSummary({
        aoi: query.aoi,
        start: query.start,
        end: query.end
      });
      return sendJson(res, 200, summary);
    }

    if (route === '/anomalies') {
      const anomalies = engine.getAnomalies({
        aoi: query.aoi,
        start: query.start,
        end: query.end
      });
      return sendJson(res, 200, anomalies);
    }

    if (route === '/hotspots') {
      const geojson = engine.getHotspots({
        aoi: query.aoi,
        start: query.start,
        end: query.end,
        date: query.date,
        minConf: query.min_conf,
        sources: query.sources
      });
      return sendJson(res, 200, geojson);
    }

    if (route === '/export.csv') {
      const csv = engine.exportCsv({
        aoi: query.aoi,
        start: query.start,
        end: query.end
      });
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ignis_track_${query.aoi || 'data'}_harmonized.csv"`,
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(csv);
    }

    return sendError(res, 404, 'NOT_FOUND', `Route ${pathname} not found.`);
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendError(res, 403, 'FORBIDDEN', 'Access denied.');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        return sendError(res, 500, 'FILE_READ_ERROR', 'Could not read asset.');
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': content.length,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400'
      });
      res.end(content);
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Server] Ignis Track server active on http://127.0.0.1:${PORT}`);
});
