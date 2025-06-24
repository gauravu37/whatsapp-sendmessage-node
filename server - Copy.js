const express = require('express');
const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

let qrCodeImage = null;

const client = new Client();

client.on('qr', async (qr) => {
    console.log('QR Received');
    qrCodeImage = await qrcode.toDataURL(qr);
});

client.on('ready', () => {
    console.log('WhatsApp is ready!');
    qrCodeImage = null; // QR not needed anymore
});

client.initialize();

// Serve QR code
app.get('/', (req, res) => {
    if (qrCodeImage) {
        res.send(`
            <html>
                <body style="text-align:center;">
                    <h2>Scan this QR with your WhatsApp</h2>
                    <img src="${qrCodeImage}" />
                </body>
            </html>
        `);
    } else {
        res.send('<h2>WhatsApp is already connected or QR not available</h2>');
    }
});

// API to send message
app.post('/send-message', async (req, res) => {
    const { number, message } = req.body;
    try {
        await client.sendMessage(`${number}@c.us`, message);
        res.json({ status: 'success', message: 'Message sent!' });
    } catch (err) {
        res.json({ status: 'error', error: err.toString() });
    }
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
