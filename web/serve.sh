#!/bin/zsh
export PATH="/opt/homebrew/bin:/Users/eden/.nvm/versions/node/v22.22.2/bin:/usr/bin:/bin:$PATH"
cd /Users/eden/data/real-agama/app
exec ./node_modules/.bin/next start -p 3020
