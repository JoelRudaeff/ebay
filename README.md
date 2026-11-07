# ShopSphere — containerized marketplace stack

A self-contained, eBay-style marketplace: storefront, admin panel, Kafka-driven
event pipeline, and an Elasticsearch/Kibana stats dashboard — all Dockerized,
behind a hardened Nginx TLS edge, meant to run on a hardened Ubuntu Server box.

## Architecture

```
                                   ┌────────────┐
                        80/443 ──► │   nginx    │  (only container with published ports)
                                   └─────┬──────┘
              ┌───────────┬──────────────┼───────────────┬─────────────┐
              ▼           ▼              ▼                ▼             ▼
        ┌──────────┐ ┌────────┐   ┌────────────┐   ┌──────────┐  ┌───────────┐
        │ frontend │ │ admin  │   │  backend   │   │  kibana  │  │ kafka-ui  │
        │ (store)  │ │ panel  │   │  (API)     │   │(/kibana/)│  │(/kafka-ui)│
        └──────────┘ └────────┘   └─────┬──────┘   └────┬─────┘  └─────┬─────┘
                                         │                │              │
                     ┌───────────────────┼────────────────┼──────────────┘
                     ▼                   ▼                ▼
              ┌────────────┐      ┌────────────┐   ┌──────────────┐
              │ postgres   │      │   kafka    │──►│ elasticsearch│
              │ + redis    │      │ (KRaft)    │   └──────────────┘
              └────────────┘      └─────┬──────┘
                                         │
                          ┌──────────────┴───────────────┐
                          ▼                               ▼
                 analytics-consumer               notification-consumer
                 (writes events to ES)            (order/user notifications)
```

Every service except `nginx` sits on an **internal-only** Docker network —
Postgres, Redis, Kafka and Elasticsearch are not reachable from the host or
the internet at all, only from other containers.

### Services

| Service                | Purpose                                                             |
|-------------------------|----------------------------------------------------------------------|
| `nginx`                 | TLS termination, security headers, rate limiting, reverse proxy     |
| `frontend`               | Storefront UI (`/`) — browse, search, bid, buy                     |
| `admin`                  | Admin panel UI (`/admin/`) — users, products, orders, live stats   |
| `backend`                 | REST API (`/api/`) — auth, catalog, cart, orders, admin, stats     |
| `postgres`               | Primary datastore (users, products, orders)                        |
| `redis`                  | Cache / session-ready key-value store                               |
| `kafka`                  | Event bus (KRaft mode, no Zookeeper) — `user.events`, `product.events`, `order.events`, `bid.events` |
| `kafka-ui`               | Web UI for browsing Kafka topics (`/kafka-ui/`)                    |
| `analytics-consumer`     | Consumes all topics, indexes events into Elasticsearch daily indices |
| `notification-consumer`  | Consumes events, simulates email/SMS notifications (swap in a real provider) |
| `elasticsearch`          | Stores indexed events for search/analytics                          |
| `kibana`                 | Stats dashboard GUI (`/kibana/`)                                    |
| `kibana-setup`           | One-shot job: provisions the `events*` index pattern + a ready-made dashboard |

## Quick start (local / testing)

```bash
cp .env.example .env
# edit .env and set real passwords/secrets

./nginx/generate-certs.sh localhost   # self-signed cert for local testing

docker compose up -d --build
```

Then visit:
- Storefront: **https://localhost/** (browser will warn about the self-signed cert — that's expected locally)
- Admin panel: **https://localhost/admin/** — log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`
- Kibana dashboard: **https://localhost/kibana/app/dashboards#/view/marketplace-stats**
- Kafka topic browser: **https://localhost/kafka-ui/** — log in with `KAFKA_UI_USER` / `KAFKA_UI_PASSWORD`

A demo seller account is seeded: `seller@example.com` / `sellerpass123` (12 sample
listings are pre-loaded, including two live auctions).

Elasticsearch/Kibana take 30–90 seconds to become healthy on first boot; the
dashboard will populate as soon as you browse products or place orders (each
action publishes a Kafka event that `analytics-consumer` indexes).

## Deploying on a fresh Ubuntu Server

1. Copy this whole directory to the server.
2. Harden the host and install Docker:
   ```bash
   sudo ./setup-ubuntu-server.sh
   ```
   This configures UFW (only 22/80/443 open), fail2ban, key-only SSH,
   unattended security upgrades, sysctl network hardening, and installs
   Docker Engine + Compose. **Make sure your SSH key works before it
   disables password auth.**
3. `cp .env.example .env` and fill in strong, unique secrets.
4. Get a real TLS certificate for your domain (recommended) instead of the
   self-signed one:
   ```bash
   sudo apt-get install -y certbot
   sudo certbot certonly --standalone -d yourdomain.com
   sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/certs/fullchain.pem
   sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem nginx/certs/privkey.pem
   ```
   (Or run `./nginx/generate-certs.sh yourdomain.com` for a self-signed cert.)
5. Set `DOMAIN_NAME` in `.env` to your real domain.
6. Increase `vm.max_map_count` persists via the sysctl file the setup script
   already installed — Elasticsearch needs it.
7. `docker compose up -d --build`
8. Consider restricting `/admin/`, `/kibana/`, `/kafka-ui/` to trusted IPs with
   `allow`/`deny` rules in `nginx/conf.d/default.conf`, and put the whole box
   behind your own VPN/bastion for anything beyond a demo.

## Security hardening already in place

- **Network isolation**: only `nginx` has published ports; everything else is
  on a Docker `internal: true` network unreachable from the host or internet.
- **TLS everywhere at the edge**, HTTP→HTTPS redirect, HSTS, CSP, X-Frame-Options,
  X-Content-Type-Options, referrer policy.
- **Rate limiting** per-IP on nginx (tighter limits on `/api/auth/`), plus
  connection limits.
- **Non-root containers**: all custom Node services run as the unprivileged
  `node` user; `cap_drop: ALL` + `no-new-privileges` on every custom service.
- **Secrets via `.env`** (gitignored), never baked into images.
- **Passwords hashed with bcrypt** (backend) / **pgcrypto bcrypt** (seed data).
- **JWT auth** with role-based access control (`buyer` / `seller` / `admin`).
- **Elasticsearch + Kibana security enabled** (`xpack.security.enabled`), with
  a dedicated low-privilege `kibana_system` service account.
- **Redis hardened**: `requirepass`, dangerous commands renamed/disabled.
- **Host hardening script**: UFW default-deny, fail2ban, SSH key-only,
  sysctl network hardening, unattended upgrades.
- **Resource limits** (`mem_limit`) on every container to blunt local DoS/resource exhaustion.
- **Log rotation** configured for every container (`json-file`, capped size).

For a production deployment beyond a demo, also consider: a secrets manager
instead of `.env`, mutual TLS or a VPN in front of `/admin/` and `/kibana/`,
regular image scanning (e.g. `docker scout` / `trivy`), automated backups of
the `postgres-data` and `es-data` volumes, and a WAF in front of `nginx`.

## Extending it

- **Real payments**: the `orders/checkout` endpoint currently marks orders
  `paid` immediately — wire in a real payment provider before going live.
- **Real notifications**: replace the `console.log` calls in
  `notification-consumer/src/index.js` with SES/Twilio/etc.
- **Object storage for images**: products currently use an emoji as a
  lightweight placeholder image — swap in S3/MinIO + real uploads if needed.
- **Autoscaling consumers**: both Kafka consumers use consumer groups, so you
  can scale `analytics-consumer`/`notification-consumer` horizontally with
  `docker compose up -d --scale analytics-consumer=3`.
