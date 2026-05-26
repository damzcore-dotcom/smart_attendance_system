/**
 * ZKTeco Protocol Helper
 * Custom wrapper functions built on top of node-zklib's executeCmd
 * Reference: https://github.com/adrobinoga/zk-protocol
 */

const ZKLib = require('node-zklib');
const { COMMANDS, REQUEST_DATA } = require('../../node_modules/node-zklib/constants');
const { createTCPHeader, removeTcpHeader, decodeTCPHeader, decodeUserData72 } = require('../../node_modules/node-zklib/utils');

// ============================================================
// CONNECTION HELPER
// ============================================================

/**
 * Create a connected ZKLib instance with proper error handling
 * @param {string} ip 
 * @param {number} port 
 * @param {number} timeout 
 * @returns {ZKLib}
 */
async function createConnection(ip, port = 4370, timeout = 10000) {
  const zk = new ZKLib(ip, port, timeout);
  await zk.createSocket();
  return zk;
}

/**
 * Safely disconnect from device
 * @param {ZKLib} zk 
 */
async function safeDisconnect(zk) {
  try {
    if (zk) await zk.disconnect();
  } catch (e) {
    // Ignore disconnect errors
  }
}

// ============================================================
// SET USER (Write user info to device)
// Protocol: CMD_USER_WRQ (8)
// ============================================================

/**
 * Write/update a user on the device
 * Packet format (72 bytes) matching decodeUserData72:
 *   bytes 0-1:   uid (uint16LE) - internal serial number
 *   byte 2:      role (uint8) - 0=normal, 6=admin, 14=super admin
 *   bytes 3-10:  password (8 bytes, null-padded)
 *   bytes 11-34: name (24 bytes, null-padded)
 *   bytes 35-38: cardno (uint32LE)
 *   bytes 39-47: group/timezone info
 *   bytes 48-56: userId/badge (9 bytes, null-padded)
 *   bytes 57-71: padding
 * 
 * @param {ZKLib} zk - Connected ZKLib instance
 * @param {number} uid - Internal index (serial number) on device
 * @param {string} userId - Badge/PIN number (visible ID, max 9 chars)
 * @param {string} name - User name (max 24 chars)
 * @param {string} password - Password (max 8 chars, optional)
 * @param {number} role - 0=normal, 6=admin
 * @param {number} cardno - Card number (optional)
 */
async function setUser(zk, uid, userId, name, password = '', role = 0, cardno = 0) {
  const buf = Buffer.alloc(72, 0);
  
  // uid - internal serial number (2 bytes LE)
  buf.writeUInt16LE(uid, 0);
  
  // role (1 byte)
  buf.writeUInt8(role, 2);
  
  // password (8 bytes, null-padded)
  const pwdBuf = Buffer.from(password.substring(0, 8), 'ascii');
  pwdBuf.copy(buf, 3);
  
  // name (24 bytes, null-padded)
  const nameBuf = Buffer.from(name.substring(0, 24), 'ascii');
  nameBuf.copy(buf, 11);
  
  // card number (4 bytes LE)
  buf.writeUInt32LE(cardno, 35);
  
  // group (default 0)
  buf.writeUInt8(0, 39);
  
  // userId/badge (9 bytes, null-padded) - this is the visible PIN
  const userIdBuf = Buffer.from(userId.substring(0, 9), 'ascii');
  userIdBuf.copy(buf, 48);

  // Disable device -> Write user -> Refresh -> Enable
  await zk.executeCmd(COMMANDS.CMD_DISABLEDEVICE, REQUEST_DATA.DISABLE_DEVICE);
  await zk.executeCmd(COMMANDS.CMD_USER_WRQ, buf);
  await zk.executeCmd(COMMANDS.CMD_REFRESHDATA, '');
  await zk.executeCmd(COMMANDS.CMD_ENABLEDEVICE, '');
  
  return true;
}

// ============================================================
// DELETE USER (Remove user from device)
// Protocol: CMD_DELETE_USER (18)
// ============================================================

