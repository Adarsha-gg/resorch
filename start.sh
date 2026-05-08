#!/bin/bash
# start.sh - Run both the client and signaling server concurrently

echo "Starting Spatial Handshake MVP..."

# Start the Node.js signaling server in the background
echo "[Server] Starting on port 3001..."
cd server
npm install --silent
npm run start &
SERVER_PID=$!
cd ..

# Start the Vite client dev server
echo "[Client] Starting Vite dev server..."
cd client
npm install --silent
npm run dev

# Cleanup when user hits Ctrl+C
trap "kill $SERVER_PID" EXIT
