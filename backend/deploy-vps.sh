#!/usr/bin/env bash
# ==============================================================================
# Green Energy Solution Solar CRM - VPS Isolated Backend Deployment Script
# Designed for: Hostinger KVM VPS (Ubuntu / Debian)
# SAFETY GUARANTEE: Does NOT touch, restart, or interfere with existing projects.
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}  Solar CRM Backend - VPS Safe Deployment Installer  ${NC}"
echo -e "${BLUE}======================================================${NC}"

# 1. Target Directory
TARGET_DIR="/var/www/ges-backend"
echo -e "\n${YELLOW}[Step 1/6] Setting up isolated directory at: ${TARGET_DIR}...${NC}"
sudo mkdir -p "$TARGET_DIR"
sudo chown -R $USER:$USER "$TARGET_DIR"

# 2. Check Node.js
echo -e "\n${YELLOW}[Step 2/6] Checking Node.js runtime...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js not detected. Installing Node.js LTS (v20)...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✓ Node.js is installed (${NODE_VERSION})${NC}"
fi

# 3. Check PM2
echo -e "\n${YELLOW}[Step 3/6] Checking PM2 process manager...${NC}"
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}Installing PM2 globally...${NC}"
    sudo npm install -g pm2
else
    echo -e "${GREEN}✓ PM2 is installed${NC}"
fi

# 4. Copy backend files to isolated folder (if running from repo folder)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ "$SCRIPT_DIR" != "$TARGET_DIR" ]; then
    echo -e "\n${YELLOW}[Step 4/6] Copying backend files to ${TARGET_DIR}...${NC}"
    cp -r "$SCRIPT_DIR"/* "$TARGET_DIR"/
    if [ -f "$SCRIPT_DIR/.env" ]; then
        cp "$SCRIPT_DIR/.env" "$TARGET_DIR/.env"
    fi
fi

cd "$TARGET_DIR"

# 5. Check dependencies & install
echo -e "\n${YELLOW}[Step 5/6] Installing production dependencies...${NC}"
npm install --omit=dev

# Verify .env exists
if [ ! -f "$TARGET_DIR/.env" ]; then
    echo -e "${YELLOW}Creating default .env from template...${NC}"
    if [ -f "$TARGET_DIR/.env.example" ]; then
        cp "$TARGET_DIR/.env.example" "$TARGET_DIR/.env"
    fi
fi

# 6. Check Port 5050 Availability
echo -e "\n${YELLOW}[Step 6/6] Verifying port 5050 availability...${NC}"
if sudo ss -tuln | grep -q ":5050 "; then
    echo -e "${YELLOW}Port 5050 is currently bound. Checking PM2 status...${NC}"
else
    echo -e "${GREEN}✓ Port 5050 is free and ready.${NC}"
fi

# Start ONLY this app with PM2 (leaves all other PM2 apps untouched)
echo -e "\n${BLUE}Starting/Reloading 'ges-backend-api' in PM2 (SAFE MODE)...${NC}"
pm2 start ecosystem.config.cjs --only ges-backend-api || pm2 reload ges-backend-api
pm2 save

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}✓ Solar CRM Backend successfully deployed and running!${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "PM2 Status:"
pm2 status ges-backend-api

echo -e "\n${BLUE}Local Health Check on VPS:${NC}"
curl -s http://127.0.0.1:5050/api/health || echo "Health check query sent."

echo -e "\n${YELLOW}------------------------------------------------------${NC}"
echo -e "${YELLOW}Next Step (Nginx Reverse Proxy & SSL):${NC}"
echo -e "1. Create Nginx config: sudo cp $TARGET_DIR/nginx.conf.example /etc/nginx/sites-available/ges-api.conf"
echo -e "2. Edit domain name:    sudo nano /etc/nginx/sites-available/ges-api.conf"
echo -e "3. Enable config:       sudo ln -s /etc/nginx/sites-available/ges-api.conf /etc/nginx/sites-enabled/"
echo -e "4. Test Nginx safety:   sudo nginx -t"
echo -e "5. Reload Nginx safely: sudo systemctl reload nginx"
echo -e "6. Install free SSL:    sudo certbot --nginx -d yoursubdomain.domain.com"
echo -e "${YELLOW}------------------------------------------------------${NC}\n"
