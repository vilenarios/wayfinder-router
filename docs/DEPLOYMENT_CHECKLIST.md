# Wayfinder Router Enterprise Deployment Checklist

## Pre-Deployment Phase

### Infrastructure Provisioning

- [ ] **Hetzner Account Setup**
  - [ ] Create Hetzner account with business verification
  - [ ] Enable 2FA on account
  - [ ] Set up billing alerts
  - [ ] Request server quota increase if needed

- [ ] **Server Provisioning**
  - [ ] Order 3x AX102 servers (Wayfinder nodes)
  - [ ] Order 1x AX42 server (Management)
  - [ ] Verify all servers in same data center (FSN1)
  - [ ] Document server IPs and credentials
  - [ ] Configure RAID arrays (OS: RAID1, Cache: RAID0)

- [ ] **Network Setup**
  - [ ] Create private VLAN (10.0.1.0/24)
  - [ ] Assign private IPs to servers
  - [ ] Order floating IPs for redundancy
  - [ ] Provision Hetzner Load Balancer
  - [ ] Order 10 Gbps network upgrades

- [ ] **CDN77 Setup**
  - [ ] Create CDN77 account
  - [ ] Create CDN resource (HTTP Pull)
  - [ ] Configure origin: wayfinder-origin.yourdomain.com
  - [ ] Enable Origin Shield (Frankfurt)
  - [ ] Configure DDoS protection
  - [ ] Enable WAF with OWASP rules
  - [ ] Document CDN77 resource hostname
  - [ ] Get CDN77 IP ranges for firewall

### Security Configuration

- [ ] **Firewall Rules**
  - [ ] Configure Hetzner firewall
  - [ ] Allow CDN77 IPs to port 443
  - [ ] Allow bastion IP to port 22
  - [ ] Allow internal VLAN traffic
  - [ ] Block all other inbound
  - [ ] Document firewall rules

- [ ] **SSH Access**
  - [ ] Generate SSH key pairs for team
  - [ ] Configure bastion host (or use Hetzner web console)
  - [ ] Disable password authentication
  - [ ] Configure fail2ban

- [ ] **SSL/TLS**
  - [ ] Register domain names
  - [ ] Configure DNS records
  - [ ] Generate Let's Encrypt certificates (or use CDN77)
  - [ ] Configure auto-renewal

### DNS Configuration

- [ ] **Public DNS Records**
  - [ ] `arweave.yourdomain.com` → CNAME to CDN77
  - [ ] `*.arweave.yourdomain.com` → CNAME to CDN77
  - [ ] `wayfinder-origin.yourdomain.com` → A to Hetzner LB
  - [ ] Verify DNS propagation

- [ ] **Internal DNS (Optional)**
  - [ ] Configure internal DNS or /etc/hosts
  - [ ] Document internal hostnames

---

## Server Setup Phase

### Base OS Configuration (All Servers)

- [ ] **System Updates**
  ```bash
  apt update && apt upgrade -y
  reboot
  ```

- [ ] **Install Dependencies**
  ```bash
  apt install -y docker.io docker-compose-v2 ufw fail2ban \
    curl wget htop iotop nethogs
  ```

- [ ] **Configure Docker**
  ```bash
  systemctl enable docker
  usermod -aG docker deploy
  ```

- [ ] **Configure Firewall (UFW)**
  ```bash
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow from 10.0.1.0/24
  # Add CDN77 IPs
  ufw enable
  ```

- [ ] **Configure Time Sync**
  ```bash
  timedatectl set-timezone UTC
  systemctl enable systemd-timesyncd
  ```

- [ ] **Security Hardening**
  - [ ] Disable root SSH login
  - [ ] Configure SSH key-only authentication
  - [ ] Set up automatic security updates
  - [ ] Configure audit logging

### Wayfinder Node Setup (WF-FSN-1, WF-FSN-2, WF-FSN-3)

- [ ] **Create Application Directory**
  ```bash
  mkdir -p /opt/wayfinder/data
  chown -R deploy:deploy /opt/wayfinder
  ```

- [ ] **Deploy Configuration**
  - [ ] Copy `.env.production` to `/opt/wayfinder/.env`
  - [ ] Verify all environment variables
  - [ ] Set appropriate permissions (600)

- [ ] **Deploy Docker Compose**
  - [ ] Copy `docker-compose.prod.yml` to `/opt/wayfinder/`
  - [ ] Pull Docker image
  - [ ] Start container
  - [ ] Verify container running

- [ ] **Verify Health**
  ```bash
  curl http://localhost:3000/wayfinder/health
  curl http://localhost:3000/wayfinder/ready
  ```

### Management Server Setup (MGT-FSN)

- [ ] **Install Monitoring Stack**
  - [ ] Deploy Prometheus
  - [ ] Deploy Grafana
  - [ ] Deploy Loki
  - [ ] Deploy Alertmanager
  - [ ] Deploy Promtail on all nodes

- [ ] **Configure Prometheus**
  - [ ] Add scrape targets for all Wayfinder nodes
  - [ ] Configure alert rules
  - [ ] Verify metrics collection

- [ ] **Configure Grafana**
  - [ ] Add Prometheus data source
  - [ ] Add Loki data source
  - [ ] Import dashboards
  - [ ] Configure alerting channels

- [ ] **Configure Alertmanager**
  - [ ] Set up PagerDuty integration
  - [ ] Configure routing rules
  - [ ] Test alert delivery

---

## Load Balancer Configuration

- [ ] **Hetzner Load Balancer**
  - [ ] Create load balancer
  - [ ] Add all Wayfinder nodes as targets
  - [ ] Configure health check:
    - Protocol: HTTP
    - Path: /wayfinder/ready
    - Interval: 5s
    - Timeout: 3s
    - Retries: 3
  - [ ] Configure algorithm: Round Robin
  - [ ] Test failover by stopping one node

