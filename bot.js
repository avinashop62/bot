const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs'); // File System module for saving config
const puppeteer = require('puppeteer'); // For generating images from HTML
const path = require('path'); // Make sure path is required

// ====================================================================
// ========================= CONFIGURATION ============================
// ====================================================================

const CONFIG_FILE = './config.json';

// Default settings - used if config.json is missing
const defaultConfig = {
    TOKEN: '7293372967:AAHnEkrXycJJj9fHAr9Ez0yIKwFXTpAM430', // ⚠️ PASTE YOUR BOT TOKEN HERE
    ADMIN_USER_ID: 6484788124, // ⚠️ CHANGE THIS TO YOUR TELEGRAM USER ID
    CHANNELS: ['@botpaymentreq'], // ⚠️ This is now a list, you can add default channels here
    API_URL: 'https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json',
    BASE_PRICE: 10,
    REGISTER_LINK: 'https://your-registration-link.com',
    WIN_MEDIA_ID: null,
    LOSE_MEDIA_ID: null,
    PREDICTION_TEMPLATE: `
🆔 <b>PERIOD:</b> <code>{period}</code>
🎲 <b>INVEST:</b> <b>{choice}</b>
💎 <b>MULTIPLY:</b> <b>{multiplier}x
💰 <b>PURCHASE PRICE:</b> ₹{price}

<a href="{register_link}"><b>👉 REGISTER & PLAY HERE 👈</b></a>
`,
    WIN_TEMPLATE: `
✅✅✅ <b>WIN</b> ✅✅✅

🎉 Congratulations to everyone who followed! 🚀

<b>Period:</b> <code>{period}</code>
<b>Result:</b> <b>{result}</b>
`,
    LOSE_TEMPLATE: `
❌❌❌ <b>LOSS</b> ❌❌❌

Don't worry, we'll recover in the next one!

<b>Period:</b> <code>{period}</code>
<b>Result:</b> <b>{result}</b>
`,
    USE_TABLE_FORMAT: true,
    MAX_TABLE_ROWS: 10 // Maximum rows before table resets
};

// --- Load/Save Config Functions ---
let config = {};
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const fileData = fs.readFileSync(CONFIG_FILE, 'utf-8');
            config = { ...defaultConfig, ...JSON.parse(fileData) };
            console.log('[CONFIG] Configuration loaded from config.json');
        } else {
            config = defaultConfig;
            saveConfig();
            console.log('[CONFIG] No config.json found. Created one with default values.');
        }
    } catch (error) {
        console.error('[ERROR] Failed to load config. Using defaults.', error);
        config = defaultConfig;
    }

    // Override with environment variables for Heroku deployment
    config.TOKEN = process.env.TELEGRAM_BOT_TOKEN || config.TOKEN;
    config.ADMIN_USER_ID = process.env.ADMIN_USER_ID ? parseInt(process.env.ADMIN_USER_ID) : config.ADMIN_USER_ID;
}

function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        console.log('[CONFIG] Configuration saved to config.json');
    } catch (error) {
        console.error('[ERROR] Failed to save config.', error);
    }
}

// ====================================================================

loadConfig();
const bot = new TelegramBot(config.TOKEN, { polling: true });

// --- Bot State ---
let lastProcessedPeriod = null;
let currentMultiplier = 1;
let currentPrice = config.BASE_PRICE;
const predictions = {};
const userState = {};

// New table management variables
let predictionTable = []; // Array to store table rows
let tableCounter = 0; // Counter to track how many predictions completed


// ====================================================================
// ===================== HTML TABLE GENERATION (FIXED) ================
// ====================================================================

