# EpicBook Operations Runbook

## Deployment details

- Cloud: Microsoft Azure
- VM: week11-docker-vm
- Resource group: WEEK-11-DOCKER-RG
- Public IP: 20.115.4.158
- Application: https://epicbook-michael-c3-2026.eastus.cloudapp.azure.com/
- Repository directory: /home/azureuser/epicbook-docker-capstone
- Git branch: assignment06-docker-capstone
- Compose project: epicbook-capstone
- Services: reverse-proxy, frontend, backend, database
- Verified application images: michaelokanlawon/epicbook-frontend:16 and michaelokanlawon/epicbook-backend:16

Run the commands below from the repository directory.

## SSH access

From Windows PowerShell:

```powershell
ssh -i "$env:USERPROFILE\.ssh\week11_docker" azureuser@20.115.4.158
```

SSH access must remain restricted to approved administrator and pipeline source IP addresses in both Azure NSGs. Update the administrator allowlist when the administrator's public IP changes.

## Startup and verification

```bash
cd /home/azureuser/epicbook-docker-capstone
sudo docker compose up -d --no-build --wait --wait-timeout 180
sudo docker compose ps

curl --fail --show-error --silent --max-time 15 \
  -o /dev/null \
  https://epicbook-michael-c3-2026.eastus.cloudapp.azure.com/

curl --fail --show-error --silent --max-time 15 \
  'https://epicbook-michael-c3-2026.eastus.cloudapp.azure.com/api/books?limit=1'
```

Confirm that all four services are healthy and both application requests succeed. A healthy frontend container alone does not prove that its backend dependencies are available.

Preserve the existing .env file, especially MYSQL_DATA_VOLUME and MYSQL_IMAGE. Do not initialise or seed an existing production database during routine startup.

## Planned shutdown

```bash
sudo docker compose stop -t 120
```

This stops services while preserving their containers and database volume. Do not use `docker compose down -v` for routine shutdown.

## Logs and diagnosis

```bash
sudo docker compose ps
sudo docker compose logs --since=10m --tail=100 frontend backend database
sudo tail -n 50 logs/nginx/access.log
sudo tail -n 50 logs/nginx/error.log
```

Frontend and backend write structured JSON to stdout. Nginx access logs are JSON in the host-mounted logs/nginx directory. Nginx error logs use its standard text format.

Docker log rotation is configured separately from the host-mounted Nginx files. Monitor host log growth and available disk space.

## Backend outage recovery

```bash
sudo docker compose up -d --no-deps --no-build \
  --wait --wait-timeout 180 backend

sudo docker compose exec -T reverse-proxy nginx -t &&
sudo docker compose exec -T reverse-proxy nginx -s reload
```

Repeat the homepage and API checks after recovery. Nginx reload refreshes upstream name resolution following container changes.

During the tested outage, the homepage returned a friendly HTTP 503 page and the proxied API returned HTTP 504. The first homepage request after restart also returned 503 because backend requests exceeded the frontend's five-second timeout. Later requests succeeded without another restart.

## Database outage recovery

```bash
sudo docker compose up -d --no-deps \
  --wait --wait-timeout 180 database
```

Check the homepage, API and service health. During the tested outage, the backend reconnected after database recovery without restarting the application containers.

If recovery fails, inspect database and backend logs before changing configuration. Verify the selected volume and credential files. Do not delete the database volume as a troubleshooting step.

## Deployment and rollback

The Azure pipeline builds and tags both application images and deploys them over SSH using scripts/deploy-capstone.sh.

Each deployment retains a restricted backup of .env in backups/deployment-env.*. The script attempts to restore the previous configuration and images if deployment fails. This automatic rollback path has not been fault-tested.

For a manual image rollback:

1. Identify the previous successful frontend and backend image tags.
2. Update only FRONTEND_IMAGE and BACKEND_IMAGE in .env.
3. Preserve the database volume, database image, credentials and CORS settings.
4. Pull and start the selected application images.
5. Recreate the reverse proxy and verify the homepage and API.

```bash
sudo docker compose pull backend frontend
sudo docker compose up -d --no-deps --no-build \
  --wait --wait-timeout 180 backend
sudo docker compose up -d --no-deps --no-build \
  --wait --wait-timeout 180 frontend
sudo docker compose up -d --no-deps --force-recreate \
  --wait --wait-timeout 180 reverse-proxy
```

Application image rollback does not reverse database schema changes. Future migrations need a separate compatibility and recovery plan.

## Secret rotation

Never commit .env, database passwords, SSH private keys or registry tokens.

For the application database password:

1. Schedule a maintenance window and take a verified backup.
2. Stop frontend and backend to prevent new application requests.
3. Use an authenticated MySQL administrator session to change the password of the actual application account, checking its user and host first.
4. Update secrets/db_password to the same value using a secure editor or protected input. Do not put passwords in shell command arguments or Git.
5. Preserve the restrictive secret-directory permissions and the readability required by the container.
6. Recreate the database container against the same named volume so its secret mount reflects the updated file.
7. Recreate backend and frontend, then verify database health, API access and the homepage.

Changing a MySQL password file alone does not change the credentials stored in an existing database. Coordinate the SQL account change and secret-file update. If interrupted, reconcile these values before restarting clients.

Rotate the root database password separately, updating both the MySQL account and secrets/db_root_password.

For pipeline SSH keys, install the new public key, update the Azure DevOps SSH service connection, verify deployment access, then remove the old authorised key. Rotate Docker Hub tokens through the registry service connection and revoke the old token after verification.

## TLS certificate renewal

Certificate files are stored on the host under /etc/letsencrypt and mounted read-only into Nginx.

```bash
sudo systemctl list-timers --all certbot.timer --no-pager
sudo certbot renew --cert-name epicbook --dry-run --run-deploy-hooks
```

The renewal deploy hook tests and reloads Nginx. A simulated renewal with the deploy hook succeeded on 14 October 2026.

Keep HTTP port 80 and the ACME challenge route available for renewal.

## Backup and disaster recovery

See [Persistence and Backups](05-persistence-and-backup.md) for the backup and restore procedure.

The verified physical backup is:

backups/snapshot-20261013T140844Z/mysql-data.tar.gz

The tested restored volume is:

epicbook-capstone_mysql-restored-20261013T141956Z

Recovery procedure:

1. Stop application writes and retain the current volume for rollback.
2. Verify the backup archive and checksum.
3. Restore the physical snapshot into a new named volume while MySQL is stopped.
4. Use the compatible database image recorded with the backup.
5. Set MYSQL_DATA_VOLUME to the restored volume in .env.
6. Start the stack and check database records, service health, homepage and API.
7. Retain the original volume until recovery is accepted.

The completed restore drill recovered 53 authors, 54 books and book ID 1, "28 Summers", with an HTTP 200 homepage.

For total VM loss, also restore the repository, protected environment configuration, database secrets, TLS setup, renewal hook and Azure network rules. Database data alone is insufficient to recreate the deployment.

Daily backups with encrypted off-VM storage and periodic restore drills are the intended backup policy. Automated off-VM backups have not been demonstrated. Recovery time has not been formally measured.

## Known limitations

- This is a single-VM deployment; there is no high availability.
- Startup latency can exceed the frontend's five-second dependency timeout.
- Frontend and reverse-proxy health endpoints do not establish full application readiness.
- Monitoring alerts and automated off-VM backups remain future improvements.
- The demonstration application uses a shared cart and is not a production payment platform.
