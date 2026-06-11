const checkTimezone = require('../utils/timezoneCheck');

/**
 * WhatsApp Notification Service
 * Uses Fonnte API Gateway (or mock console log if not configured)
 */
const sendWAMessage = async (phone, message) => {
  const apiKey = process.env.WA_API_KEY;
  const sender = process.env.WA_SENDER; // Optional for some gateways

  // Normalize phone number (e.g. replace leading 0 with 62)
  let formattedPhone = phone ? String(phone).trim() : '';
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '62' + formattedPhone.slice(1);
  }
  // Remove any non-numeric characters
  formattedPhone = formattedPhone.replace(/\D/g, '');

  if (!formattedPhone) {
    console.error('[WhatsAppService] Error: Phone number is empty or invalid');
    return { success: false, error: 'Phone number invalid' };
  }

  // If API key is not configured, run in Mock Mode for development
  if (!apiKey || apiKey === 'MOCK' || apiKey.trim() === '') {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║ 📱 [MOCK WHATSAPP NOTIFICATION SENT]                      ║');
    console.log(`║ Ke   : +${formattedPhone}                                   `);
    console.log('║ Pesan:                                                    ║');
    console.log(message.split('\n').map(line => `║   ${line}`).join('\n'));
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    return { success: true, mock: true };
  }

  try {
    console.log(`[WhatsAppService] Sending message to +${formattedPhone}...`);
    
    // Fonnte API Integration
    const response = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target: formattedPhone,
        message: message,
        countryCode: '62' // default fallback
      })
    });

    const result = await response.json();
    
    if (response.ok && result.status === true) {
      console.log(`[WhatsAppService] Successfully sent to +${formattedPhone}. ID: ${result.id || 'N/A'}`);
      return { success: true, id: result.id };
    } else {
      console.error('[WhatsAppService] Failed to send. API Response:', result);
      return { success: false, error: result.reason || 'Unknown API gateway error' };
    }
  } catch (err) {
    console.error('[WhatsAppService] Error sending HTTP request:', err);
    return { success: false, error: err.message };
  }
};

module.exports = {
  sendWAMessage
};