function generatePredictionTableHTML() {
    const displayRows = predictionTable.slice(-config.MAX_TABLE_ROWS);

    // Check if banner.jpg exists, if not create a default banner
    const bannerPath = path.resolve(__dirname, 'banner.jpg');
    let bannerExists = fs.existsSync(bannerPath);
    
    // If banner doesn't exist, create a data URL for a default banner
    let imageUrl;
    if (bannerExists) {
        // Convert to base64 for embedding
        const imageBuffer = fs.readFileSync(bannerPath);
        const base64Image = imageBuffer.toString('base64');
        imageUrl = `data:image/jpeg;base64,${base64Image}`;
    } else {
        // Create a default banner using CSS gradient
        imageUrl = '';
        console.log('[WARNING] banner.jpg not found, using CSS gradient background');
    }

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Prediction Banner</title>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Roboto:wght@400;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Roboto', sans-serif;
            background: #f0f2f5;
        }
        .container {
            width: 900px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
            border-radius: 8px;
            overflow: hidden;
        }
        .banner {
            width: 100%;
            height: 600px;
            position: relative;
            ${bannerExists ? 
                `background-image: url('${imageUrl}');` : 
                `background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);`
            }
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
        }
        
        ${!bannerExists ? `
        .banner::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.4);
        }
        
        .banner::after {
            content: 'WINGO PREDICTION BOT';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            font-size: 48px;
            font-weight: bold;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
            font-family: 'Montserrat', sans-serif;
            letter-spacing: 3px;
            text-align: center;
            z-index: 2;
        }
        ` : ''}
        
        .info-overlay {
            position: absolute;
            bottom: 70px;
            left: 0;
            width: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            color: white;
            z-index: 3;
        }
        .info-box {
            text-align: center;
            padding: 0 40px;
        }
        .info-title {
            font-family: 'Montserrat', sans-serif;
            font-size: 16px;
            font-weight: 400;
            color: #ccc;
        }
        .info-content {
            font-family: 'Montserrat', sans-serif;
            font-size: 24px;
            font-weight: 700;
            letter-spacing: 1px;
        }
        .divider {
            height: 50px;
            width: 1px;
            background-color: #555;
        }
        .table-wrapper {
            background-color: #ffffff;
            padding-bottom: 5px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-family: 'Montserrat', sans-serif;
            color: #333;
        }
        th, td {
            padding: 12px 15px;
            border: 1px solid #ddd;
            text-align: center;
            font-size: 18px;
        }
        thead tr {
            background-color: #001f5c;
            color: #ffffff;
            font-weight: 700;
            text-transform: uppercase;
        }
        tbody tr:nth-child(even) {
            background-color: #f7f9fc;
        }
        td:nth-of-type(1) {
            font-weight: 600;
        }
        .badge {
            display: inline-block;
            padding: 6px 20px;
            border-radius: 15px;
            color: white;
            font-weight: 700;
            font-size: 16px;
        }
        .badge.win {
            background-color: #28a745;
        }
        .badge.lose {
            background-color: #dc3545;
        }
        .badge.pending {
            background-color: #ffc107;
            color: #333;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="banner">
            <div class="info-overlay">
            </div>
        </div>
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th>Period</th>
                        <th>Investment</th>
                        <th>Amount</th>
                        <th>Result</th>
                    </tr>
                </thead>
                <tbody>
                    ${displayRows.map(row => `
                        <tr>
                            <td>${row.period}</td>
                            <td>${row.investment}</td>
                            <td>₹${row.amount}</td>
                            <td><span class="badge ${row.result.toLowerCase()}">${row.result}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>`;
    return html;
}


async function generateTableImage() {
    const html = generatePredictionTableHTML();
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ]
        });
        const page = await browser.newPage();
        
        await page.setViewport({ width: 900, height: 100, deviceScaleFactor: 2 });

        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        
        // Add a delay to ensure everything renders properly
        await new Promise(resolve => setTimeout(resolve, 500));

        const element = await page.$('.container');

        if (!element) {
            console.error('[ERROR] Could not find the .container element to screenshot.');
            await browser.close();
            return null;
        }

        const imageBuffer = await element.screenshot({ type: 'png' });

        await browser.close();

        const imagePath = path.join(__dirname, `prediction_table_${Date.now()}.png`);
        fs.writeFileSync(imagePath, imageBuffer);
        console.log(`[SUCCESS] Table image generated: ${imagePath}`);
        return imagePath;
    } catch (error) {
        console.error('[ERROR] Failed to generate table image:', error);
        return null;
    }
}

