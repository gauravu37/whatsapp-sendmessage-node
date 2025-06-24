const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

const clients = {}; // Store clients by number
const qrCodes = {}; // Store QR codes by number

// Get session path
const getSessionPath = (number) => path.join(__dirname, 'sessions', number);

// Create client
const createClient = (number) => {
    if (clients[number]) return clients[number]; // already exists

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: number, dataPath: getSessionPath(number) }),
    });

    client.on('qr', async (qr) => {
        const qrImage = await qrcode.toDataURL(qr);
        qrCodes[number] = qrImage;
        console.log(`QR generated for ${number}`);
    });

    client.on('ready', () => {
        console.log(`WhatsApp ready for ${number}`);
        qrCodes[number] = null;
    });

    client.initialize();
    clients[number] = client;
    return client;
};

// Route to scan QR
app.get('/scan/:number', async (req, res) => {
    const number = req.params.number;

    createClient(number);

    // Wait until QR is ready or timeout
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
        } else if (retries >= 60) { // wait max 10 seconds
            clearInterval(interval);
            res.send(`<h2>WhatsApp is already connected or QR not ready for ${number}</h2>`);
        }

    }, 500); // check every 500ms
});


// API to send message
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


app.get('/reset/:number', async (req, res) => {
    const number = req.params.number;
    const sessionPath = getSessionPath(number);

    try {
        await fs.remove(sessionPath); // delete session
        if (clients[number]) {
            await clients[number].destroy(); // stop client
            delete clients[number];
            delete qrCodes[number];
        }
        res.send(`Session for ${number} has been reset. Visit /scan/${number} to reconnect.`);
    } catch (e) {
        res.status(500).send(`Error resetting session: ${e}`);
    }
});

app.get('/status/:number', async (req, res) => {
    const number = req.params.number;
    const client = clients[number];

    if (client && client.info && client.info.wid) {
        res.json({ status: 'connected', wid: client.info.wid.user });
    } else {
        res.json({ status: 'not_connected' });
    }
});


app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});



