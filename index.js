// index.js
const { Client } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');
const app = express();
app.use(express.json());

const client = new Client();

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp is ready!');
});

client.initialize();

app.post('/send-message', async (req, res) => {
    const { number, message } = req.body;
    try {
        const chatId = number + "@c.us"; // Use @c.us for standard WhatsApp
        await client.sendMessage(chatId, message);
        res.send({ status: 'success' });
    } catch (error) {
        res.send({ status: 'error', error });
    }
});

app.listen(3000, () => console.log('Server is running on port 3000'));