// ====================================================================
// ===================== KEYBOARD LAYOUTS ===================
// ====================================================================
const keyboards = {
    main: {
        inline_keyboard: [
            [{ text: '⚙️ General Settings', callback_data: 'settings' }, { text: '📝 Message Templates', callback_data: 'templates' }],
            [{ text: '📊 Live Stats', callback_data: 'stats' }],
            [{ text: '🚨 Advanced', callback_data: 'advanced' }]
        ]
    },
    settings: {
        inline_keyboard: [
            [{ text: '📢 Manage Channels', callback_data: 'manage_channels' }],
            [{ text: '🔗 Edit Register Link', callback_data: 'edit_link' }],
            [{ text: '🖼️ Set Win/Loss Media', callback_data: 'set_media' }],
            [{ text: '💰 Set Base Price', callback_data: 'set_base_price' }],
            [{ text: '📊 Toggle Table Format', callback_data: 'toggle_table' }],
            [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]
        ]
    },
    set_media: {
        inline_keyboard: [
            [{ text: '🖼️ Set Win Media', callback_data: 'set_win_media' }],
            [{ text: '🖼️ Set Loss Media', callback_data: 'set_loss_media' }],
            [{ text: '🔙 Back to Settings', callback_data: 'settings' }]
        ]
    },
    templates: {
        inline_keyboard: [
            [{ text: 'Prediction Template', callback_data: 'edit_template_prediction' }],
            [{ text: 'Win Template', callback_data: 'edit_template_win' }],
            [{ text: 'Loss Template', callback_data: 'edit_template_loss' }],
            [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]
        ]
    },
    advanced: {
        inline_keyboard: [
            [{ text: '🔄 Reset Multiplier', callback_data: 'reset_multiplier' }],
            [{ text: '🗑️ Reset Table', callback_data: 'reset_table' }],
            [{ text: '❗️ Restart Bot', callback_data: 'restart_bot' }],
            [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]
        ]
    },
    back: (menu = 'main_menu') => ({ inline_keyboard: [[{ text: '🔙 Back', callback_data: menu }]] })
};

// ====================================================================
// ===================== CORE PREDICTION LOGIC ====================
// ====================================================================
function getBigSmall(num) { return num <= 4 ? 'SMALL' : 'BIG'; }

async function getResults() {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://draw.ar-lottery01.com/',
        'Connection': 'keep-alive'
    };
    const res = await axios.get(config.API_URL, { timeout: 10000, headers: headers });
    return res.data.data.list;
}

function analyzeLast10(list) {
    const last10 = list.slice(0, 10);
    let big = 0, small = 0;
    const results = [];

    for (let i = 0; i < last10.length; i++) {
        const r = last10[i];
        const num = parseInt(r.number, 10);
        const result = getBigSmall(num);
        results.push(result);
        if (result === 'SMALL') small++;
        else big++;
    }

    let currentBigStreak = 0;
    let currentSmallStreak = 0;

    for (let i = 0; i < results.length; i++) {
        if (results[i] === 'BIG') {
            currentBigStreak++;
            currentSmallStreak = 0;
        } else {
            currentSmallStreak++;
            currentBigStreak = 0;
        }
        if (currentBigStreak > 0 || currentSmallStreak > 0) break;
    }

    let prediction = '';
    const totalResults = big + small;
    const bigPercent = (big / totalResults) * 100;
    const smallPercent = (small / totalResults) * 100;

    if (bigPercent >= 70) prediction = 'SMALL';
    else if (smallPercent >= 70) prediction = 'BIG';
    else if (currentBigStreak >= 3) prediction = 'SMALL';
    else if (currentSmallStreak >= 3) prediction = 'BIG';
    else {
        const last5 = results.slice(0, 5);
        const last5Big = last5.filter(r => r === 'BIG').length;
        const last5Small = last5.filter(r => r === 'SMALL').length;
        if (last5Big >= 4) prediction = 'SMALL';
        else if (last5Small >= 4) prediction = 'BIG';
        else prediction = results[0] === 'BIG' ? 'SMALL' : 'BIG';
    }

    console.log(`[ANALYSIS] Prediction: ${prediction} (B:${big}/S:${small}, Streak:B${currentBigStreak}/S${currentSmallStreak})`);
    return prediction;
}

