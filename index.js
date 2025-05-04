const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());

const CLIENT_ID = process.env.BOL_CLIENT_ID;
const CLIENT_SECRET = process.env.BOL_CLIENT_SECRET;

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
  if (!data.access_token) throw new Error('Token error: ' + JSON.stringify(data));

  cachedToken = data.access_token;
  tokenExpires = now + (data.expires_in * 1000 - 5000);
  return cachedToken;
}

// 🔍 Получить доставленные заказы (SHIPPED)
app.get('/delivered', async (req, res) => {
  try {
    const token = await getToken();
    let allDelivered = [];
    let page = 1;
    let totalPages = 1;

    do {
      const response = await fetch(`https://api.bol.com/retailer/orders?status=ALL&page=${page}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.retailer.v9+json'
        }
      });

      const data = await response.json();
      if (!data.orders || !Array.isArray(data.orders)) break;

      const delivered = data.orders.filter(order => order.fulfilment?.status === 'SHIPPED');
      const simplified = delivered.map(order => ({
        orderDate: order.orderPlacedDateTime,
        orderItemId: order.orderItems[0]?.orderItemId,
        ean: order.orderItems[0]?.ean,
        quantity: order.orderItems[0]?.quantity,
        reference: order.customerDetails?.shipmentDetails?.reference,
        address: order.customerDetails?.shipmentDetails?.address,
        email: order.customerDetails?.email
      }));

      allDelivered.push(...simplified);

      if (page === 1 && data.pagination) {
        const totalItems = data.pagination.total;
        const pageSize = data.pagination.itemsPerPage;
        totalPages = Math.ceil(totalItems / pageSize);
      }

      page++;
    } while (page <= totalPages);

    res.json(allDelivered);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch delivered orders' });
  }
});

app.listen(3000, () => console.log('🚀 Server running on port 3000'));
