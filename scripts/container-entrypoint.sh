#!/bin/bash
set -euo pipefail
umask 077
mountpoint -q /data || { echo '/data must be a mounted persistent volume' >&2; exit 1; }
mkdir -p /data/work /data/transfers /data/backups
chown zforum:zforum /data /data/work /data/transfers /data/backups
chmod 700 /data /data/work /data/transfers /data/backups
exec setpriv --reuid=zforum --regid=zforum --init-groups "$@"