function getNextPeriod(currentPeriod) {
    return String(BigInt(String(currentPeriod)) + 1n);
}

// ====================================================================
// ===================== MESSAGING FUNCTIONS ==========================
// ====================================================================
function formatMessage(template, data) {
    let message = template;
    for (const key in data) {
        message = message.replace(new RegExp(`{${key}}`, 'g'), data[key]);
    }
    return message;
}

async function postPrediction(period, choice) {
    console.log(`[BROADCAST] Posting prediction for period ${period}: ${choice} to ${config.CHANNELS.length} channel(s).`);
    console.log(`[TABLE] Current table position: ${tableCounter % config.MAX_TABLE_ROWS + 1}/${config.MAX_TABLE_ROWS}`);

    for (const channel of config.CHANNELS) {
        try {
            let msg;

            if (config.USE_TABLE_FORMAT) {
                // Generate and send table image
                const imagePath = await generateTableImage();

                if (imagePath) {
                    msg = await bot.sendPhoto(channel, imagePath, {
                        caption: `🎯 **WINGO PREDICTION** 🎯\n\n🆔 Period: \`${period}\`\n🎲 Investment: **${choice}**\n💎 Multiplier: **${currentMultiplier}x**\n💰 Amount: ₹${currentPrice}\n\n[👉 REGISTER & PLAY HERE 👈](${config.REGISTER_LINK})`,
                        parse_mode: 'Markdown'
                    });

                    // Clean up temporary file
                    setTimeout(() => {
                        try {
                            if (fs.existsSync(imagePath)) {
                                fs.unlinkSync(imagePath);
                                console.log('[CLEANUP] Temporary image file deleted');
                            }
                        } catch (e) {
                            console.log('[CLEANUP] Could not delete temporary image file:', e.message);
                        }
                    }, 5000); // Delete after 5 seconds
                } else {
                    // Fallback to text message if image generation fails
                    console.error('[FALLBACK] Image generation failed. Sending text message instead.');
                    const text = formatMessage(config.PREDICTION_TEMPLATE, {
                        period,
                        choice,
                        multiplier: currentMultiplier,
                        price: currentPrice,
                        register_link: config.REGISTER_LINK
                    });
                    msg = await bot.sendMessage(channel, text, { parse_mode: 'HTML', disable_web_page_preview: false });
                }
            } else {
                // Send traditional text message
                const text = formatMessage(config.PREDICTION_TEMPLATE, {
                    period,
                    choice,
                    multiplier: currentMultiplier,
                    price: currentPrice,
                    register_link: config.REGISTER_LINK
                });
                msg = await bot.sendMessage(channel, text, { parse_mode: 'HTML', disable_web_page_preview: false });
            }

            // Store the first successful message ID for result checking logic
            if (!predictions[period] && msg) {
                predictions[period] = { choice, msg_id: msg.message_id, amount: currentPrice };
            }
        } catch (error) {
            console.error(`[ERROR] Failed to send prediction to channel ${channel}: ${error.message}`);
        }
    }
}

