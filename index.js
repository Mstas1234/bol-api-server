const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());

const CLIENT_ID = '45ae9cf4-8514-4514-9236-8fa11ee62555';
const CLIENT_SECRET = 'P4pqyD80GsEdJMRpwgYwyV8!+rwnwp5YfwhwN(qlnZPMN)Ezff9eUwH+?P6Alp2N';

let cachedToken = null;
let tokenExpires = 0;

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
  cachedToken = data.access_token;
  tokenExpires = now + (data.expires_in * 1000 - 5000);
  return cachedToken;
}

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
app.get('/orders', async (req, res) => {
  try {
    const token = await getToken(); // 🔑 Берём ключ доступа

    const response = await fetch('https://api.bol.com/retailer/orders?status=OPEN', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`, // 🪪 Ключ отправляем
        'Accept': 'application/vnd.retailer.v9+json'
      }
    });

    const data = await response.json(); // 📥 Ответ от Bol

    // 🎁 Собираем только нужную информацию
    const simplified = data.orders.map(order => ({
      reference: order.reference,
      orderDate: order.orderPlacedDateTime,
      orderItemId: order.orderItems[0]?.orderItemId,
      ean: order.orderItems[0]?.ean,
      quantity: order.orderItems[0]?.quantity,
      address: order.customerDetails?.shipmentDetails?.address,
      email: order.customerDetails?.email
    }));

    res.json(simplified); // ⬅️ Отдаём тебе список заказов
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.listen(3000, () => console.log('Server running'));
