require('dotenv').config();

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

const clients = {};   // store clients by number
const qrCodes = {};   // store QR codes by number

// Session storage path
const getSessionPath = (number) =>
  path.join(process.env.SESSION_PATH || __dirname, 'sessions', number);

// Try to detect Chrome path automatically
const detectChromePath = () => {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium'
  ];
  return candidates.find(p => p && fs.existsSync(p));
};

// Create a WhatsApp client
const createClient = (number) => {
  if (clients[number]) return clients[number];

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: number,
      dataPath: getSessionPath(number)
    }),
    puppeteer: {
      headless: process.env.HEADLESS !== 'false',
      executablePath: detectChromePath(),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-gpu',
        '--single-process',
        '--no-zygote'
      ]
    }
  });

  client.on('qr', async (qr) => {
    qrCodes[number] = await qrcode.toDataURL(qr);
    console.log(`📲 QR generated for ${number}`);
  });

  client.on('authenticated', () => {
    console.log(`🔑 Authenticated for ${number}`);
  });

  client.on('auth_failure', (msg) => {
    console.error(`❌ Auth failure for ${number}:`, msg);
    delete clients[number];
    delete qrCodes[number];
  });

  client.on('ready', () => {
    console.log(`✅ WhatsApp ready for ${number}`);
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
      res.send(`<h2>WhatsApp already connected or QR not ready for ${number}</h2>`);
    }
  }, 500);
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
    res.json({ success: true, sent: { from: number, to, message } });
  } catch (error) {
    res.status(500).json({ error: error.toString() });
  }
});

// Reset session
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

// Status
app.get('/status/:number', async (req, res) => {
  const number = req.params.number;
  const client = clients[number];

  if (client && client.info && client.info.wid) {
    res.json({ status: 'connected', wid: client.info.wid.user });
  } else if (qrCodes[number]) {
    res.json({ status: 'qr_pending' });
  } else {
    res.json({ status: 'not_connected' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
