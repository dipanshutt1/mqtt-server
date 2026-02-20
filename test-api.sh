#!/bin/bash

# Quick Start Testing Script for MQTT SMS Gateway

echo "╔════════════════════════════════════════════════════════╗"
echo "║  ESP32-S3 + SIM800L MQTT SMS Gateway - Quick Test      ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Check if server is running
echo "🔍 Checking if server is running..."
curl -s http://localhost:3000/health > /dev/null
if [ $? -eq 0 ]; then
    echo "✅ Server is running!"
else
    echo "❌ Server is not running!"
    echo "Start it with: cd mqtt-server && npm start"
    exit 1
fi

echo ""
echo "📡 Server Status:"
curl -s http://localhost:3000/health | jq '.'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing SMS Sending API..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Send test SMS
PHONE="+917827396007"
MESSAGE="Test message from MQTT API"

echo "Sending SMS to: $PHONE"
echo "Message: $MESSAGE"
echo ""

curl -X POST "http://localhost:3000/send-sms?phone=$PHONE&message=$MESSAGE" | jq '.'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Checking Received SMS..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

curl -s http://localhost:3000/get-sms | jq '.'

echo ""
echo "✅ Test Complete!"
echo ""
echo "📚 Next Steps:"
echo "   1. Edit src/sim800l_mqtt_sms.cpp to add your WiFi credentials"
echo "   2. Upload firmware with: platformio run --target upload"
echo "   3. Check serial monitor: platformio device monitor"
echo "   4. Send SMS via: curl -X POST 'http://localhost:3000/send-sms?phone=%2B917827396007&message=Hello'"
echo ""
