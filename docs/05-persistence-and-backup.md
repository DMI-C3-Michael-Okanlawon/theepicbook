# Persistence and Backups

## Database persistence

MySQL stores its complete data directory at /var/lib/mysql in a named
Docker volume.

Original volume:
epicbook-capstone_mysql-data

Active volume after the restore drill:
epicbook-capstone_mysql-restored-20261013T141956Z

The Compose volume name is configurable through MYSQL_DATA_VOLUME.
The local .env file selects the restored volume. Normal container
recreation preserves its data. Do not use docker compose down -v when
the database must be retained.

## Backup method

This drill used a cold physical backup of the complete MySQL volume,
not an Azure managed-disk snapshot.

Procedure:
1. Record service health, volume identity, database counts and a test record.
2. Set innodb_fast_shutdown=0.
3. Stop the Compose stack with a 120-second shutdown allowance.
4. Confirm MySQL exited normally with exit code 0 and no OOM kill.
5. Mount the source volume read-only in a temporary helper container.
6. Archive its contents with tar and gzip.
7. Check gzip integrity, list the archive and record a SHA-256 checksum.
8. Save the source volume name and MySQL image ID.
9. Restart the application.

Backup directory:
backups/snapshot-20261013T140844Z

Archive:
mysql-data.tar.gz

Observed compressed archive size: approximately 5.9 MB.
Source data directory size before backup: approximately 210 MB.

The backup directory also contains SHA256SUMS, archive-contents.txt,
source-volume.txt and mysql-image-id.txt.

## Manual restore drill

After backup, the procedure changed book ID 1's title to
RESTORE DRILL TEST as a recovery marker.

The stack was stopped, the backup checksum was checked, and the archive
was extracted into a new empty named volume with file ownership and
permissions preserved.

Compose was configured to use the restored volume and the same MySQL
image used when the backup was taken:

sha256:24989179f58856db763f418010c1169fecc944e3ec1ea7e921572d83eb070f70

The original volume was retained as a fallback. The application was
started with docker compose up -d --wait --wait-timeout 240.
No schema initialisation or reseeding was needed for the restored data.

## Verified results on 2026-10-13

| Check | Before backup | After restore |
|---|---|---|
| Authors | 53 | 53 |
| Books | 54 | 54 |
| Book ID 1 title | 28 Summers | 28 Summers |
| Compose services | All four healthy | All four healthy |
| Database volume | Original volume | New restored volume |

The restored homepage returned HTTP 200.
The new volume was confirmed mounted at /var/lib/mysql.

Evidence:
- Persistence & Backups — Before Restore.
- Persistence & Backups — After Restore.

## Proposed ongoing backup plan

The following is the operating plan; scheduled backups and off-VM
replication have not yet been implemented.

- Take a daily backup during an agreed maintenance window.
- Take an additional backup before database or application changes.
- Keep seven daily backups and four weekly backups.
- Copy verified backups to private off-VM storage with encryption,
  restricted access and retention controls.
- Keep a protected copy of deployment configuration and required secrets
  separately from Git. Protect database archives as sensitive data.
- Check backup completion and checksums, and alert on failures.
- Perform a restore drill monthly and after changing the backup process.
- Retain the previous volume until restored data and application
  functionality have been verified.

A daily-only schedule has a potential data-loss window of up to 24 hours.
Recovery time must be measured in future drills; no recovery-time
guarantee was established here.

## Recovery considerations

A same-VM backup does not protect against loss of the VM or its disk.
The current archive remains local; an off-VM copy is still required.

Physical restores should use the same MySQL image initially.
The recorded image ID identifies the locally available image; recovery
on another VM also requires that image or its matching registry digest.

A full data-directory restore includes MySQL account data. Required
secret files must match the credentials at backup time.

Cold backups require downtime. For a service that cannot tolerate this,
evaluate consistent logical backups or a supported online physical
backup tool.

The local .env selects the active volume and MySQL image. Preserve this
configuration securely during recovery; losing it could make Compose
select the default original volume instead.
