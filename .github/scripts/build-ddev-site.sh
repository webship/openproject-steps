#!/usr/bin/env bash
# Build the test site of this pack in a DDEV project: OpenProject from the publisher's image on the project's own
# PostgreSQL, the accounts of the suite as members of the project "Webship site", and the sample content the features
# read (its work packages, its active sprint "Sprint 1" and a comment). It is what CI runs; on a machine with Docker and
# DDEV it makes the same site.
#
#   SITE_DIR=<folder>           where the project goes (default: ../openproject-site beside the pack)
#   OPENPROJECT_VERSION=<x.y.z> the release of the image (default: 17.9.8)
#   COUNTS_ONLY=1               build nothing: print what the site holds, one count a line (a run must leave them)
#
# The site answers at https://openprojectsteps.ddev.site, the address cucumber.js opens by default. Its first
# administrator's password and its secret key are made for it, in $SITE_DIR/openproject/env, never printed.
set -euo pipefail

PACK="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SITE_DIR="${SITE_DIR:-${PACK}/../openproject-site}"
NAME=openprojectsteps
VERSION="${OPENPROJECT_VERSION:-17.9.8}"
PASSWORD='dD.123123ddd'

# The site's own Rails runner, in OpenProject's container, as its own user; what is piped in reaches it.
runner() {
  ( cd "${SITE_DIR}" && ddev exec -s openproject "su app -s /bin/bash -c 'cd /app && OPENPROJECT_LOG__LEVEL=warn bundle exec rails runner $*'" )
}

if [ "${COUNTS_ONLY:-}" = 1 ] ; then
  runner /opt/webship/counts.rb < /dev/null | tr -d '\r' | grep -E '^[a-z ]+: [0-9]+$'
  exit 0
fi

mkdir -p "${SITE_DIR}/openproject" "${SITE_DIR}/.ddev"
SITE_DIR="$(cd "${SITE_DIR}" && pwd)"
cd "${SITE_DIR}"
ddev config --project-type=generic --project-name="${NAME}" --database=postgres:17 < /dev/null

cp "${PACK}/site/openproject-site.rb" "${PACK}/site/counts.rb" openproject/
secret() { head -c 96 /dev/urandom | base64 -w0 | tr -dc 'A-Za-z0-9' | head -c "$1" ; }
( umask 077 && cat > openproject/env <<ENVEOF
SECRET_KEY_BASE=$(secret 96)
OPENPROJECT_SEED__ADMIN__USER__PASSWORD=$(secret 24)
OPENPROJECT_SEED__ADMIN__USER__PASSWORD__RESET=false
OPENPROJECT_SEED__ADMIN__USER__MAIL=admin@example.com
OPENPROJECT_DEFAULT__LANGUAGE=en
OPENPROJECT_EMAIL__DELIVERY__METHOD=smtp
OPENPROJECT_SMTP__PORT=1025
OPENPROJECT_SMTP__ENABLE__STARTTLS__AUTO=false
OPENPROJECT_MAIL__FROM=openproject@example.com
ENVEOF
)
printf 'OPENPROJECT_VERSION=%s\n' "${VERSION}" > .ddev/.env
cat > .ddev/docker-compose.openproject.yaml <<'YAMLEOF'
# OpenProject: the publisher's all-in-one image on the project's PostgreSQL, at the project's address; the project's
# web container keeps the mail catcher. The same service as the Webship Workspace's OpenProject plugin.
services:
  web:
    environment:
      - HTTP_EXPOSE=8093:80,8025:8025
      - HTTPS_EXPOSE=8457:80,8026:8025
  openproject:
    image: "openproject/openproject:${OPENPROJECT_VERSION:-17.9.8}"
    container_name: ddev-${DDEV_SITENAME}-openproject
    labels:
      com.ddev.site-name: ${DDEV_SITENAME}
      com.ddev.approot: ${DDEV_APPROOT}
    restart: "no"
    expose:
      - "80"
    depends_on:
      - db
    env_file:
      - ${DDEV_APPROOT}/openproject/env
    volumes:
      - openproject_assets:/var/openproject/assets
      - ${DDEV_APPROOT}/openproject:/opt/webship:ro
    environment:
      VIRTUAL_HOST: ${DDEV_HOSTNAME}
      HTTP_EXPOSE: "80:80"
      HTTPS_EXPOSE: "443:80"
      DATABASE_URL: postgres://db:db@db:5432/db
      OPENPROJECT_HOST__NAME: ${DDEV_SITENAME}.ddev.site
      OPENPROJECT_HTTPS: "true"
      OPENPROJECT_SMTP__ADDRESS: web
      USE_JEMALLOC: "false"
volumes:
  openproject_assets:
    name: ddev-${DDEV_SITENAME}-openproject-assets
YAMLEOF

echo "Starting OpenProject ${VERSION}: the first start loads and seeds the database (some minutes)."
ddev start -y < /dev/null
for attempt in $(seq 1 300) ; do
  code="$(ddev exec "curl -s -o /dev/null -m 10 -w '%{http_code}' -H 'Host: ${NAME}.ddev.site' -H 'X-Forwarded-Proto: https' http://openproject/health_checks/default" < /dev/null 2>/dev/null | tr -d '\r' | tail -1 || true)"
  [ "${code}" = 200 ] && break
  [ "${attempt}" = 300 ] && { echo "OpenProject did not answer (${code:-none})." ; ddev logs -s openproject --tail 60 < /dev/null || true ; exit 1 ; }
  sleep 3
done

# The accounts of the suite, each a member of Webship site in its role (the stranger in none), then the sample content.
python3 - "${PASSWORD}" <<'PYEOF' | runner /opt/webship/openproject-site.rb accounts content list
import base64, json, sys
password = sys.argv[1]
rows = [{'login': login, 'mail': login + '@example.com', 'password': password, 'firstname': login.capitalize(),
         'lastname': 'Test', 'admin': False, 'role': role, 'action': ''}
        for login, role in [('owner', 'Project admin'), ('member', 'Member'), ('reader', 'Reader'), ('stranger', '')]]
print(base64.b64encode(json.dumps(rows).encode()).decode())
PYEOF

echo "The site: https://${NAME}.ddev.site"
[ -n "${GITHUB_ENV:-}" ] && echo "LAUNCH_URL=https://${NAME}.ddev.site" >> "${GITHUB_ENV}"
exit 0
