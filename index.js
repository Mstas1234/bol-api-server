const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());

const CLIENT_ID = process.env.BOL_CLIENT_ID;
const CLIENT_SECRET = process.env.BOL_CLIENT_SECRET;

let cachedToken = null;
let tokenExpires = 0;

// 🔐 Получение токена
async function getToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpires) return cachedToken;

  const res = await fetch('https://login.bol.com/token?grant_type=client_credentials', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: ''
  });

  const data = await res.json();
  if (!data.access_token) throw new Error('Не удалось получить токен: ' + JSON.stringify(data));
  cachedToken = data.access_token;
  tokenExpires = now + (data.expires_in * 1000 - 5000);
  return cachedToken;
}

// 📦 Получение отправлений
app.get('/shipments', async (req, res) => {
  try {
    const token = await getToken();

    const response = await fetch('https://api.bol.com/retailer/shipments', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.retailer.v9+json'
      }
    });

    const data = await response.json();

    if (!data.shipments || !Array.isArray(data.shipments)) {
      return res.status(200).json([]);
    }

    const simplified = data.shipments.map(s => {
      const item = s.orderItems?.[0] || {};
      const transport = s.transport || {};
      return {
        shipmentId: s.shipmentId || '❌',
        shipmentDateTime: s.shipmentDateTime || '❌',
        orderItemId: item.orderItemId || '❌',
        ean: item.ean || '❌',
        transporterCode: transport.transporterCode || '❌',
        trackAndTrace: transport.trackAndTrace || '❌',
        shipmentReference: s.shipmentReference || '❌'
      };
    });

    res.json(simplified);
  } catch (err) {
    console.error('Ошибка при получении отправлений:', err);
    res.status(500).json({ error: 'Ошибка при получении отправлений' });
  }
});

app.listen(3000, () => console.log('🚀 Server running on port 3000'));
