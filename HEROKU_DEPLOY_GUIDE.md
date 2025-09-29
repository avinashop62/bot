# Heroku Deployment Guide for Telegram Bot

This guide will help you deploy your Telegram bot to Heroku.

## Prerequisites

1. **Heroku Account**: Sign up at [heroku.com](https://heroku.com) if you don't have one.
2. **Heroku CLI**: Download and install from [devcenter.heroku.com/articles/heroku-cli](https://devcenter.heroku.com/articles/heroku-cli).
3. **Git**: Ensure Git is installed on your system.

## Step 1: Prepare Your Code

Your project is already prepared with:
- `Procfile` for Heroku worker process
- `.gitignore` to exclude sensitive files
- Updated `bot.js` to use environment variables

## Step 2: Initialize Git Repository

If not already done:

```bash
git init
git add .
git commit -m "Initial commit for Heroku deployment"
```

## Step 3: Login to Heroku

```bash
heroku login
```

## Step 4: Create Heroku App

```bash
heroku create your-app-name
```

Replace `your-app-name` with a unique name for your app.

## Step 5: Add Required Buildpacks

Heroku needs special buildpacks for Puppeteer (Chrome):

```bash
heroku buildpacks:add heroku/nodejs
heroku buildpacks:add heroku/google-chrome
heroku buildpacks:add jontewks/puppeteer
```

## Step 6: Set Environment Variables

Set your sensitive data as environment variables:

```bash
heroku config:set TELEGRAM_BOT_TOKEN=your_bot_token_here
heroku config:set ADMIN_USER_ID=your_telegram_user_id_here
```

Replace with your actual values:
- `TELEGRAM_BOT_TOKEN`: Your bot token from @BotFather
- `ADMIN_USER_ID`: Your Telegram user ID (numeric)

Optional: Set other config variables if needed:
```bash
heroku config:set BASE_PRICE=10
heroku config:set REGISTER_LINK=https://your-link.com
```

## Step 7: Deploy to Heroku

```bash
git push heroku main
```

If your branch is not `main`, use `master` or your branch name.

## Step 8: Scale the Worker

Since this is a bot (not a web app), scale the worker process:

```bash
heroku ps:scale worker=1
```

## Step 9: Check Logs

Monitor your bot:

```bash
heroku logs --tail
```

## Step 10: Verify Deployment

- Send `/admin` or `/start` to your bot from your admin user ID.
- Check if the bot responds and starts posting predictions.

## Troubleshooting

- **Bot not responding**: Check if `TELEGRAM_BOT_TOKEN` and `ADMIN_USER_ID` are set correctly.
- **Puppeteer errors**: Ensure buildpacks are added in the correct order.
- **Config issues**: The bot will use `config.json` for non-sensitive settings, overridden by env vars.

## Updating the Bot

To deploy updates:

```bash
git add .
git commit -m "Update message"
git push heroku main
```

The worker will automatically restart.

## Notes

- Heroku free tier has limitations; consider upgrading for production use.
- The bot uses polling, which is fine for Heroku.
- Sensitive data is now in environment variables, not in code.
