#!/usr/bin/env bash
# Generates a self-signed TLS cert for local/testing use.
# For a real deployment with a public domain, replace nginx/certs/*.pem with
# certificates from Let's Encrypt (certbot) instead - see README.md.
set -euo pipefail

DOMAIN="${1:-localhost}"
CERT_DIR="$(dirname "$0")/certs"
mkdir -p "$CERT_DIR"

if [[ -f "$CERT_DIR/fullchain.pem" && -f "$CERT_DIR/privkey.pem" ]]; then
    echo "Certificates already exist in $CERT_DIR - skipping. Delete them to regenerate."
    exit 0
fi

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$CERT_DIR/privkey.pem" \
    -out "$CERT_DIR/fullchain.pem" \
    -subj "/CN=${DOMAIN}" \
    -addext "subjectAltName=DNS:${DOMAIN}"

chmod 600 "$CERT_DIR/privkey.pem"
echo "Self-signed certificate written to $CERT_DIR (CN=${DOMAIN})"
