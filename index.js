const fs = require('fs');
const { Client, Location, List, Buttons,LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Queue = require('bull');
const amqplib = require('amqplib');
const sqlServer = require('mssql');
const sqlite3 = require('sqlite3');
const Jimp = require("jimp");
const qrCode = require('qrcode-reader');

// inisialisasi
const clientWA = new Client({ authStrategy: new LocalAuth({clientId: 'budi2'}), puppeteer: { headless: true } });
const rabbitUrl = 'amqp://satusehat:satusehat@localhost:5672';
const exch = 'satusehat_exchange';
var db;
new sqlite3.Database('./satusehat.db', sqlite3.OPEN_READWRITE, (err) => {
    if (err && err.code == "SQLITE_CANTOPEN") {
        createDatabase();
        return;
        } else if (err) {
            console.log("Getting error " + err);
            exit(1);
    }
    runQueries(db);
});
function createDatabase() {
    var newdb = new sqlite3.Database('./satusehat.db', (err) => {
        if (err) {
            console.log("Getting error " + err);
            exit(1);
        }
        createTables(newdb);
    });
}
function createTables(newdb) {
    newdb.exec(`
    create table user (
        contact text not null,
        nama text not null
    );
    create table antrian (
        contact text not null,
        faskes text not null,
        antrian int not null
    );
        `;
}

// publish chat
async function publishChat(to,chat,id){
    const objChat = {'to':to,'chat':chat,'id':id};
    const conn = await amqplib.connect(rabbitUrl, "heartbeat=60");
    const ch = await conn.createChannel()
    const q = 'satusehat_chat_queue';
    const rkey = 'satusehat_chat_route';

    await ch.assertExchange(exch, 'direct', {durable: true}).catch(console.error);
    await ch.assertQueue(q, {durable: true});
    await ch.bindQueue(q, exch, rkey);
    await ch.publish(exch, rkey, Buffer.from(JSON.stringify(objChat)));

    setTimeout( function()  {
        ch.close();
        conn.close();},  500 
	);
}

// subscribe chat
async function subscribeChat() {
    try{
        const conn = await amqplib.connect(rabbitUrl, "heartbeat=60");
        const ch = await conn.createChannel()
        const q = 'satusehat_chat_queue';
        const rkey = 'satusehat_chat_route';
        await ch.assertQueue(q, {durable: true});
        await ch.consume(q, function (chat) {
            if(chat.fields.routingKey == rkey){
                const objChat = JSON.parse(chat.content.toString());
                clientWA.sendMessage(objChat.to, objChat.chat,{quotedMessageId:objChat.id});
            }
        }, {noAck:true});
    }catch(err){
        console.error(err);
    };
}

//fillRedis();

clientWA.initialize();
clientWA.on('qr', (qr) => {
    // NOTE: This event will not be fired if a session is specified.
    qrcode.generate(qr, {small: true});
});

clientWA.on('authenticated', () => {
    console.log('AUTHENTICATED');
});

clientWA.on('auth_failure', msg => {
    // Fired if session restore was unsuccessfull
    console.error('AUTHENTICATION FAILURE', msg);
});

clientWA.on('ready', () => {
    console.log('READY');    
    subscribeChat();
});

clientWA.on('message', async msg => {
    console.log('MESSAGE RECEIVED', msg);

    if (msg.body.toLowerCase() === 'halo') {
        reply = 'Hai, selamat datang di Satu Sehat on Chat!'
        clientWA.sendMessage(msg.from,reply,{quotedMessageId:msg.id._serialized});

    }  else if (msg.body.startsWith('?')) {
        // Send a new message as a reply to the current one
        publishChat(msg.from,msg.body.substring(1,msg.body.length),msg.id._serialized)
    } else if (msg.type === 'image' && msg.hasMedia) {
        const attachmentData = await msg.downloadMedia();
        imgData = Buffer.from(attachmentData.data, 'base64')
        Jimp.read(imgData, function(err, image) {
            if (err) {
                console.error(err);
            }
            // Creating an instance of qrcode-reader module
            let qrcode = new qrCode();
            qrcode.callback = function(err, value) {
                if (err) {
                    console.error(err);
                }
                // Printing the decrypted value
                console.log(value.result);
                result = 'Hanya bisa QR Peduli Lindungi'
                if(value.result.includes('check')){
                    result = `
                    Terima kasih anda telah *Check In*
                    Lokasi: 'MAN Banjarnegara' 
                    Tanggal: ${new Date().toLocaleString('en-GB')}

                    (${value.result})
                    `
                }
                msg.reply(result);
            };
            // Decoding the QR code
            qrcode.decode(image.bitmap);
        });
    }
});

clientWA.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
});