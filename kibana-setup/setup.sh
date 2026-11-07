#!/usr/bin/env bash
# One-shot job: sets the kibana_system password in Elasticsearch, then
# provisions an "events*" index pattern and a ready-made stats dashboard
# in Kibana so /kibana/ shows something useful the moment the stack is up.
set -euo pipefail

ES_AUTH="elastic:${ELASTIC_PASSWORD}"
KB="${KIBANA_URL}/kibana"

echo "Waiting for Elasticsearch..."
until curl -sf -u "$ES_AUTH" "${ELASTIC_URL}/_cluster/health" >/dev/null; do
  sleep 3
done
echo "Elasticsearch is up."

echo "Setting kibana_system password..."
curl -sf -u "$ES_AUTH" -X POST "${ELASTIC_URL}/_security/user/kibana_system/_password" \
  -H 'Content-Type: application/json' \
  -d "{\"password\":\"${KIBANA_SYSTEM_PASSWORD}\"}" >/dev/null || true

echo "Waiting for Kibana..."
until curl -sf -u "$ES_AUTH" "${KB}/api/status" >/dev/null; do
  sleep 5
done
echo "Kibana is up."

KBN_HEADERS=(-u "$ES_AUTH" -H "kbn-xsrf: true" -H "Content-Type: application/json")

create_object() {
  local type="$1" id="$2" file="$3"
  echo "Creating ${type}/${id}..."
  curl -sf "${KBN_HEADERS[@]}" -X POST "${KB}/api/saved_objects/${type}/${id}?overwrite=true" \
    -d @"$file" >/dev/null
}

# ---- Index pattern: events* ----
cat > /tmp/index-pattern.json <<'EOF'
{
  "attributes": {
    "title": "events*",
    "timeFieldName": "@timestamp"
  }
}
EOF
create_object "index-pattern" "events-star" /tmp/index-pattern.json

# ---- Visualization: Events Over Time (histogram) ----
cat > /tmp/viz-events-over-time.json <<'EOF'
{
  "attributes": {
    "title": "Events Over Time",
    "visState": "{\"title\":\"Events Over Time\",\"type\":\"histogram\",\"params\":{\"grid\":{\"categoryLines\":false},\"categoryAxes\":[{\"id\":\"CategoryAxis-1\",\"type\":\"category\",\"position\":\"bottom\",\"show\":true,\"style\":{},\"scale\":{\"type\":\"linear\"},\"labels\":{\"show\":true,\"filter\":true,\"truncate\":100},\"title\":{}}],\"valueAxes\":[{\"id\":\"ValueAxis-1\",\"name\":\"LeftAxis-1\",\"type\":\"value\",\"position\":\"left\",\"show\":true,\"style\":{},\"scale\":{\"type\":\"linear\",\"mode\":\"normal\"},\"labels\":{\"show\":true,\"rotate\":0,\"filter\":false,\"truncate\":100},\"title\":{\"text\":\"Count\"}}],\"seriesParams\":[{\"show\":true,\"type\":\"histogram\",\"mode\":\"stacked\",\"data\":{\"label\":\"Count\",\"id\":\"1\"},\"valueAxis\":\"ValueAxis-1\",\"drawLinesBetweenPoints\":true,\"showCirclesOnLines\":true,\"interpolate\":\"linear\",\"lineWidth\":2,\"showCircles\":true}],\"addTooltip\":true,\"addLegend\":true,\"legendPosition\":\"right\",\"times\":[],\"addTimeMarker\":false},\"aggs\":[{\"id\":\"1\",\"enabled\":true,\"type\":\"count\",\"schema\":\"metric\",\"params\":{}},{\"id\":\"2\",\"enabled\":true,\"type\":\"date_histogram\",\"schema\":\"segment\",\"params\":{\"field\":\"@timestamp\",\"interval\":\"auto\",\"min_doc_count\":1}}]}",
    "uiStateJSON": "{}",
    "description": "",
    "kibanaSavedObjectMeta": {
      "searchSourceJSON": "{\"query\":{\"query\":\"\",\"language\":\"kuery\"},\"filter\":[],\"indexRefName\":\"kibanaSavedObjectMeta.searchSourceJSON.index\"}"
    }
  },
  "references": [
    { "name": "kibanaSavedObjectMeta.searchSourceJSON.index", "type": "index-pattern", "id": "events-star" }
  ]
}
EOF
create_object "visualization" "viz-events-over-time" /tmp/viz-events-over-time.json

