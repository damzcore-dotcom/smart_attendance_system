const prisma = require('../prismaClient');
const webPush = require('web-push');

let vapidKeysLoaded = false;

async function getOrInitVapidKeys() {
  let publicKeySetting = await prisma.settings.findUnique({ where: { key: 'vapidPublicKey' } });
  let privateKeySetting = await prisma.settings.findUnique({ where: { key: 'vapidPrivateKey' } });

  if (!publicKeySetting || !privateKeySetting) {
    console.log('[Push Notification] Generating new VAPID keys...');
    const keys = webPush.generateVAPIDKeys();
    publicKeySetting = await prisma.settings.upsert({
      where: { key: 'vapidPublicKey' },
      update: {},
      create: { key: 'vapidPublicKey', value: keys.publicKey }
    });
    privateKeySetting = await prisma.settings.upsert({
      where: { key: 'vapidPrivateKey' },
      update: {},
      create: { key: 'vapidPrivateKey', value: keys.privateKey }
    });
  }

  const publicKey = publicKeySetting.value;
  const privateKey = privateKeySetting.value;

  if (!vapidKeysLoaded) {
    webPush.setVapidDetails(
      'mailto:admin@smart-hris.local',
      publicKey,
      privateKey
    );
    vapidKeysLoaded = true;
  }

  return { publicKey, privateKey };
}

async function sendPushNotification(employeeId, title, body) {
  try {
    await getOrInitVapidKeys();

    // Find all push tokens for this employee
    const pushTokens = await prisma.pushToken.findMany({
      where: { employeeId: Number(employeeId) }
    });

    if (pushTokens.length === 0) {
      console.log(`[Push Notification] No registered push tokens for employee ID: ${employeeId}`);
      return;
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    });

    console.log(`[Push Notification] Sending notification to ${pushTokens.length} devices for employee ID: ${employeeId}`);
    
    for (const pushToken of pushTokens) {
      try {
        const subscription = JSON.parse(pushToken.token);
        await webPush.sendNotification(subscription, payload);
        console.log(`[Push Notification] Sent push notification successfully to device ID ${pushToken.id}`);
      } catch (err) {
        console.error(`[Push Notification] Failed to send push to token ID ${pushToken.id}:`, err.message);
        // If the subscription is expired or no longer exists, delete it from DB
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`[Push Notification] Removing expired/invalid token ID ${pushToken.id}`);
          await prisma.pushToken.delete({
            where: { id: pushToken.id }
          }).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error('[Push Notification] Error sending push notification:', err);
  }
}

module.exports = {
  getOrInitVapidKeys,
  sendPushNotification
};