async function sendResult(isWin, period, result) {
    const mediaId = isWin ? config.WIN_MEDIA_ID : config.LOSE_MEDIA_ID;
    const template = isWin ? config.WIN_TEMPLATE : config.LOSE_TEMPLATE;
    const text = formatMessage(template, { period, result });
    console.log(`[BROADCAST] Posting result for period ${period} to ${config.CHANNELS.length} channel(s).`);

    for (const channel of config.CHANNELS) {
        try {
            if (mediaId) {
                await bot.sendAnimation(channel, mediaId);
            }
            await bot.sendMessage(channel, text, { parse_mode: 'HTML' });
        } catch (error) {
            console.error(`[ERROR] Failed to send result to channel ${channel}: ${error.message}`);
        }
    }
}

// ====================================================================
// ======================== ADMIN PANEL & HANDLERS ====================
// ====================================================================
bot.onText(/\/(admin|start)/, (msg) => {
    if (msg.from.id !== config.ADMIN_USER_ID) return;
    const text = '👋 Welcome to the Admin Control Panel.\n\nSelect an option below to manage the bot.';
    bot.sendMessage(msg.chat.id, text, { reply_markup: keyboards.main });
});

bot.on('callback_query', (query) => {
    if (query.from.id !== config.ADMIN_USER_ID) {
        return bot.answerCallbackQuery(query.id, { text: 'You are not authorized.', show_alert: true });
    }

    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    bot.answerCallbackQuery(query.id);

    // --- Channel Management Logic ---
    if (data === 'manage_channels' || data === 'add_channel' || data === 'remove_channel_prompt' || data.startsWith('remove_channel_')) {
        handleChannelManagement(chatId, messageId, data);
        return;
    }

    const actions = {
        'main_menu': () => bot.editMessageText('👋 Welcome to the Admin Control Panel.', { chat_id: chatId, message_id: messageId, reply_markup: keyboards.main }),
        'settings': () => bot.editMessageText('⚙️ Configure general bot settings.', { chat_id: chatId, message_id: messageId, reply_markup: keyboards.settings }),
        'templates': () => bot.editMessageText('📝 Edit the message templates.', { chat_id: chatId, message_id: messageId, reply_markup: keyboards.templates }),
        'advanced': () => bot.editMessageText('🚨 Advanced & Dangerous Settings.', { chat_id: chatId, message_id: messageId, reply_markup: keyboards.advanced }),
        'set_media': () => bot.editMessageText('🖼️ Set the media (GIF/Sticker) for Win/Loss messages.', { chat_id: chatId, message_id: messageId, reply_markup: keyboards.set_media }),

        'stats': () => {
            const currentTablePosition = (tableCounter % config.MAX_TABLE_ROWS) + 1;
            const currentTableNumber = Math.floor(tableCounter / config.MAX_TABLE_ROWS) + 1;
            const bannerStatus = fs.existsSync(path.resolve(__dirname, 'banner.jpg')) ? '✅ Found' : '❌ Missing';
            const statsText = `📊 <b>Live Bot Stats</b>\n\n- <b>Next Multiplier:</b> ${currentMultiplier}x\n- <b>Next Price:</b> ₹${currentPrice}\n- <b>Base Price:</b> ₹${config.BASE_PRICE}\n- <b>Channels:</b> ${config.CHANNELS.join(', ')}\n- <b>Table Format:</b> ${config.USE_TABLE_FORMAT ? 'Enabled' : 'Disabled'}\n- <b>Banner Image:</b> ${bannerStatus}\n- <b>Current Table:</b> ${currentTableNumber}\n- <b>Table Position:</b> ${currentTablePosition}/${config.MAX_TABLE_ROWS}\n- <b>Total Predictions:</b> ${tableCounter}`;
            bot.editMessageText(statsText, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: keyboards.back('main_menu') });
        },
        'edit_link': () => {
            userState[chatId] = 'awaiting_link';
            bot.editMessageText(`🔗 <b>Current Link:</b> ${config.REGISTER_LINK}\n\nPlease send the new registration link.`, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: keyboards.back('settings') });
        },
        'set_win_media': () => {
            userState[chatId] = 'awaiting_win_media';
            bot.editMessageText('🖼️ Please send a GIF/Sticker for the <b>WIN</b> message, or send /clear to remove it.', { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: keyboards.back('set_media') });
        },
        'set_loss_media': () => {
            userState[chatId] = 'awaiting_loss_media';
            bot.editMessageText('🖼️ Please send a GIF/Sticker for the <b>LOSS</b> message, or send /clear to remove it.', { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: keyboards.back('set_media') });
        },
        'set_base_price': () => {
            userState[chatId] = 'awaiting_base_price';
            bot.editMessageText(`💰 <b>Current Base Price:</b> ₹${config.BASE_PRICE}\n\nPlease send the new base price (numbers only).`, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: keyboards.back('settings') });
        },
        'toggle_table': () => {
            config.USE_TABLE_FORMAT = !config.USE_TABLE_FORMAT;
            saveConfig();
            bot.editMessageText(`📊 Table format has been ${config.USE_TABLE_FORMAT ? 'enabled' : 'disabled'}.`, { chat_id: chatId, message_id: messageId, reply_markup: keyboards.back('settings') });
        },

        'reset_multiplier': () => {
            currentMultiplier = 1;
            currentPrice = config.BASE_PRICE;
            bot.sendMessage(chatId, '✅ Multiplier and price have been manually reset to defaults.');
        },
        'reset_table': () => {
            predictionTable = [];
            tableCounter = 0;
            bot.sendMessage(chatId, '🗑️ Table has been reset. Starting fresh from Table 1.');
        },
        'restart_bot': () => {
            bot.sendMessage(chatId, '❗️ Bot is restarting...').then(() => {
                console.log('[RESTART] Restart requested by admin.');
                process.exit(1);
            });
        }
    };

    if (data.startsWith('edit_template_')) {
        const type = data.replace('edit_template_', '');
        userState[chatId] = `awaiting_template_${type}`;
        bot.editMessageText(`📝 Send new template for <b>${type.toUpperCase()}</b>.\n\n<b>Current:</b>\n<code>${config[`${type.toUpperCase()}_TEMPLATE`]}</code>`, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: keyboards.back('templates') });
        return;
    }
    if (actions[data]) { actions[data](); }
});

