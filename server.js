require('dotenv').config(); // load env variables

const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');

const app = express();
app.use(express.json());

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS || '*'
}));

const clients = {}; // store clients by number
const qrCodes = {}; // store QR codes

// Sessions path
const getSessionPath = (number) => path.join(process.env.SESSION_PATH || __dirname, 'sessions', number);

// Create a new WhatsApp client
const createClient = (number) => {
    if (clients[number]) return clients[number]; // already running

    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: number,
            dataPath: getSessionPath(number)
        }),
        puppeteer: {
            executablePath: '/usr/bin/google-chrome-stable', // ✅ use installed Chrome
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--single-process'
            ]
        }
    });

    client.on('qr', async (qr) => {
        const qrImage = await qrcode.toDataURL(qr);
        qrCodes[number] = qrImage;
        console.log(`📲 QR generated for ${number}`);
    });

    client.on('ready', () => {
        console.log(`✅ WhatsApp ready for ${number}`);
        qrCodes[number] = null;
    });

    client.on('disconnected', async () => {
        console.log(`❌ Client disconnected: ${number}`);
        delete clients[number];
        delete qrCodes[number];
    });

    client.initialize();
    clients[number] = client;
    return client;
};

// Route: Scan QR
app.get('/scan/:number', async (req, res) => {
    const number = req.params.number;
    createClient(number);

    let retries = 0;
    const interval = setInterval(() => {
        retries++;

        if (qrCodes[number]) {
            clearInterval(interval);
            res.send(`
                <html>
                    <body style="text-align:center;">
                        <h2>Scan WhatsApp QR for ${number}</h2>
                        <img src="${qrCodes[number]}" />
                    </body>
                </html>
            `);
        } else if (retries >= 20) {
            clearInterval(interval);
            res.send(`<h2>WhatsApp is already connected or QR not ready for ${number}</h2>`);
        }
    }, 500);
});

// Route: Send Message
app.post('/send-message', async (req, res) => {
    const { number, to, message } = req.body;

    if (!clients[number]) {
        return res.status(400).json({ error: 'Client not initialized for this number' });
    }

    try {
        const chatId = `${to}@c.us`;
        await clients[number].sendMessage(chatId, message);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.toString() });
    }
});

// Route: Reset session
app.get('/reset/:number', async (req, res) => {
    const number = req.params.number;
    const sessionPath = getSessionPath(number);

    try {
        await fs.remove(sessionPath);
        if (clients[number]) {
            await clients[number].destroy();
            delete clients[number];
            delete qrCodes[number];
        }
        res.send(`Session for ${number} has been reset. Visit /scan/${number} to reconnect.`);
    } catch (e) {
        res.status(500).send(`Error resetting session: ${e}`);
    }
});

// Route: Check status
app.get('/status/:number', async (req, res) => {
    const number = req.params.number;
    const client = clients[number];

    if (client && client.info && client.info.wid) {
        res.json({ status: 'connected', wid: client.info.wid.user });
    } else {
        res.json({ status: 'not_connected' });
    }
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`👉 Using Chrome: /usr/bin/google-chrome-stable`);
});
