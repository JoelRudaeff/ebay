#!/usr/bin/env bash
#
# One-time host hardening + Docker installation for a fresh Ubuntu Server
# (22.04/24.04) that will run this marketplace stack.
#
# Run as root (or with sudo): sudo ./setup-ubuntu-server.sh
#
# What it does:
#   1. Updates the system and enables unattended security upgrades
#   2. Creates a non-root sudo user to deploy/operate the stack (optional)
#   3. Installs Docker Engine + the Compose plugin from Docker's official repo
#   4. Configures UFW to allow only SSH, HTTP and HTTPS
#   5. Installs and configures fail2ban for SSH brute-force protection
#   6. Hardens sshd (no root login, no password auth - key-only)
#   7. Applies a set of sysctl network-hardening settings
#   8. Sets the vm.max_map_count required by Elasticsearch
#
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "Please run this script as root: sudo $0" >&2
    exit 1
fi

read -rp "Create a non-root deploy user? [y/N] " CREATE_USER
if [[ "${CREATE_USER,,}" == "y" ]]; then
    read -rp "Username for the deploy user: " DEPLOY_USER
    if ! id "$DEPLOY_USER" &>/dev/null; then
        adduser --gecos "" "$DEPLOY_USER"
        usermod -aG sudo "$DEPLOY_USER"
        echo ">> Add your SSH public key to /home/${DEPLOY_USER}/.ssh/authorized_keys before disabling password auth."
    fi
fi

echo "==> Updating system packages"
apt-get update -y
apt-get upgrade -y

echo "==> Installing base packages"
apt-get install -y \
    ca-certificates curl gnupg ufw fail2ban unattended-upgrades \
    apt-listchanges openssl

echo "==> Enabling unattended security upgrades"
dpkg-reconfigure -f noninteractive unattended-upgrades

# ---------------------------------------------------------------------------
# Docker Engine + Compose plugin (official repo)
# ---------------------------------------------------------------------------
if ! command -v docker &>/dev/null; then
    echo "==> Installing Docker Engine"
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc

    UBUNTU_CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME} stable" \
      > /etc/apt/sources.list.d/docker.list

    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    systemctl enable --now docker

    if [[ -n "${DEPLOY_USER:-}" ]]; then
        usermod -aG docker "$DEPLOY_USER"
    fi
else
    echo "==> Docker already installed, skipping"
fi

# Restrict Docker's default IPC/daemon surface a bit + log rotation
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "no-new-privileges": true,
  "icc": true,
  "live-restore": true
}
EOF
systemctl restart docker

# ---------------------------------------------------------------------------
# Firewall - only SSH / HTTP / HTTPS reach the host.
# All other container ports are intentionally NOT published (see docker-compose.yml).
# ---------------------------------------------------------------------------
echo "==> Configuring UFW"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ---------------------------------------------------------------------------
# fail2ban for SSH
# ---------------------------------------------------------------------------
echo "==> Configuring fail2ban"
cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
maxretry = 5
bantime = 1h
findtime = 10m
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

# ---------------------------------------------------------------------------
# SSH hardening
# ---------------------------------------------------------------------------
echo "==> Hardening sshd (back up first)"
SSHD_CONFIG=/etc/ssh/sshd_config
cp "$SSHD_CONFIG" "${SSHD_CONFIG}.bak.$(date +%s)"

set_sshd_option() {
    local key="$1" value="$2"
    if grep -qE "^#?${key} " "$SSHD_CONFIG"; then
        sed -i "s/^#\?${key} .*/${key} ${value}/" "$SSHD_CONFIG"
    else
        echo "${key} ${value}" >> "$SSHD_CONFIG"
    fi
}

set_sshd_option PermitRootLogin no
set_sshd_option PasswordAuthentication no
set_sshd_option ChallengeResponseAuthentication no
set_sshd_option X11Forwarding no
set_sshd_option MaxAuthTries 4
set_sshd_option ClientAliveInterval 300
set_sshd_option ClientAliveCountMax 2

echo "!! sshd is now configured for key-only login. Make sure a working SSH key"
echo "!! is installed for your user BEFORE you disconnect, then run:"
echo "!!    systemctl restart sshd"

# ---------------------------------------------------------------------------
# Kernel / network hardening (sysctl)
# ---------------------------------------------------------------------------
echo "==> Applying sysctl hardening"
cat > /etc/sysctl.d/99-marketplace-hardening.conf <<'EOF'
# Ignore ICMP redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0

# Ignore send redirects
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0

# Disable source routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0

# Enable SYN cookies (SYN flood protection)
net.ipv4.tcp_syncookies = 1

# Ignore broadcast ICMP (smurf protection)
net.ipv4.icmp_echo_ignore_broadcasts = 1

# Log martian packets
net.ipv4.conf.all.log_martians = 1

# Reverse path filtering
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Elasticsearch requirement - must stay high for the ES container to boot
vm.max_map_count = 262144
EOF
sysctl --system

echo ""
echo "=================================================================="
echo " Host hardening complete."
echo ""
echo " Next steps:"
echo "   1. Confirm you can still SSH in with your key, THEN run:"
echo "        systemctl restart sshd"
echo "   2. Copy .env.example to .env and fill in real secrets."
echo "   3. Run ./nginx/generate-certs.sh <your-domain-or-ip> (or install"
echo "      real certs from Let's Encrypt) before 'docker compose up'."
echo "   4. docker compose up -d --build"
echo "=================================================================="