/**
 * Delete a user from the device
 * @param {ZKLib} zk - Connected ZKLib instance
 * @param {number} uid - Internal serial number (user sn)
 */
async function deleteUser(zk, uid) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(uid, 0);
  
  await zk.executeCmd(COMMANDS.CMD_DELETE_USER, buf);
  await zk.executeCmd(COMMANDS.CMD_REFRESHDATA, '');
  
  return true;
}

// ============================================================
// GET FINGERPRINT TEMPLATE (Read one template from device)
// Protocol: CMD_USERTEMP_RRQ (9)
// ============================================================

/**
 * Get a single fingerprint template from device
 * Request: uid (2 bytes LE) + finger index (1 byte)
 * Response: binary template data or CMD_ACK_ERROR if not found
 * 
 * @param {ZKLib} zk - Connected ZKLib instance
 * @param {number} uid - Internal serial number (user sn)
 * @param {number} fingerIndex - Finger index 0-9
 * @returns {Buffer|null} - Raw template data or null
 */
async function getFingerTemplate(zk, uid, fingerIndex) {
  const reqBuf = Buffer.alloc(3);
  reqBuf.writeUInt16LE(uid, 0);
  reqBuf.writeUInt8(fingerIndex, 2);
  
  try {
    // Use the TCP connection directly for this command
    // since it involves CMD_PREPARE_DATA → CMD_DATA responses
    const tcp = zk.zklibTcp;
    if (!tcp || !tcp.socket) throw new Error('TCP not connected');
    
    await tcp.freeData();
    
    // Build the request data buffer for readWithBuffer
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('TIMEOUT_GET_TEMPLATE')), 10000);
      
      tcp.replyId++;
      const buf = createTCPHeader(COMMANDS.CMD_USERTEMP_RRQ, tcp.sessionId, tcp.replyId, reqBuf);
      
      let replyBuffer = Buffer.from([]);
      
      const handleData = (data) => {
        replyBuffer = Buffer.concat([replyBuffer, data]);
        
        const header = decodeTCPHeader(replyBuffer.subarray(0, 16));
        
        if (header.commandId === COMMANDS.CMD_ACK_ERROR) {
          clearTimeout(timeout);
          tcp.socket.removeListener('data', handleData);
          resolve(null); // Template doesn't exist
          return;
        }
        
        if (header.commandId === COMMANDS.CMD_DATA) {
          clearTimeout(timeout);
          tcp.socket.removeListener('data', handleData);
          // Template data starts after the 16-byte TCP header
          resolve(replyBuffer.subarray(16));
          return;
        }
        
        if (header.commandId === COMMANDS.CMD_PREPARE_DATA) {
          // Large template — wait for CMD_DATA to follow
          // The data will come in subsequent packets
          return;
        }
      };
      
      tcp.socket.on('data', handleData);
      tcp.socket.write(buf, null, (err) => {
        if (err) {
          clearTimeout(timeout);
          tcp.socket.removeListener('data', handleData);
          reject(err);
        }
      });
    });
    
    await tcp.freeData();
    return result;
  } catch (err) {
    if (err.message === 'TIMEOUT_GET_TEMPLATE') return null;
    throw err;
  }
}

/**
 * Get ALL fingerprint templates for a specific user (fingers 0-9)
 * @param {ZKLib} zk 
 * @param {number} uid 
 * @returns {Array<{fingerId: number, template: Buffer}>}
 */
async function getAllUserTemplates(zk, uid) {
  const templates = [];
  
  for (let fingerIdx = 0; fingerIdx <= 9; fingerIdx++) {
    try {
      const template = await getFingerTemplate(zk, uid, fingerIdx);
      if (template && template.length > 0) {
        templates.push({ fingerId: fingerIdx, template: template });
      }
    } catch (e) {
      // Skip errors for individual fingers
      console.log(`[ZKHelper] Could not read finger ${fingerIdx} for uid ${uid}: ${e.message}`);
    }
  }
  
  return templates;
}

