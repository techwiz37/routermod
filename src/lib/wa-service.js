import express from 'express';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const app = express();
const PORT = process.env.WA_SERVICE_PORT || 3050;

app.use(express.json());

let waClient = null;

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: waClient ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Send message endpoint
app.post('/api/send-message', async (req, res) => {
  try {
    if (!waClient) {
      return res.status(503).json({ error: 'WhatsApp bot belum terhubung' });
    }

    const { jid, message } = req.body;

    if (!jid || !message) {
      return res.status(400).json({ error: 'jid dan message diperlukan' });
    }

    await waClient.sendMessage(jid, { text: message });
    
    res.json({ success: true, message: 'Pesan berhasil dikirim' });
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    res.status(500).json({ error: error.message });
  }
});

// Initialize WhatsApp client
export function initWaService(client) {
  waClient = client;
  
  app.listen(PORT, () => {
    console.log(`✓ WhatsApp service listening on port ${PORT}`);
  });
}

export default app;
