const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const puppeteer = require('puppeteer');
const path = require('path');

// ====================================================================
// ========================= CONFIGURATION ============================
// ====================================================================

const CONFIG_FILE = './config.json';

const defaultConfig = {
    TOKEN: process.env.TELEGRAM_BOT_TOKEN || '8029231296:AAFg3lMo6ZD5kNjU9ex_LuevjAzKMfZWAGE',
    ADMIN_USER_ID: process.env.ADMIN_USER_ID ? parseInt(process.env.ADMIN_USER_ID) : 6484788124,
    CHANNELS: ['@botpaymentreq'],
    API_URL: process.env.API_URL || 'https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json',
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
    MAX_TABLE_ROWS: 10
};

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

    config.TOKEN = process.env.TELEGRAM_BOT_TOKEN || config.TOKEN;
    config.ADMIN_USER_ID = process.env.ADMIN_USER_ID ? parseInt(process.env.ADMIN_USER_ID) : config.ADMIN_USER_ID;
    config.API_URL = process.env.API_URL || config.API_URL;
}

function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        console.log('[CONFIG] Configuration saved to config.json');
    } catch (error) {
        console.error('[ERROR] Failed to save config.', error);
    }
}

loadConfig();
const bot = new TelegramBot(config.TOKEN, { polling: true });

let lastProcessedPeriod = null;
let currentMultiplier = 1;
let currentPrice = config.BASE_PRICE;
const predictions = {};
const userState = {};
let predictionTable = [];
let tableCounter = 0;

// ====================================================================
// ===================== HTML TABLE GENERATION ========================
// ====================================================================

