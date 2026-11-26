#!/bin/bash
# Standalone launcher (optional). Normally the RouterMod custom-server starts
# the bridge automatically; this script is for manual/pm2 use only.
exec xvfb-run -a /root/.solana2api-venv/bin/python /root/routermod/scripts/solana2api.py