# ---- Visualization: Events by Type (pie) ----
cat > /tmp/viz-events-by-type.json <<'EOF'
{
  "attributes": {
    "title": "Events by Type",
    "visState": "{\"title\":\"Events by Type\",\"type\":\"pie\",\"params\":{\"type\":\"pie\",\"addTooltip\":true,\"addLegend\":true,\"legendPosition\":\"right\",\"isDonut\":true,\"labels\":{\"show\":false,\"values\":true,\"last_level\":true,\"truncate\":100}},\"aggs\":[{\"id\":\"1\",\"enabled\":true,\"type\":\"count\",\"schema\":\"metric\",\"params\":{}},{\"id\":\"2\",\"enabled\":true,\"type\":\"terms\",\"schema\":\"segment\",\"params\":{\"field\":\"type.keyword\",\"size\":10,\"order\":\"desc\",\"orderBy\":\"1\"}}]}",
    "uiStateJSON": "{}",
    "description": "",
    "kibanaSavedObjectMeta": {
      "searchSourceJSON": "{\"query\":{\"query\":\"\",\"language\":\"kuery\"},\"filter\":[],\"indexRefName\":\"kibanaSavedObjectMeta.searchSourceJSON.index\"}"
    }
  },
  "references": [
    { "name": "kibanaSavedObjectMeta.searchSourceJSON.index", "type": "index-pattern", "id": "events-star" }
  ]
}
EOF
create_object "visualization" "viz-events-by-type" /tmp/viz-events-by-type.json

# ---- Visualization: Total Events (metric) ----
cat > /tmp/viz-total-events.json <<'EOF'
{
  "attributes": {
    "title": "Total Events",
    "visState": "{\"title\":\"Total Events\",\"type\":\"metric\",\"params\":{\"metric\":{\"percentageMode\":false,\"useRanges\":false,\"colorSchema\":\"Green to Red\",\"metricColorMode\":\"None\",\"colorsRange\":[{\"from\":0,\"to\":10000}],\"labels\":{\"show\":true},\"invertColors\":false,\"style\":{\"bgFill\":\"#000\",\"bgColor\":false,\"labelColor\":false,\"subText\":\"\",\"fontSize\":60}}},\"aggs\":[{\"id\":\"1\",\"enabled\":true,\"type\":\"count\",\"schema\":\"metric\",\"params\":{}}]}",
    "uiStateJSON": "{}",
    "description": "",
    "kibanaSavedObjectMeta": {
      "searchSourceJSON": "{\"query\":{\"query\":\"\",\"language\":\"kuery\"},\"filter\":[],\"indexRefName\":\"kibanaSavedObjectMeta.searchSourceJSON.index\"}"
    }
  },
  "references": [
    { "name": "kibanaSavedObjectMeta.searchSourceJSON.index", "type": "index-pattern", "id": "events-star" }
  ]
}
EOF
create_object "visualization" "viz-total-events" /tmp/viz-total-events.json

# ---- Dashboard combining all three ----
cat > /tmp/dashboard.json <<'EOF'
{
  "attributes": {
    "title": "Marketplace Stats",
    "hits": 0,
    "description": "Live event stream from Kafka: registrations, product views, orders and bids.",
    "panelsJSON": "[{\"version\":\"8.15.0\",\"type\":\"visualization\",\"gridData\":{\"x\":0,\"y\":0,\"w\":12,\"h\":10,\"i\":\"1\"},\"panelIndex\":\"1\",\"embeddableConfig\":{},\"panelRefName\":\"panel_1\"},{\"version\":\"8.15.0\",\"type\":\"visualization\",\"gridData\":{\"x\":12,\"y\":0,\"w\":24,\"h\":18,\"i\":\"2\"},\"panelIndex\":\"2\",\"embeddableConfig\":{},\"panelRefName\":\"panel_2\"},{\"version\":\"8.15.0\",\"type\":\"visualization\",\"gridData\":{\"x\":36,\"y\":0,\"w\":12,\"h\":18,\"i\":\"3\"},\"panelIndex\":\"3\",\"embeddableConfig\":{},\"panelRefName\":\"panel_3\"}]",
    "optionsJSON": "{\"useMargins\":true,\"hidePanelTitles\":false}",
    "timeRestore": true,
    "timeTo": "now",
    "timeFrom": "now-24h",
    "kibanaSavedObjectMeta": {
      "searchSourceJSON": "{\"query\":{\"query\":\"\",\"language\":\"kuery\"},\"filter\":[]}"
    }
  },
  "references": [
    { "name": "panel_1", "type": "visualization", "id": "viz-total-events" },
    { "name": "panel_2", "type": "visualization", "id": "viz-events-over-time" },
    { "name": "panel_3", "type": "visualization", "id": "viz-events-by-type" }
  ]
}
EOF
create_object "dashboard" "marketplace-stats" /tmp/dashboard.json

echo "Kibana provisioning complete. Dashboard available at /kibana/app/dashboards#/view/marketplace-stats"