// --- Channel Management Function ---
function handleChannelManagement(chatId, messageId, data) {
    if (data === 'add_channel') {
        userState[chatId] = 'awaiting_add_channel';
        bot.editMessageText('➕ Please send the new channel username (e.g., @mychannel).', { chat_id: chatId, message_id: messageId, reply_markup: keyboards.back('manage_channels') });
        return;
    }

    if (data === 'remove_channel_prompt') {
        const removeKeyboard = {
            inline_keyboard: [
                ...config.CHANNELS.map(ch => [{ text: `➖ ${ch}`, callback_data: `remove_channel_${ch}` }]),
                [{ text: '🔙 Back', callback_data: 'manage_channels' }]
            ]
        };
        bot.editMessageText('➖ Click on a channel below to remove it.', { chat_id: chatId, message_id: messageId, reply_markup: removeKeyboard });
        return;
    }

    if (data.startsWith('remove_channel_')) {
        const channelToRemove = data.replace('remove_channel_', '');
        config.CHANNELS = config.CHANNELS.filter(ch => ch !== channelToRemove);
        saveConfig();
        bot.sendMessage(chatId, `✅ Channel ${channelToRemove} has been removed.`);
        // Fall through to show the main manage_channels screen again
    }

    // Default view for 'manage_channels'
    const currentChannels = config.CHANNELS.length > 0 ? config.CHANNELS.map(ch => `- <code>${ch}</code>`).join('\n') : 'No channels configured.';
    const text = `📢 <b>Channel Management</b>\n\nThe bot is currently posting to the following channels:\n${currentChannels}`;
    const keyboard = {
        inline_keyboard: [
            [{ text: '➕ Add Channel', callback_data: 'add_channel' }],
            [{ text: '➖ Remove Channel', callback_data: 'remove_channel_prompt' }],
            [{ text: '🔙 Back to Settings', callback_data: 'settings' }]
        ]
    };
    bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: keyboard });
}

