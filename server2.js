const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

let qrCodeImage = null;
let isClientReady = false; // ✅ track client state

// Initialize WhatsApp client with persistent session
const client = new Client({
    authStrategy: new LocalAuth()
});

// QR Code event
client.on('qr', async (qr) => {
    console.log('📱 QR Received');
    qrCodeImage = await qrcode.toDataURL(qr);
});

// Ready event
client.on('ready', () => {
    console.log('✅ WhatsApp is ready!');
    qrCodeImage = null;
    isClientReady = true;
});

// Disconnected event
client.on('disconnected', () => {
    console.log('❌ WhatsApp disconnected');
    isClientReady = false;
});

client.initialize();

// Helper: format numbers
const formatNumber = (number) => {
    // Already formatted for WhatsApp
    if (number.includes('@c.us') || number.includes('@g.us')) return number;
    return `${number}@c.us`; // default personal chat
};

// Serve QR code
app.get('/', (req, res) => {
    if (qrCodeImage) {
        res.send(`
            <html>
                <body style="text-align:center; font-family:sans-serif;">
                    <h2>Scan this QR with your WhatsApp</h2>
                    <img src="${qrCodeImage}" />
                </body>
            </html>
        `);
    } else {
        res.send('<h2>✅ WhatsApp is already connected or QR not available</h2>');
    }
});

// Check status
app.get('/status', (req, res) => {
    res.json({
        ready: isClientReady,
        qr: qrCodeImage ? true : false
    });
});

// Send message API
app.post('/send-message', async (req, res) => {
    const { number, message } = req.body;

    if (!isClientReady) {
        return res.status(503).json({ status: 'error', error: 'WhatsApp client not ready. Scan QR first.' });
    }

    if (!number || !message) {
        return res.status(400).json({ status: 'error', error: 'Missing number or message' });
    }

    try {
        const formattedNumber = formatNumber(number);

        // Check if number exists on WhatsApp
        const isRegistered = await client.isRegisteredUser(formattedNumber);
        if (!isRegistered) {
            return res.status(400).json({ status: 'error', error: 'Number is not on WhatsApp' });
        }

        await client.sendMessage(formattedNumber, message);
        res.status(200).json({ status: 'success', message: 'Message sent!' });
    } catch (err) {
        console.error("❌ Error sending message:", err);
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// Start server
app.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));
