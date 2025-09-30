# WinGo Prediction Bot

Telegram bot for WinGo game predictions with admin panel.

## Features
- Automatic predictions based on pattern analysis
- Admin control panel
- Table format with images
- Multi-channel support
- Win/Loss tracking

## Heroku Deployment

### Prerequisites
1. Heroku account (free tier works)
2. Telegram Bot Token from [@BotFather](https://t.me/botfather)
3. Your Telegram User ID (get from [@userinfobot](https://t.me/userinfobot))

### Setup Steps

1. **Install Heroku CLI**
   ```bash
   # Download from: https://devcenter.heroku.com/articles/heroku-cli
   ```

2. **Login to Heroku**
   ```bash
   heroku login
   ```

3. **Create Heroku App**
   ```bash
   heroku create your-bot-name
   ```

4. **Set Environment Variables**
   ```bash
   heroku config:set TELEGRAM_BOT_TOKEN=your_bot_token
   heroku config:set ADMIN_USER_ID=your_user_id
   ```

5. **Deploy**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git push heroku main
   ```

6. **Check Logs**
   ```bash
   heroku logs --tail
   ```

## Local Testing

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Run Bot**
   ```bash
   node bot.js
   ```

## Admin Commands
- `/admin` or `/start` - Open admin panel
- Manage channels, templates, settings through inline buttons

## Environment Variables
- `TELEGRAM_BOT_TOKEN` - Your bot token
- `ADMIN_USER_ID` - Your Telegram user ID
- `API_URL` - (Optional) Custom API endpoint

## Troubleshooting

### 403 Error
If you get 403 errors, the API might be blocking Heroku IPs. Solutions:
1. Deploy on a VPS instead
2. Use a proxy service
3. Contact API provider

### Bot Not Responding
1. Check Heroku logs: `heroku logs --tail`
2. Verify bot token is correct
3. Ensure bot is running: `heroku ps`

## Support
For issues, check the logs first and verify all configuration settings.