bot.on('message', (msg) => {
    // This handler now ignores command-like messages if a state is set
    if (msg.from.id !== config.ADMIN_USER_ID || !userState[msg.chat.id] || (msg.text && msg.text.startsWith('/'))) {
        // Also capture media file IDs for convenience if no state is active
        if (msg.from.id === config.ADMIN_USER_ID && !userState[msg.chat.id]) {
            if (msg.animation) { bot.sendMessage(msg.chat.id, `🌠 GIF File ID:\n<code>${msg.animation.file_id}</code>`, { parse_mode: 'HTML' }); }
            if (msg.sticker) { bot.sendMessage(msg.chat.id, `🎨 Sticker File ID:\n<code>${msg.sticker.file_id}</code>`, { parse_mode: 'HTML' }); }
        }
        return;
    }

    const state = userState[msg.chat.id];
    const text = msg.text;
    let success = false;
    let successMessage = `✅ Setting updated successfully!`;

    // --- State Handling ---
    if (state === 'awaiting_add_channel' && text && text.startsWith('@')) {
        if (config.CHANNELS.includes(text)) {
            successMessage = `⚠️ Channel ${text} is already in the list.`;
        } else {
            config.CHANNELS.push(text);
            successMessage = `✅ Channel ${text} added successfully!`;
        }
        success = true;
    } else if (state === 'awaiting_link' && text) {
        config.REGISTER_LINK = text;
        success = true;
    }
    else if (state === 'awaiting_base_price' && !isNaN(text)) {
        config.BASE_PRICE = parseInt(text, 10);
        currentPrice = config.BASE_PRICE;
        currentMultiplier = 1;
        success = true;
    }
    else if (state.startsWith('awaiting_template_') && text) {
        const type = state.replace('awaiting_template_', '').toUpperCase();
        config[`${type}_TEMPLATE`] = text;
        success = true;
    }
    else if (state === 'awaiting_win_media') {
        if (msg.animation || msg.sticker) {
            config.WIN_MEDIA_ID = msg.animation?.file_id || msg.sticker?.file_id;
            success = true;
        } else if (text === '/clear') {
            config.WIN_MEDIA_ID = null;
            success = true;
        }
    }
    else if (state === 'awaiting_loss_media') {
        if (msg.animation || msg.sticker) {
            config.LOSE_MEDIA_ID = msg.animation?.file_id || msg.sticker?.file_id;
            success = true;
        } else if (text === '/clear') {
            config.LOSE_MEDIA_ID = null;
            success = true;
        }
    }

    if (success) {
        bot.sendMessage(msg.chat.id, successMessage);
        saveConfig();
        delete userState[msg.chat.id];
        bot.sendMessage(msg.chat.id, 'Returning to the main menu.', { reply_markup: keyboards.main });
    } else {
        bot.sendMessage(msg.chat.id, `❌ Invalid input. Please try again or click a "Back" button to cancel.`);
    }
});

// ====================================================================
// ================ TABLE MANAGEMENT FUNCTIONS ========================
// ====================================================================

function addPredictionToTable(period, choice, amount) {
    // Add new prediction to table (at the end for bottom position)
    predictionTable.push({
        period: period,
        investment: choice,
        amount: amount,
        result: 'PENDING'
    });

    console.log(`[TABLE] Added prediction ${period} to table. Total rows: ${predictionTable.length}`);
}

