const ZKLib = require('node-zklib');

async function diagnoseMachine() {
  const ip = '192.168.14.90';
  const port = 4370;

  console.log(`Connecting to machine ${ip}:${port}...`);
  const zk = new ZKLib(ip, port, 15000, 10000);
  try {
    await zk.createSocket();
    console.log("Connected!");

    // 1. Check machine time
    const time = await zk.getTime();
    console.log(`\n⏰ MACHINE CURRENT TIME:`, time);

    // 2. Fetch all logs
    const logs = await zk.getAttendances();
    console.log(`\n📊 Total logs on machine: ${logs?.data?.length || 0}`);

    if (logs && logs.data && logs.data.length > 0) {
      // Sort logs chronologically to find the oldest and newest
      const sortedLogs = [...logs.data].sort((a, b) => new Date(a.recordTime) - new Date(b.recordTime));
      const earliestLog = sortedLogs[0];
      const latestLog = sortedLogs[sortedLogs.length - 1];

      console.log(`\n📅 Earliest log in machine memory:`, earliestLog.recordTime);
      console.log(`📅 Latest log in machine memory:`, latestLog.recordTime);

      // Print the last 10 logs on the machine to see the current active date
      console.log(`\n📋 Last 10 logs on the machine:`);
      sortedLogs.slice(-10).forEach((l, idx) => {
        console.log(`  ${idx+1}. PIN: ${l.deviceUserId}, Name: ${l.name || l.userName || 'Unknown'}, Time: ${l.recordTime}`);
      });
    }

    await zk.disconnect();
  } catch (err) {
    console.error("Diagnosis failed:", err.message);
  }
}

diagnoseMachine();
