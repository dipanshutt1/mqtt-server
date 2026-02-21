const mqtt = require('mqtt');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// MQTT Configuration
const MQTT_BROKER = 'mqtt://broker.hivemq.com';
const MQTT_SMS_SEND_TOPIC = 'esp32/sms/send';      // ESP32 subscribes to this
const MQTT_SMS_RECEIVE_TOPIC = 'esp32/sms/receive'; // ESP32 publishes received SMS here
const MQTT_DISPLAY_TOPIC = 'esp32/display/info';    // LilyGo T-Display-S3 subscribes to this

// Connect to MQTT broker
const client = mqtt.connect(MQTT_BROKER);

// Store for incoming SMS messages
let receivedSMS = [];

let displayInfo = {
    title: 'Ready',
    message: 'No messages yet',
    color: 'info',
    timestamp: null
};

client.on('connect', () => {
    console.log('✅ Connected to MQTT broker:', MQTT_BROKER);
    console.log('📡 SMS Send Topic:', MQTT_SMS_SEND_TOPIC);
    console.log('📡 SMS Receive Topic:', MQTT_SMS_RECEIVE_TOPIC);
    console.log('📡 Display Topic:', MQTT_DISPLAY_TOPIC);

    // Subscribe to receive SMS from ESP32
    client.subscribe(MQTT_SMS_RECEIVE_TOPIC, (err) => {
        if (!err) {
            console.log('✅ Subscribed to SMS receive topic');
        }
    });
});

client.on('message', (topic, message) => {
    if (topic === MQTT_SMS_RECEIVE_TOPIC) {
        const smsData = message.toString();
        console.log('\n📨 INCOMING SMS RECEIVED FROM ESP32:');
        console.log('─'.repeat(50));
        console.log(smsData);
        console.log('─'.repeat(50) + '\n');

        // Store in memory
        receivedSMS.push({
            timestamp: new Date().toISOString(),
            message: smsData
        });

        // Keep only last 100 messages
        if (receivedSMS.length > 100) {
            receivedSMS.shift();
        }
    }
});

client.on('error', (err) => {
    console.error('❌ MQTT Error:', err.message);
});

// ============================================================
// SMS ENDPOINTS
// ============================================================

/**
 * POST /send-sms
 * Send SMS through ESP32
 * Query params: phone (or number), message (or text)
 * Example: POST /send-sms?phone=+917827396007&message=Hello
 */
app.post('/send-sms', (req, res) => {
    let phone = req.query.phone || req.query.number;
    const message = req.query.message || req.query.text;

    if (!phone || !message) {
        return res.status(400).json({
            error: 'Missing parameters',
            required: ['phone (or number)', 'message (or text)'],
            example: '/send-sms?phone=917827396007&message=Hello'
        });
    }

    // Add + prefix if missing
    if (!phone.startsWith('+')) {
        phone = '+' + phone;
    }

    // Create SMS payload
    const smsPayload = JSON.stringify({
        phone: phone,
        message: message,
        timestamp: new Date().toISOString()
    });

    console.log('\n📤 SENDING SMS VIA MQTT:');
    console.log('─'.repeat(50));
    console.log('Phone:', phone);
    console.log('Message:', message);
    console.log('─'.repeat(50) + '\n');

    // Publish to ESP32
    client.publish(MQTT_SMS_SEND_TOPIC, smsPayload, (err) => {
        if (err) {
            console.error('❌ Failed to publish SMS:', err);
            return res.status(500).json({ error: 'Failed to send SMS' });
        }

        res.json({
            success: true,
            message: 'SMS sent to ESP32',
            phone: phone,
            text: message
        });
    });
});

/**
 * GET /get-sms
 * Retrieve received SMS messages
 */
app.get('/get-sms', (req, res) => {
    const latest = receivedSMS.pop();
    res.json({
        count: receivedSMS.length,
        messages: latest
    });
});

/**
 * GET /get-sms/:index
 * Get specific SMS by index
 */
app.get('/get-sms/:index', (req, res) => {
    const index = parseInt(req.params.index);

    if (index < 0 || index >= receivedSMS.length) {
        return res.status(404).json({
            error: 'SMS not found',
            available: receivedSMS.length
        });
    }

    res.json(receivedSMS[index]);
});