function updatePredictionResult(period, isWin) {
    // Find and update the prediction in the table
    const predictionIndex = predictionTable.findIndex(p => p.period === period);
    if (predictionIndex !== -1) {
        predictionTable[predictionIndex].result = isWin ? 'WIN' : 'LOSE';
        console.log(`[TABLE] Updated prediction ${period} with result: ${isWin ? 'WIN' : 'LOSE'}`);

        // Increment counter when a prediction is resolved
        tableCounter++;

        // Check if we need to reset the table (after 10 completed predictions)
        if (tableCounter > 0 && tableCounter % config.MAX_TABLE_ROWS === 0) {
            console.log(`[TABLE] Completed ${config.MAX_TABLE_ROWS} predictions. Resetting table.`);
            predictionTable = [];
        }
    }
}

// ====================================================================
// ======================== MAIN BOT LOOP =============================
// ====================================================================
async function mainLoop() {
    console.log('[INFO] Bot loop started. Waiting for new period...');
    console.log(`[TABLE] Table will reset every ${config.MAX_TABLE_ROWS} completed predictions`);

    while (true) {
        try {
            const data = await getResults();
            if (!data?.length) {
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }

            const latest = data[0];
            const latestCompletedPeriod = latest.issueNumber;

            if (predictions[latestCompletedPeriod]) {
                const pred = predictions[latestCompletedPeriod];
                const latestResult = getBigSmall(parseInt(latest.number, 10));
                console.log(`[CHECK] Period ${latestCompletedPeriod}: Predicted ${pred.choice}, Result ${latestResult}`);

                const isWin = pred.choice === latestResult;
                if (isWin) {
                    console.log(`[RESULT] 🎉 WIN! Period ${latestCompletedPeriod}.`);
                    await sendResult(true, latestCompletedPeriod, latestResult);
                    currentMultiplier = 1;
                    currentPrice = config.BASE_PRICE;
                } else {
                    console.log(`[RESULT] 💸 LOSE! Period ${latestCompletedPeriod}.`);
                    await sendResult(false, latestCompletedPeriod, latestResult);
                    currentMultiplier *= 2;
                    currentPrice *= 2;
                }

                // Update the prediction result in the table
                updatePredictionResult(latestCompletedPeriod, isWin);

                delete predictions[latestCompletedPeriod];
            }

            const nextPeriodToPredict = getNextPeriod(latestCompletedPeriod);
            if (latestCompletedPeriod !== lastProcessedPeriod && !predictions[nextPeriodToPredict]) {
                console.log(`[NEW] New period detected: ${latestCompletedPeriod}`);
                const choice = analyzeLast10(data);

                // Add prediction to table before posting
                addPredictionToTable(nextPeriodToPredict, choice, currentPrice);

                await postPrediction(nextPeriodToPredict, choice);
                lastProcessedPeriod = latestCompletedPeriod;
            }
        } catch (err) {
            console.error('[ERROR] Main loop error:', err.message);
        }
        await new Promise(r => setTimeout(r, 10000));
    }
}

// ====================================================================
// ========================== BOT START ==============================
// ====================================================================
console.log('🚀 Starting WinGo Prediction Bot...');

// Check banner image status
const bannerPath = path.resolve(__dirname, 'banner.jpg');
if (fs.existsSync(bannerPath)) {
    console.log('✅ Banner image found: banner.jpg');
} else {
    console.log('⚠️  Banner image not found. The bot will use a default gradient background.');
    console.log('   For best results, place a banner.jpg file in the same directory as this script.');
}

// Check if puppeteer is available
try {
    require('puppeteer');
    console.log('✅ Puppeteer is available for image generation');
} catch (error) {
    console.log('❌ Puppeteer not found. Install it with: npm install puppeteer');
    console.log('   Table format will not work without it.');
    process.exit(1); // Exit if puppeteer is not found
}

mainLoop();

process.on('SIGINT', () => {
    console.log('\n[EXIT] Bot stopped by user (Ctrl+C).');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[EXIT] Bot stopped by system.');
    process.exit(0);
});