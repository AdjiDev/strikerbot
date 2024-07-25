const { 
    makeWASocket, 
    DisconnectReason, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    PHONENUMBER_MCC, 
    makeInMemoryStore, 
    makeCacheableSignalKeyStore, 
    Browsers,
    delay, 
} = require('@whiskeysockets/baileys'); 
 
const pino = require('pino'); 
const readline = require('readline'); 
const NodeCache = require('node-cache'); 
const { Boom } = require('@hapi/boom'); 
const chalk = require('chalk'); 
const handler = require('./striker'); 
 
const { argv } = process; 
 
const usePairingCode = argv.includes('--pairing'); 
const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) }); 
const msgRetryCounterCache = new NodeCache(); 
 
const rl = readline.createInterface({ 
    input: process.stdin, 
    output: process.stdout, 
}); 
 
const question = (text) => new Promise(resolve => rl.question(text, resolve)); 
 
async function handlePairing(conn) { 
    let phoneNumber = await question(chalk.yellow(`Masukan nomor telepon contoh +62xxx => `)); 
    phoneNumber = phoneNumber.replace(/[^0-9]/g, ''); 
 
    while (!Object.keys(PHONENUMBER_MCC).some(v => phoneNumber.startsWith(v))) { 
        console.log(chalk.red("Ulangi! harus tambahkan (+) diawal nomor contoh +628123456789")); 
        phoneNumber = await question(chalk.yellow(`=> `)); 
        phoneNumber = phoneNumber.replace(/[^0-9]/g, ''); 
    } 
 
    setTimeout(async () => { 
        let code = await conn.requestPairingCode(phoneNumber); 
        code = code?.match(/.{1,4}/g)?.join("-") || code; 
        console.log(chalk.green(`Kode verifikasi anda: ${code}`)); 
    }, 3000); 
} 
 
async function handleConnectionUpdate(conn, update) { 
    const { connection, lastDisconnect } = update; 
    try { 
        if (connection === 'close') { 
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode; 
            switch (reason) { 
                case DisconnectReason.badSession: 
                    console.log(chalk.red(`Bad Session File, Please Delete Session and Scan Again`)); 
                    connectToWhatsApp(); 
                    break; 
                case DisconnectReason.connectionClosed: 
                    console.log(chalk.yellow("Connection closed, reconnecting....")); 
                    connectToWhatsApp(); 
                    break; 
                case DisconnectReason.connectionLost: 
                    console.log(chalk.yellow("Connection Lost from Server, reconnecting...")); 
                    connectToWhatsApp(); 
                    break; 
                case DisconnectReason.connectionReplaced: 
                    console.log(chalk.yellow("Connection Replaced, Another New Session Opened, Please Close Current Session First")); 
                    connectToWhatsApp(); 
                    break; 
                case DisconnectReason.loggedOut: 
                    console.log(chalk.red(`Device Logged Out, Please Delete Session and Scan Again.`)); 
                    connectToWhatsApp(); 
                    break; 
                case DisconnectReason.restartRequired: 
                    console.log(chalk.yellow("Restart Required, Restarting...")); 
                    connectToWhatsApp(); 
                    break; 
                case DisconnectReason.timedOut: 
                    console.log(chalk.yellow("Connection TimedOut, Reconnecting...")); 
                    connectToWhatsApp(); 
                    break; 
                default: 
                    conn.end(chalk.red(`Unknown DisconnectReason: ${reason}|${connection}`)); 
            } 
        } else if (update.connection === "connecting" || update.receivedPendingNotifications === "false") { 
            console.log(chalk.yellow(`Connecting...`)); 
        } else if (update.connection === "open" || update.receivedPendingNotifications === "true") { 
            console.log(chalk.green(`Connected to: ${JSON.stringify(conn.user, null, 2)}`)); 
        } 
    } catch (err) { 
        console.log(chalk.red('Error in Connection.update ' + err)); 
        connectToWhatsApp(); 
    } 
} 
 
async function connectToWhatsApp() { 
    let { version, isLatest } = await fetchLatestBaileysVersion(); 
    const { state, saveCreds } = await useMultiFileAuthState('./session'); 
    const conn = makeWASocket({ 
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: !usePairingCode, 
        browser: Browsers.windows('Edge'), 
        patchMessageBeforeSending: (message) => { 
            const requiresPatch = !!( 
                message.buttonsMessage || 
                message.templateMessage || 
                message.listMessage 
            ); 
            if (requiresPatch) { 
                message = { 
                    viewOnceMessage: { 
                        message: { 
                            messageContextInfo: { 
                                deviceListMetadataVersion: 2, 
                                deviceListMetadata: {}, 
                            }, 
                            ...message, 
                        }, 
                    }, 
                }; 
            } 
            return message; 
        }, 
        auth: { 
            creds: state.creds, 
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })), 
        }, 
        markOnlineOnConnect: true, 
        generateHighQualityLinkPreview: true, 
        getMessage: async (key) => { 
            if (store) { 
                const msg = await store.loadMessage(key.remoteJid, key.id); 
                return msg.message || undefined; 
            } 
            return { conversation: "Bot is online" }; 
        }, 
        msgRetryCounterCache, 
        defaultQueryTimeoutMs: undefined, 
    }); 
 
    store.bind(conn.ev); 
 
    if (usePairingCode && !conn.authState.creds.registered) { 
        await handlePairing(conn); 
    } 
 
    conn.ev.on('connection.update', (update) => handleConnectionUpdate(conn, update)); 
    conn.ev.on('creds.update', saveCreds); 
    conn.ev.on('messages.upsert', async (chatUpdate) => handler(conn, chatUpdate));
    conn.ev.on('messages.upsert', async chatUpdate => { 
        let m = chatUpdate.messages[0]; 
        await conn.readMessages([m.key]); 
        if (m.key && m.key.remoteJid === 'status@broadcast') { 
            await conn.readMessages([m.key]); 
        } 
 
        const messageText = m.message?.conversation || "No conversation text"; 
 
        console.log(chalk.greenBright(`\nMessage from: ${m.pushName}\nText: ${messageText}\nJid: ${m.key.remoteJid}`)); 
    }); 
    conn.ev.on('group-participants.update', async (anu) => { 
        if (global.welcome) { 
            console.log(anu); 
            try { 
                let metadata = await conn.groupMetadata(anu.id); 
                let participants = anu.participants; 
                for (let num of participants) { 
                    try { 
                        ppuser = await conn.profilePictureUrl(num, 'image'); 
                    } catch (err) { 
                        ppuser = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png?q=60'; 
                    } 
                    try { 
                        ppgroup = await conn.profilePictureUrl(anu.id, 'image'); 
                    } catch (err) { 
                        ppgroup = 'https://i.ibb.co/RBx5SQC/avatar-group-large-v2.png?q=60'; 
                    } 
 
                    if (anu.action == 'add') { 
                        conn.sendMessage(anu.id, { text: `Welcome @${num.split("@")[0]} to ${metadata.subject}`, mentions: [num] });
                    } else if (anu.action == 'remove') { 
                        conn.sendMessage(anu.id, { text: `Goodbye @${num.split("@")[0]} from ${metadata.subject}`, mentions: [num] }); 
                    } 
                } 
            } catch (e) { 
                console.log(e); 
            } 
        } 
    }); 
} 
 
connectToWhatsApp(); 