// ============================================================
// READ ALL TEMPLATES (Bulk read from device)
// Protocol: CMD_DATA_WRRQ with special payload
// ============================================================

/**
 * Read all fingerprint templates from the device at once
 * Returns parsed template entries
 * @param {ZKLib} zk 
 * @returns {Array<{uid: number, fingerId: number, flag: number, template: Buffer}>}
 */
async function readAllTemplates(zk) {
  const tcp = zk.zklibTcp;
  if (!tcp || !tcp.socket) throw new Error('TCP not connected');

  await zk.executeCmd(COMMANDS.CMD_DISABLEDEVICE, REQUEST_DATA.DISABLE_DEVICE);

  try {
    await tcp.freeData();
    
    // Request payload for reading ALL templates
    const reqData = Buffer.from([0x01, 0x07, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const result = await tcp.readWithBuffer(reqData);
    
    if (!result || !result.data || result.data.length < 4) {
      return [];
    }
    
    // Parse the template entries
    const templates = [];
    let offset = 4; // Skip the 4-byte total size header
    const data = result.data;
    
    while (offset + 6 < data.length) {
      const entrySize = data.readUInt16LE(offset);       // Size of this entry (template_size + 6)
      const userSn = data.readUInt16LE(offset + 2);       // Internal user serial number
      const fpIndex = data.readUInt8(offset + 4);          // Finger index (0-9)
      const fpFlag = data.readUInt8(offset + 5);           // Flag: 0=invalid, 1=valid, 3=duress
      
      if (entrySize <= 6 || offset + entrySize > data.length) break;
      
      const templateSize = entrySize - 6;
      const template = data.subarray(offset + 6, offset + 6 + templateSize);
      
      templates.push({
        uid: userSn,
        fingerId: fpIndex,
        flag: fpFlag,
        template: Buffer.from(template), // Copy so it doesn't reference the big buffer
        size: templateSize
      });
      
      offset += entrySize;
    }
    
    await tcp.freeData();
    return templates;
  } finally {
    try {
      await zk.executeCmd(COMMANDS.CMD_ENABLEDEVICE, '');
    } catch (e) {}
  }
}

// ============================================================
// UPLOAD FINGERPRINT TEMPLATE (Write template to device)
// Protocol: CMD_PREPARE_DATA → CMD_DATA → CMD_CHECKSUM_BUFFER → CMD_TMP_WRITE → CMD_FREE_DATA
// ============================================================

/**
 * Upload a fingerprint template to a device
 * @param {ZKLib} zk - Connected ZKLib instance
 * @param {number} uid - Internal serial number on device
 * @param {number} fingerIndex - Finger index (0-9)
 * @param {Buffer} templateData - Raw template binary data
 * @param {number} fpFlag - 1=valid, 3=duress (default: 1)
 */
async function uploadFingerTemplate(zk, uid, fingerIndex, templateData, fpFlag = 1) {
  const tcp = zk.zklibTcp;
  if (!tcp || !tcp.socket) throw new Error('TCP not connected');
  
  await zk.executeCmd(COMMANDS.CMD_DISABLEDEVICE, REQUEST_DATA.DISABLE_DEVICE);
  
  try {
    // Step 1: CMD_PREPARE_DATA - tell device how much data is coming
    const prepBuf = Buffer.alloc(4);
    prepBuf.writeUInt16LE(templateData.length, 0);
    prepBuf.writeUInt16LE(0, 2); // Fixed
    await zk.executeCmd(COMMANDS.CMD_PREPARE_DATA, prepBuf);
    
    // Step 2: CMD_DATA - send the actual template data
    await zk.executeCmd(COMMANDS.CMD_DATA, templateData);
    
    // Step 3: CMD_CHECKSUM_BUFFER - checksum verification
    await zk.executeCmd(COMMANDS.CMD_CHECKSUM_BUFFER, '');
    
    // Step 4: CMD_TMP_WRITE - commit the template
    const tmpWreqBuf = Buffer.alloc(6);
    tmpWreqBuf.writeUInt16LE(uid, 0);           // user sn
    tmpWreqBuf.writeUInt8(fingerIndex, 2);        // finger index
    tmpWreqBuf.writeUInt8(fpFlag, 3);             // flag (1=valid)
    tmpWreqBuf.writeUInt16LE(templateData.length, 4); // template size
    await zk.executeCmd(COMMANDS.CMD_TMP_WRITE, tmpWreqBuf);
    
    // Step 5: CMD_FREE_DATA
    await zk.executeCmd(COMMANDS.CMD_FREE_DATA, '');
    
    // Refresh and re-enable
    await zk.executeCmd(COMMANDS.CMD_REFRESHDATA, '');
    await zk.executeCmd(COMMANDS.CMD_ENABLEDEVICE, '');
    
    return true;
  } catch (err) {
    try { await zk.executeCmd(COMMANDS.CMD_ENABLEDEVICE, ''); } catch (e) {}
    throw err;
  }
}

// ============================================================
// DELETE FINGERPRINT (Delete one finger OR all fingers)
// ============================================================

/**
 * Delete a single fingerprint from device
 * @param {ZKLib} zk 
 * @param {string} userId - The visible user ID (badge/PIN string)
 * @param {number} fingerIndex - 0-9
 */
async function deleteFingerTemplate(zk, userId, fingerIndex) {
  // CMD_DEL_FPTMP (134) - user id as string + zeros + finger index at offset 24
  const buf = Buffer.alloc(25, 0);
  const userIdBuf = Buffer.from(userId, 'ascii');
  userIdBuf.copy(buf, 0);
  buf.writeUInt8(fingerIndex, 24);
  
  await zk.executeCmd(134, buf); // CMD_DEL_FPTMP
  await zk.executeCmd(COMMANDS.CMD_REFRESHDATA, '');
  
  return true;
}

/**
 * Delete ALL fingerprints for a user
 * @param {ZKLib} zk 
 * @param {number} uid - Internal serial number
 */
async function deleteAllUserTemplates(zk, uid) {
  // CMD_DELETE_USERTEMP (19) - uid (2 bytes LE) + 0x00
  const buf = Buffer.alloc(3, 0);
  buf.writeUInt16LE(uid, 0);
  
  await zk.executeCmd(COMMANDS.CMD_DELETE_USERTEMP, buf);
  await zk.executeCmd(COMMANDS.CMD_REFRESHDATA, '');
  
  return true;
}

// ============================================================
// START ENROLLMENT (Trigger enrollment mode on device)
// Protocol: CMD_STARTENROLL (61)
// ============================================================

/**
 * Start fingerprint enrollment on the device
 * The user must physically scan their finger on the device
 * @param {ZKLib} zk 
 * @param {number} uid - Internal serial number
 * @param {number} fingerIndex - Which finger to enroll (0-9)
 */
async function startEnroll(zk, uid, fingerIndex) {
  const buf = Buffer.alloc(6, 0);
  buf.writeUInt16LE(uid, 0);
  buf.writeUInt8(fingerIndex, 2);
  
  await zk.executeCmd(COMMANDS.CMD_STARTENROLL, buf);
  return true;
}

// ============================================================
// GET DEVICE INFO (Enhanced with FP count)
// ============================================================

/**
 * Get enhanced device information
 * @param {ZKLib} zk 
 * @returns {{ userCounts: number, logCounts: number, logCapacity: number, fpCounts: number }}
 */
async function getDeviceInfo(zk) {
  const info = await zk.getInfo();
  return {
    userCounts: info.userCounts || 0,
    logCounts: info.logCounts || 0,
    logCapacity: info.logCapacity || 0
  };
}

module.exports = {
  createConnection,
  safeDisconnect,
  setUser,
  deleteUser,
  getFingerTemplate,
  getAllUserTemplates,
  readAllTemplates,
  uploadFingerTemplate,
  deleteFingerTemplate,
  deleteAllUserTemplates,
  startEnroll,
  getDeviceInfo,
  COMMANDS
};
