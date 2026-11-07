const express = require('express');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

const ES_URL = process.env.ELASTIC_URL || 'http://elasticsearch:9200';
const ES_AUTH = 'Basic ' + Buffer.from(`${process.env.ELASTIC_USER}:${process.env.ELASTIC_PASSWORD}`).toString('base64');

async function esSearch(index, body) {
  const resp = await fetch(`${ES_URL}/${index}/_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: ES_AUTH },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Elasticsearch ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

// Aggregated event counts by type over the last 24h, for the admin dashboard widget.
// The full drill-down lives in Kibana at /kibana/.
router.get('/events-summary', async (req, res) => {
  try {
    const result = await esSearch('events*', {
      size: 10,
      sort: [{ '@timestamp': 'desc' }],
      query: { range: { '@timestamp': { gte: 'now-24h' } } },
      aggs: {
        by_type: { terms: { field: 'type.keyword', size: 20 } },
      },
    });

    res.json({
      totalLast24h: result.hits.total.value,
      byType: (result.aggregations?.by_type.buckets || []).map((b) => ({ type: b.key, count: b.doc_count })),
      recent: result.hits.hits.map((h) => h._source),
    });
  } catch (err) {
    console.error('Elasticsearch query failed', err.message);
    res.status(502).json({ error: 'Stats backend (Elasticsearch) is unavailable', totalLast24h: 0, byType: [], recent: [] });
  }
});

module.exports = router;