function generatePredictionTableHTML() {
    const displayRows = predictionTable.slice(-config.MAX_TABLE_ROWS);
    const bannerPath = path.resolve(__dirname, 'banner.jpg');
    let bannerExists = fs.existsSync(bannerPath);
    
    let imageUrl;
    if (bannerExists) {
        const imageBuffer = fs.readFileSync(bannerPath);
        const base64Image = imageBuffer.toString('base64');
        imageUrl = `data:image/jpeg;base64,${base64Image}`;
    } else {
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
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Roboto', sans-serif; background: #f0f2f5; }
        .container { width: 900px; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2); border-radius: 8px; overflow: hidden; }
        .banner {
            width: 100%; height: 600px; position: relative;
            ${bannerExists ? `background-image: url('${imageUrl}');` : `background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);`}
            background-size: cover; background-position: center; background-repeat: no-repeat;
        }
        ${!bannerExists ? `
        .banner::before { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.4); }
        .banner::after {
            content: 'WINGO PREDICTION BOT'; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            color: white; font-size: 48px; font-weight: bold; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
            font-family: 'Montserrat', sans-serif; letter-spacing: 3px; text-align: center; z-index: 2;
        }` : ''}
        .table-wrapper { background-color: #ffffff; padding-bottom: 5px; }
        table { width: 100%; border-collapse: collapse; font-family: 'Montserrat', sans-serif; color: #333; }
        th, td { padding: 12px 15px; border: 1px solid #ddd; text-align: center; font-size: 18px; }
        thead tr { background-color: #001f5c; color: #ffffff; font-weight: 700; text-transform: uppercase; }
        tbody tr:nth-child(even) { background-color: #f7f9fc; }
        td:nth-of-type(1) { font-weight: 600; }
        .badge { display: inline-block; padding: 6px 20px; border-radius: 15px; color: white; font-weight: 700; font-size: 16px; }
        .badge.win { background-color: #28a745; }
        .badge.lose { background-color: #dc3545; }
        .badge.pending { background-color: #ffc107; color: #333; }
    </style>
</head>
<body>
    <div class="container">
        <div class="banner"></div>
        <div class="table-wrapper">
            <table>
                <thead><tr><th>Period</th><th>Investment</th><th>Amount</th><th>Result</th></tr></thead>
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
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--disable-gpu']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 900, height: 100, deviceScaleFactor: 2 });
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
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
// ===================== KEYBOARD LAYOUTS =============================
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
            [{ text: '🔧 Test API Connection', callback_data: 'test_api' }],
            [{ text: '❗️ Restart Bot', callback_data: 'restart_bot' }],
            [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]
        ]
    },
    back: (menu = 'main_menu') => ({ inline_keyboard: [[{ text: '🔙 Back', callback_data: menu }]] })
};

// ====================================================================
// ===================== CORE PREDICTION LOGIC ========================
// ====================================================================

function getBigSmall(num) { return num <= 4 ? 'SMALL' : 'BIG'; }

async function getResults(retries = 3) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://draw.ar-lottery01.com/',
        'Origin': 'https://draw.ar-lottery01.com',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'DNT': '1'
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`[API] Attempt ${attempt}/${retries} - Fetching results...`);
            const res = await axios.get(config.API_URL, {
                timeout: 15000,
                headers: headers,
                maxRedirects: 5,
                validateStatus: (status) => status < 500
            });

            if (res.status === 403) {
                console.error(`[ERROR] Attempt ${attempt}/${retries}: API returned 403 - Access Forbidden`);
                if (attempt === retries) {
                    throw new Error('API blocking requests (403). Consider using a proxy or VPS.');
                }
                await new Promise(r => setTimeout(r, 2000 * attempt));
                continue;
            }

            if (res.status !== 200) {
                console.error(`[ERROR] API returned status ${res.status}`);
                if (attempt === retries) throw new Error(`API returned status: ${res.status}`);
                await new Promise(r => setTimeout(r, 2000 * attempt));
                continue;
            }

            if (res.data?.data?.list) {
                console.log(`[API] ✅ Successfully fetched ${res.data.data.list.length} results`);
                return res.data.data.list;
            } else {
                throw new Error('Invalid response format from API');
            }
        } catch (error) {
            console.error(`[ERROR] Attempt ${attempt}/${retries} failed:`, error.message);
            if (attempt === retries) throw error;
            await new Promise(r => setTimeout(r, 2000 * attempt));
        }
    }
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

function formatMessage(template, data) {
    let message = template;
    for (const key in data) {
        message = message.replace(new RegExp(`{${key}}`, 'g'), data[key]);
    }
    return message;
}

async function postPrediction(period, choice) {
    console.log(`[BROADCAST] Posting prediction for period ${period}: ${choice}`);

    for (const channel of config.CHANNELS) {
        try {
            let msg;

            if (config.USE_TABLE_FORMAT) {
                const imagePath = await generateTableImage();

                if (imagePath) {
                    msg = await bot.sendPhoto(channel, imagePath, {
                        caption: `🎯 **WINGO PREDICTION** 🎯\n\n🆔 Period: \`${period}\`\n🎲 Investment: **${choice}**\n💎 Multiplier: **${currentMultiplier}x**\n💰 Amount: ₹${currentPrice}\n\n[👉 REGISTER & PLAY HERE 👈](${config.REGISTER_LINK})`,
                        parse_mode: 'Markdown'
                    });

                    setTimeout(() => {
                        try {
                            if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
                        } catch (e) {}
                    }, 5000);
                } else {
                    const text = formatMessage(config.PREDICTION_TEMPLATE, {
                        period, choice, multiplier: currentMultiplier, price: currentPrice, register_link: config.REGISTER_LINK
                    });
                    msg = await bot.sendMessage(channel, text, { parse_mode: 'HTML', disable_web_page_preview: false });
                }
            } else {
                const text = formatMessage(config.PREDICTION_TEMPLATE, {
                    period, choice, multiplier: currentMultiplier, price: currentPrice, register_link: config.REGISTER_LINK
                });
                msg = await bot.sendMessage(channel, text, { parse_mode: 'HTML', disable_web_page_preview: false });
            }

            if (!predictions[period] && msg) {
                predictions[period] = { choice, msg_id: msg.message_id, amount: currentPrice };
            }
        } catch (error) {
            console.error(`[ERROR] Failed to send to ${channel}:`, error.message);
        }
    }
}

async function sendResult(isWin, period, result) {
    const mediaId = isWin ? config.WIN_MEDIA_ID : config.LOSE_MEDIA_ID;
    const template = isWin ? config.WIN_TEMPLATE : config.LOSE_TEMPLATE;
    const text = formatMessage(template, { period, result });

    for (const channel of config.CHANNELS) {
        try {
            if (mediaId) await bot.sendAnimation(channel, mediaId);
            await bot.sendMessage(channel, text, { parse_mode: 'HTML' });
        } catch (error) {
            console.error(`[ERROR] Failed to send result to ${channel}:`, error.message);
        }
    }
}

function addPredictionToTable(period, choice, amount) {
    predictionTable.push({ period, investment: choice, amount, result: 'PENDING' });
    console.log(`[TABLE] Added prediction ${period}. Total rows: ${predictionTable.length}`);
}

function updatePredictionResult(period, isWin) {
    const idx = predictionTable.findIndex(p => p.period === period);
    if (idx !== -1) {
        predictionTable[idx].result = isWin ? 'WIN' : 'LOSE';
        tableCounter++;
        if (tableCounter % config.MAX_TABLE_ROWS === 0) {
            console.log(`[TABLE] Resetting table after ${config.MAX_TABLE_ROWS} predictions`);
            predictionTable = [];
        }
    }
}

// ====================================================================
// ======================== ADMIN PANEL ===============================
// ====================================================================

bot.onText(/\/(admin|start)/, (msg) => {
    if (msg.from.id !== config.ADMIN_USER_ID) return;
    bot.sendMessage(msg.chat.id, '👋 Welcome to the Admin Control Panel.', { reply_markup: keyboards.main });
});

bot.on('callback_query', async (query) => {
    if (query.from.id !== config.ADMIN_USER_ID) {
        return bot.answerCallbackQuery(query.id, { text: 'Not authorized.', show_alert: true });
    }

    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    bot.answerCallbackQuery(query.id);

    if (data.startsWith('manage_channels') || data.startsWith('add_channel') || data.startsWith('remove_channel')) {
        handleChannelManagement(chatId, messageId, data);
        return;
    }

    const actions = {
        'main_menu': () => bot.editMessageText('👋 Admin Control Panel', { chat_id: chatId, message_id: messageId, reply_markup: keyboards.main }),
        'settings': () => bot.editMessageText('⚙️ Settings', { chat_id: chatId, message_id: messageId, reply_markup: keyboards.settings }),
        'templates': () => bot.editMessageText('📝 Templates', { chat_id: chatId, message_id: messageId, reply_markup: keyboards.templates }),
        'advanced': () => bot.editMessageText('🚨 Advanced Settings', { chat_id: chatId, message_id: messageId, reply_markup: keyboards.advanced }),
        'set_media': () => bot.editMessageText('🖼️ Set Media', { chat_id: chatId, message_id: messageId, reply_markup: keyboards.set_media }),
        'stats': () => {
            const stats = `📊 <b>Stats</b>\n\n- Multiplier: ${currentMultiplier}x\n- Price: ₹${currentPrice}\n- Base: ₹${config.BASE_PRICE}\n- Channels: ${config.CHANNELS.join(', ')}\n- Table: ${config.USE_TABLE_FORMAT ? 'On' : 'Off'}\n- Predictions: ${tableCounter}`;
            bot.editMessageText(stats, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: keyboards.back() });
        },
        'edit_link': () => {
            userState[chatId] = 'awaiting_link';
            bot.editMessageText(`🔗 Current: ${config.REGISTER_LINK}\n\nSend new link.`, { chat_id: chatId, message_id: messageId, reply_markup: keyboards.back('settings') });
        },
        'set_win_media': () => {
            userState[chatId] = 'awaiting_win_media';
            bot.editMessageText('🖼️ Send GIF/Sticker for WIN, or /clear', { chat_id: chatId, message_id: messageId, reply_markup: keyboards.back('set_media') });
        },
        'set_loss_media': () => {
            userState[chatId] = 'awaiting_loss_media';
            bot.editMessageText('🖼️ Send GIF/Sticker for LOSS, or /clear', { chat_id: chatId, message_id: messageId, reply_markup: keyboards.back('set_media') });
        },
        'set_base_price': () => {
            userState[chatId] = 'awaiting_base_price';
            bot.editMessageText(`💰 Current: ₹${config.BASE_PRICE}\n\nSend new price.`, { chat_id: chatId, message_id: messageId, reply_markup: keyboards.back('settings') });
        },
        'toggle_table': () => {
            config.USE_TABLE_FORMAT = !config.USE_TABLE_FORMAT;
            saveConfig();
            bot.editMessageText(`📊 Table format ${config.USE_TABLE_FORMAT ? 'enabled' : 'disabled'}`, { chat_id: chatId, message_id: messageId, reply_markup: keyboards.back('settings') });
        },
        'reset_multiplier': () => {
            currentMultiplier = 1;
            currentPrice = config.BASE_PRICE;
            bot.sendMessage(chatId, '✅ Reset complete');
        },
        'reset_table': () => {
            predictionTable = [];
            tableCounter = 0;
            bot.sendMessage(chatId, '🗑️ Table reset');
        },
        'test_api': async () => {
            bot.sendMessage(chatId, '🔧 Testing API...');
            try {
                const results = await getResults();
                bot.sendMessage(chatId, `✅ API OK!\n\n- Results: ${results.length}\n- Period: ${results[0].issueNumber}\n- Number: ${results[0].number}`);
            } catch (error) {
                bot.sendMessage(chatId, `❌ API Failed: ${error.message}`);
            }
        },
        'restart_bot': () => {
            bot.sendMessage(chatId, '❗️ Restarting...').then(() => process.exit(1));
        }
    };

    if (data.startsWith('edit_template_')) {
        const type = data.replace('edit_template_', '');
        userState[chatId] = `awaiting_template_${type}`;
        bot.editMessageText(`📝 Send new ${type} template`, { chat_id: chatId, message_id: messageId, reply_markup: keyboards.back('templates') });
        return;
    }

    if (actions[data]) actions[data]();
});

function handleChannelManagement(chatId, messageId, data) {
    if (data === 'add_channel') {
        userState[chatId] = 'awaiting_add_channel';
        bot.editMessageText('➕ Send channel username (e.g., @mychannel)', { chat_id: chatId, message_id: messageId, reply_markup: keyboards.back('manage_channels') });
        return;
    }

    if (data === 'remove_channel_prompt') {
        const removeKeyboard = {
            inline_keyboard: [
                ...config.CHANNELS.map(ch => [{ text: `➖ ${ch}`, callback_data: `remove_channel_${ch}` }]),
                [{ text: '🔙 Back', callback_data: 'manage_channels' }]
            ]
        };
        bot.editMessageText('➖ Select channel to remove', { chat_id: chatId, message_id: messageId, reply_markup: removeKeyboard });
        return;
    }

    if (data.startsWith('remove_channel_')) {
        const ch = data.replace('remove_channel_', '');
        config.CHANNELS = config.CHANNELS.filter(c => c !== ch);
        saveConfig();
        bot.sendMessage(chatId, `✅ Removed ${ch}`);
    }

    const list = config.CHANNELS.length > 0 ? config.CHANNELS.map(ch => `- <code>${ch}</code>`).join('\n') : 'None';
    const keyboard = {
        inline_keyboard: [
            [{ text: '➕ Add Channel', callback_data: 'add_channel' }],
            [{ text: '➖ Remove Channel', callback_data: 'remove_channel_prompt' }],
            [{ text: '🔙 Back', callback_data: 'settings' }]
        ]
    };
    bot.editMessageText(`📢 <b>Channels</b>\n\n${list}`, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: keyboard });
}

bot.on('message', (msg) => {
    if (msg.from.id !== config.ADMIN_USER_ID || !userState[msg.chat.id] || (msg.text && msg.text.startsWith('/'))) {
        if (msg.from.id === config.ADMIN_USER_ID && !userState[msg.chat.id]) {
            if (msg.animation) bot.sendMessage(msg.chat.id, `🌠 GIF ID:\n<code>${msg.animation.file_id}</code>`, { parse_mode: 'HTML' });
            if (msg.sticker) bot.sendMessage(msg.chat.id, `🎨 Sticker ID:\n<code>${msg.sticker.file_id}</code>`, { parse_mode: 'HTML' });
        }
        return;
    }

    const state = userState[msg.chat.id];
    const text = msg.text;
    let success = false;
    let successMessage = '✅ Updated!';

    if (state === 'awaiting_add_channel' && text && text.startsWith('@')) {
        if (!config.CHANNELS.includes(text)) {
            config.CHANNELS.push(text);
            successMessage = `✅ Added ${text}`;
        } else {
            successMessage = `⚠️ ${text} already exists`;
        }
        success = true;
    } else if (state === 'awaiting_link' && text) {
        config.REGISTER_LINK = text;
        success = true;
    } else if (state === 'awaiting_base_price' && !isNaN(text)) {
        config.BASE_PRICE = parseInt(text, 10);
        currentPrice = config.BASE_PRICE;
        currentMultiplier = 1;
        success = true;
    } else if (state.startsWith('awaiting_template_') && text) {
        const type = state.replace('awaiting_template_', '').toUpperCase();
        config[`${type}_TEMPLATE`] = text;
        success = true;
    } else if (state === 'awaiting_win_media') {
        if (msg.animation || msg.sticker) {
            config.WIN_MEDIA_ID = msg.animation?.file_id || msg.sticker?.file_id;
            success = true;
        } else if (text === '/clear') {
            config.WIN_MEDIA_ID = null;
            success = true;
        }
    } else if (state === 'awaiting_loss_media') {
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
        bot.sendMessage(msg.chat.id, 'Main menu', { reply_markup: keyboards.main });
    } else {
        bot.sendMessage(msg.chat.id, '❌ Invalid input. Try again or use Back button.');
    }
});

// ====================================================================
// ======================== MAIN BOT LOOP =============================
// ====================================================================

async function testAPIConnection() {
    console.log('='.repeat(60));
    console.log('[TEST] Testing API Connection...');
    console.log('[TEST] URL:', config.API_URL);
    console.log('='.repeat(60));
    
    try {
        const results = await getResults();
        if (results && results.length > 0) {
            console.log('[TEST] ✅ API Test PASSED!');
            console.log(`[TEST] Results: ${results.length}`);
            console.log(`[TEST] Latest Period: ${results[0].issueNumber}`);
            console.log(`[TEST] Latest Number: ${results[0].number}`);
            console.log('='.repeat(60));
            return true;
        } else {
            console.error('[TEST] ⚠️ API returned empty data');
            console.log('='.repeat(60));
            return false;
        }
    } catch (error) {
        console.error('[TEST] ❌ API Test FAILED!');
        console.error('[TEST] Error:', error.message);
        console.error('[SOLUTION] Possible fixes:');
        console.error('  1. Check API URL in config');
        console.error('  2. API might be blocking Heroku IPs');
        console.error('  3. Try using a proxy or VPS');
        console.log('='.repeat(60));
        return false;
    }
}

async function mainLoop() {
    console.log('[INFO] Bot loop started');
    console.log(`[TABLE] Resets every ${config.MAX_TABLE_ROWS} predictions`);

    let consecutiveErrors = 0;
    const MAX_ERRORS = 5;

    while (true) {
        try {
            const data = await getResults();
            consecutiveErrors = 0;
            
            if (!data?.length) {
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }

            const latest = data[0];
            const latestPeriod = latest.issueNumber;

            if (predictions[latestPeriod]) {
                const pred = predictions[latestPeriod];
                const result = getBigSmall(parseInt(latest.number, 10));
                console.log(`[CHECK] Period ${latestPeriod}: Predicted ${pred.choice}, Result ${result}`);

                const isWin = pred.choice === result;
                if (isWin) {
                    console.log(`[RESULT] 🎉 WIN! Period ${latestPeriod}`);
                    await sendResult(true, latestPeriod, result);
                    currentMultiplier = 1;
                    currentPrice = config.BASE_PRICE;
                } else {
                    console.log(`[RESULT] 💸 LOSE! Period ${latestPeriod}`);
                    await sendResult(false, latestPeriod, result);
                    currentMultiplier *= 2;
                    currentPrice *= 2;
                }

                updatePredictionResult(latestPeriod, isWin);
                delete predictions[latestPeriod];
            }

            const nextPeriod = getNextPeriod(latestPeriod);
            if (latestPeriod !== lastProcessedPeriod && !predictions[nextPeriod]) {
                console.log(`[NEW] New period: ${latestPeriod}`);
                const choice = analyzeLast10(data);
                addPredictionToTable(nextPeriod, choice, currentPrice);
                await postPrediction(nextPeriod, choice);
                lastProcessedPeriod = latestPeriod;
            }
        } catch (err) {
            consecutiveErrors++;
            console.error(`[ERROR] Loop error (${consecutiveErrors}/${MAX_ERRORS}):`, err.message);
            
            if (consecutiveErrors >= MAX_ERRORS) {
                console.error('[CRITICAL] Too many errors!');
                try {
                    await bot.sendMessage(config.ADMIN_USER_ID, `⚠️ CRITICAL: ${MAX_ERRORS} errors\n\nLast: ${err.message}`);
                } catch (e) {}
                consecutiveErrors = 0;
            }
            await new Promise(r => setTimeout(r, 15000));
        }
        await new Promise(r => setTimeout(r, 10000));
    }
}

// ====================================================================
// ========================== START ===================================
// ====================================================================

console.log('\n🚀 Starting WinGo Prediction Bot...\n');

const bannerPath = path.resolve(__dirname, 'banner.jpg');
if (fs.existsSync(bannerPath)) {
    console.log('✅ Banner image found');
} else {
    console.log('⚠️ Banner not found - using gradient');
}

try {
    require('puppeteer');
    console.log('✅ Puppeteer available');
} catch (error) {
    console.log('❌ Puppeteer not found');
    process.exit(1);
}

console.log('');

testAPIConnection().then((success) => {
    if (success) {
        console.log('[START] Starting main loop...\n');
        mainLoop();
    } else {
        console.error('[EXIT] Cannot start - API issues\n');
        process.exit(1);
    }
});

process.on('SIGINT', () => {
    console.log('\n[EXIT] Bot stopped (Ctrl+C)');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[EXIT] Bot stopped (System)');
    process.exit(0);
});
