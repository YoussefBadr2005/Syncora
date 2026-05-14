#!/bin/bash
set -euxo pipefail

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git
npm install -g pm2

if [ ! -d /app ]; then
  git clone https://github.com/<your-org>/<your-repo>.git /app
fi

cd /app/backend
npm install
npm run build

pm2 start dist/index.js --name mini-jira-api --update-env
pm2 startup systemd -u root --hp /root
pm2 save
