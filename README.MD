# WinGo Prediction Bot

A Telegram bot that provides WinGo lottery predictions with beautiful table format images. The bot analyzes past results and predicts BIG/SMALL outcomes for the next period.

## Features

- 🎯 **Smart Predictions**: Analyzes last 10 results using advanced algorithms
- 📊 **Table Format**: Generates beautiful prediction tables with images
- 🔄 **Auto Multiplier**: Doubles bet amount on losses, resets on wins
- 📢 **Multi-Channel**: Post to multiple Telegram channels
- ⚙️ **Admin Panel**: Full control via Telegram commands
- 🚀 **Heroku Ready**: Easy deployment with one click

## Quick Deploy

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/your-username/wingo-bot)

## Manual Setup

### Prerequisites

- Node.js 14+
- Telegram Bot Token from [@BotFather](https://t.me/botfather)
- Heroku Account

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/wingo-bot.git
cd wingo-bot
```

2. Install dependencies:
```bash
npm install
```

3. Create config.json:
```json
{
  "TOKEN": "your_bot_token_here",
  "ADMIN_USER_ID": 123456789,
  "CHANNELS": ["@your_channel"],
  "API_URL": "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json",
  "BASE_PRICE": 10,
  "REGISTER_LINK": "https://your-link.com"
}
```

4. Run the bot:
```bash
node bot.js
```

## Heroku Deployment

Follow the detailed guide in [HEROKU_DEPLOY_GUIDE.md](HEROKU_DEPLOY_GUIDE.md)

## Configuration

### Environment Variables (Heroku)

- `TELEGRAM_BOT_TOKEN`: Your bot token
- `ADMIN_USER_ID`: Your Telegram user ID
- `BASE_PRICE`: Starting bet amount (default: 10)
- `REGISTER_LINK`: Registration link for users

### Bot Commands

- `/admin` or `/start`: Open admin panel
- Manage channels, templates, settings via inline keyboard

## How It Works

1. **Data Fetching**: Gets latest WinGo results from API
2. **Analysis**: Analyzes patterns in last 10 results
3. **Prediction**: Predicts next BIG/SMALL outcome
4. **Posting**: Sends prediction with table image to channels
5. **Result Check**: Verifies result and updates multiplier

## Troubleshooting

- **403 API Error**: API may block Heroku IPs. Headers are set to mimic browser.
- **409 Conflict**: Stop local bot instances before deploying to Heroku.
- **Image Generation**: Ensure Puppeteer buildpacks are added on Heroku.

## License

MIT License - feel free to use and modify.

## Support

For issues, check the Heroku logs or contact the developer.