/**
 * DELETE /get-sms
 * Clear all received SMS
 */
app.delete('/get-sms', (req, res) => {
    const count = receivedSMS.length;
    receivedSMS = [];

    res.json({
        success: true,
        message: `Cleared ${count} messages`
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        mqtt: client.connected ? 'connected' : 'disconnected',
        broker: MQTT_BROKER,
        receivedSMSCount: receivedSMS.length
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'ESP32-SIM800L SMS Gateway',
        status: 'running',
        endpoints: {
            'POST /send-sms': {
                description: 'Send SMS through ESP32',
                example: '/send-sms?phone=+917827396007&message=Hello%20World',
                params: ['phone (required)', 'message (required)']
            },
            'GET /get-sms': {
                description: 'Get the latest received SMS only',
                example: '/get-sms'
            },
            'GET /get-sms/:index': {
                description: 'Get specific SMS by index',
                example: '/get-sms/0'
            },
            'DELETE /get-sms': {
                description: 'Clear all received SMS',
                example: 'DELETE /get-sms'
            },
            'GET /health': {
                description: 'Check service health'
            }
        }
    });
});

// Legacy endpoints for backward compatibility
// Simple GET endpoint to send message via URL
app.get('/send/:message', (req, res) => {
    const message = req.params.message;

    client.publish(MQTT_SMS_SEND_TOPIC, message, (err) => {
        if (err) {
            console.error('❌ Failed to publish:', err);
            return res.status(500).json({ error: 'Failed to publish message' });
        }

        console.log('📤 Published:', message);
        res.json({ success: true, message: `Sent: ${message}` });
    });
});

/**
 * POST /push-info
 * Push information to LilyGo T-Display-S3 via MQTT
 * Query params: title, message, color (optional: info/warn/error/success)
 * Example: POST /push-info?title=Alert&message=Hello%20World&color=info
 */
app.post('/push-info', (req, res) => {
    const title = req.query.title || req.body.title || 'Info';
    const message = req.query.message || req.body.message;
    const color = req.query.color || req.body.color || 'info';

    if (!message) {
        return res.status(400).json({
            error: 'Missing message parameter',
            required: ['message'],
            optional: ['title', 'color (info/warn/error/success)'],
            example: '/push-info?title=Alert&message=Hello%20World&color=info'
        });
    }

    // Create display payload
    const displayPayload = JSON.stringify({
        title: title,
        message: message,
        color: color,
        timestamp: new Date().toISOString()
    });

    console.log('\n📺 PUSHING INFO TO DISPLAY:');
    console.log('─'.repeat(50));
    console.log('Title:', title);
    console.log('Message:', message);
    console.log('Color:', color);
    console.log('─'.repeat(50) + '\n');
    displayInfo = {
        title: title,
        message: message,
        color: color,
        timestamp: new Date().toISOString()
    };
    // Publish to LilyGo display
    client.publish(MQTT_DISPLAY_TOPIC, displayPayload, (err) => {
        if (err) {
            console.error('❌ Failed to publish to display:', err);
            return res.status(500).json({ error: 'Failed to push info to display' });
        }

        res.json({
            success: true,
            message: 'Info pushed to display',
            data: {
                title: title,
                message: message,
                color: color
            }
        });
    });
});

app.get('/get-info', (req, res) => {
    res.json({
        success: true,
        data: displayInfo
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════════════════╗`);
    console.log(`║   ESP32-SIM800L SMS Gateway via MQTT                 ║`);
    console.log(`║   Server running on http://localhost:${PORT}               ║`);
    console.log(`╚══════════════════════════════════════════════════════╝`);
    console.log(`\n📚 API Documentation:\n`);
    console.log(`   🔴 POST /send-sms`);
    console.log(`      Send SMS: /send-sms?phone=+917827396007&message=Hello`);
    console.log(`\n   🔵 GET /get-sms`);
    console.log(`      Get latest received SMS only\n`);
    console.log(`   🟢 DELETE /get-sms`);
    console.log(`      Clear received SMS\n`);
    console.log(`   ⚪ GET /health`);
    console.log(`      Check service status\n`);
    console.log(`Visit http://localhost:${PORT} for full API details\n`);
});