---

## CDN77 Final Configuration

- [ ] **Caching Rules**
  - [ ] Set default cache TTL for `/{txId}/*`: 365 days
  - [ ] Set cache TTL for ArNS subdomains: 5 minutes
  - [ ] Exclude `/wayfinder/*` from caching
  - [ ] Exclude `/graphql` from caching
  - [ ] Configure cache key (host + path + query)

- [ ] **Security Rules**
  - [ ] Enable rate limiting (10,000 req/min/IP)
  - [ ] Configure bot protection
  - [ ] Review WAF rules
  - [ ] Test DDoS protection (coordinate with CDN77)

- [ ] **Headers**
  - [ ] Add X-Forwarded-For header
  - [ ] Add X-CDN77-Country header
  - [ ] Configure CORS if needed

---

## Testing Phase

### Functional Testing

- [ ] **Basic Functionality**
  - [ ] Fetch content by txId
  - [ ] Fetch content by ArNS name
  - [ ] Fetch path within manifest
  - [ ] Verify health endpoint
  - [ ] Verify metrics endpoint
  - [ ] Verify stats endpoint

- [ ] **Verification Testing**
  - [ ] Confirm verification enabled
  - [ ] Test with known valid txId
  - [ ] Test verification failure handling (if possible)

- [ ] **Cache Testing**
  - [ ] Verify CDN cache hit (check headers)
  - [ ] Verify local cache hit (check metrics)
  - [ ] Test cache invalidation (wait for TTL)

### Performance Testing

- [ ] **Load Testing**
  - [ ] Install k6 or similar tool
  - [ ] Run baseline test (100 concurrent users)
  - [ ] Run stress test (1000 concurrent users)
  - [ ] Document results:
    - RPS achieved
    - P50/P95/P99 latency
    - Error rate
    - Resource utilization

- [ ] **Failover Testing**
  - [ ] Stop one Wayfinder node
  - [ ] Verify load balancer removes it
  - [ ] Verify no errors for clients
  - [ ] Restart node
  - [ ] Verify it rejoins

### Security Testing

- [ ] **Penetration Testing**
  - [ ] Test from external network
  - [ ] Verify firewall rules effective
  - [ ] Test rate limiting
  - [ ] Test WAF rules
  - [ ] Document findings

- [ ] **SSL Testing**
  - [ ] Run SSL Labs test (https://www.ssllabs.com/ssltest/)
  - [ ] Verify A+ rating
  - [ ] Check certificate chain

---

## Go-Live Phase

### Pre-Launch Checklist

- [ ] **Documentation**
  - [ ] Architecture document complete
  - [ ] Runbooks complete
  - [ ] On-call rotation defined
  - [ ] Escalation paths documented

- [ ] **Monitoring**
  - [ ] All dashboards working
  - [ ] All alerts configured
  - [ ] PagerDuty integration tested
  - [ ] Log aggregation working

- [ ] **Backup & DR**
  - [ ] Configuration backed up
  - [ ] DR region identified
  - [ ] Failover procedure documented
  - [ ] Recovery tested

### Launch Steps

1. [ ] **Final Review Meeting**
   - [ ] All checklist items complete
   - [ ] Team sign-off obtained
   - [ ] Go/No-Go decision documented

2. [ ] **DNS Cutover**
   - [ ] Update DNS records to point to CDN77
   - [ ] Monitor DNS propagation
   - [ ] Verify traffic flowing

3. [ ] **Monitoring**
   - [ ] Watch dashboards for first hour
   - [ ] Check error rates
   - [ ] Verify cache hit ratio improving
   - [ ] Monitor resource utilization

4. [ ] **Post-Launch**
   - [ ] Document any issues
   - [ ] Update runbooks if needed
   - [ ] Schedule post-mortem (1 week)

---

## Post-Deployment Phase

### First Week

- [ ] Analyze traffic patterns
- [ ] Tune cache settings if needed
- [ ] Review and address any alerts
- [ ] Gather performance baseline data
- [ ] Document lessons learned

### First Month

- [ ] Review cost vs budget
- [ ] Analyze error patterns
- [ ] Review security logs
- [ ] Plan capacity for growth
- [ ] Schedule regular maintenance windows

### Ongoing

- [ ] Monthly security patches
- [ ] Quarterly DR testing
- [ ] Bi-annual penetration testing
- [ ] Annual architecture review

---

## Emergency Contacts

| Role | Contact | Method |
|------|---------|--------|
| On-Call Engineer | | PagerDuty |
| Platform Lead | | Phone/Slack |
| Security Team | | Slack #security |
| Hetzner Support | | support@hetzner.com |
| CDN77 Support | | support@cdn77.com |

---

## Quick Reference

### Critical URLs

| Purpose | URL |
|---------|-----|
| Production | https://arweave.yourdomain.com |
| Health Check | https://arweave.yourdomain.com/wayfinder/health |
| Metrics | https://arweave.yourdomain.com/wayfinder/metrics |
| Grafana | https://grafana.internal:3001 |
| Prometheus | https://prometheus.internal:9090 |

### Common Commands

```bash
# Check service status
docker compose -f /opt/wayfinder/docker-compose.prod.yml ps

# View logs
docker compose -f /opt/wayfinder/docker-compose.prod.yml logs -f

# Restart service
docker compose -f /opt/wayfinder/docker-compose.prod.yml restart

# Check health
curl http://localhost:3000/wayfinder/ready

# Check metrics
curl http://localhost:3000/wayfinder/metrics

# Check gateway stats
curl http://localhost:3000/wayfinder/stats/gateways
```

---

*Checklist Version: 1.0 | Last Updated: 2026-01-27*
