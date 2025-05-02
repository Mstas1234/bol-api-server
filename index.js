const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());

const CLIENT_ID = process.env.BOL_CLIENT_ID;
const CLIENT_SECRET = process.env.BOL_CLIENT_SECRET;

let cachedToken = null;
let tokenExpires = 0;

// Получение токена авторизации
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
  if (!data.access_token) throw new Error('Не удалось получить токен. Проверь CLIENT_ID и CLIENT_SECRET.');
  
  cachedToken = data.access_token;
  tokenExpires = now + (data.expires_in * 1000 - 5000);
  return cachedToken;
}

// 📦 Получение списка заказов (все заказы)
app.get('/orders', async (req, res) => {
  try {
    const token = await getToken();

    const response = await fetch('https://api.bol.com/retailer/orders?status=ALL', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.retailer.v9+json'
      }
    });

    const data = await response.json();

    if (!data.orders || !Array.isArray(data.orders) || data.orders.length === 0) {
      return res.status(200).json({ error: 'No orders found or wrong response' });
    }

    const simplified = data.orders.map(order => ({
      reference: order.reference,
      orderDate: order.orderPlacedDateTime,
      orderItemId: order.orderItems?.[0]?.orderItemId || '❌',
      ean: order.orderItems?.[0]?.ean || '❌',
      quantity: order.orderItems?.[0]?.quantity || 0,
      address: order.customerDetails?.shipmentDetails?.address,
      email: order.customerDetails?.email
    }));

    res.json(simplified);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// 📮 Подтверждение доставки
app.post('/confirm-delivery', async (req, res) => {
  const { orderId, transporterCode = 'TNT', trackAndTrace = '1234567890' } = req.body;

  try {
    const token = await getToken();

    const response = await fetch(`https://api.bol.com/retailer/orders/${orderId}/shipment`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.retailer.v9+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        shipmentReference: `DELIVERY-${orderId}`,
        transport: { transporterCode, trackAndTrace },
        shippingLabelId: null
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(400).send("Bol error: " + err);
    }

    const result = await response.json();
    res.json({ status: '✅ Delivered', bol: result });
  } catch (e) {
    res.status(500).send('Server error: ' + e.message);
  }
});

// 🔍 Получение ID по номеру заказа
app.get('/order-id', async (req, res) => {
  const reference = req.query.reference;
  if (!reference) return res.status(400).json({ error: 'Missing ?reference=' });

  try {
    const token = await getToken();

    const response = await fetch(`https://api.bol.com/retailer/orders?status=ALL`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.retailer.v9+json'
      }
    });

    const data = await response.json();
    const orderItem = data.orders?.find(order => order.customerDetails?.shipmentDetails?.reference === reference);

    if (!orderItem) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const orderItemId = orderItem.orderItems?.[0]?.orderItemId;

    res.json({ orderItemId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch order ID' });
  }
});

app.listen(3000, () => console.log('🚀 Server running on port 3000'));
