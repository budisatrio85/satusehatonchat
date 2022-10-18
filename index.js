const fs = require('fs');
const { Client, Location, List, Buttons,LocalAuth, MessageMedia } = require('whatsapp-web.js');
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
const path = 'D:\\SOURCE\\Hackathon\\FHH2022\\satusehatonchat\\'

var db;
new sqlite3.Database('./satusehat.db', sqlite3.OPEN_READWRITE, (err) => {
    if (err && err.code == "SQLITE_CANTOPEN") {
        createDatabase();
        return;
    } else if (err) {
            console.log("Getting error " + err);
            exit(1);
    }
});
function createDatabase() {
    var newdb = new sqlite3.Database('./satusehat.db', (err) => {
        if (err) {
            console.log("Getting error " + err);
            exit(1);
        }
        newdb.exec(`
            create table user (
                contact text not null,
                nama text not null
            );
            create table antrian (
                contact text not null,
                faskes text not null,
                poli text not null,
                antrian int not null,
                date datetime not null
            );
            create table log (
                contact text not null,
                chat text not null,
                date datetime not null
            );
        `);
    });
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

// publish conversation
async function publishConversation(to,chat,id){
    const objChat = {'to':to,'chat':chat,'id':id};
    const conn = await amqplib.connect(rabbitUrl, "heartbeat=60");
    const ch = await conn.createChannel()
    const q = 'satusehat_conversation_queue';
    const rkey = 'satusehat_conversation_consume_route';

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
                if(objChat.id != undefined){
                    clientWA.sendMessage(objChat.to, objChat.chat,{quotedMessageId:objChat.id});
                }else{
                    clientWA.sendMessage(objChat.to, objChat.chat);
                }
            }
        }, {noAck:true});
    }catch(err){
        console.error(err);
    };
}

clientWA.initialize();
clientWA.on('qr', (qr) => {
    
    qrcode.generate(qr, {small: true});
});

clientWA.on('authenticated', () => {
    console.log('AUTHENTICATED');
});

clientWA.on('auth_failure', msg => {
    
    console.error('AUTHENTICATION FAILURE', msg);
});

clientWA.on('ready', () => {
    console.log('READY');    
    subscribeChat();
});

clientWA.on('message', async msg => {
    console.log('MESSAGE RECEIVED', msg);

    let db = new sqlite3.Database('./satusehat.db', sqlite3.OPEN_READWRITE, (err) => {
        if (err) {
            console.log("Getting error " + err);
        } else{
            db.exec(`insert into log (contact, chat, date) values ('${msg.from}', '${msg.body}', datetime())`);
        }
    });

    if (msg.body.toLowerCase() === 'halo') {
        let db = new sqlite3.Database('./satusehat.db', sqlite3.OPEN_READWRITE, (err) => {
            if (err) {
                console.log("Getting error " + err);
            } else{
                db.all(`select contact from user where contact = ?`, msg.from, (err, rows) => {
                    if(rows.length == 0){
                        db.exec(`insert into user (contact, nama) values ('${msg.from}', '${msg._data.notifyName}')`);
                    }
                });
            }
        });
        reply = `Hai ${msg._data.notifyName}, selamat datang di Satu Sehat on Chat!`
        clientWA.sendMessage(msg.from,reply,{quotedMessageId:msg.id._serialized});

    } else if (msg.body.toLowerCase().includes('cek data')) {    
        var imageAsBase64 = fs.readFileSync(path + "rontgen.jpg", 'base64');
        var media = await new MessageMedia("image/jpg", imageAsBase64, "rontgen.jpg")
        clientWA.sendMessage(msg.from, media, {caption: "Berikut data rontgen Anda"})
    } else if (msg.body.startsWith('ss')) {        
        publishChat(msg.from,msg.body.substring(2,msg.body.length),msg.id._serialized)
    } else if (msg.body.toLowerCase().includes('antri')) {
        reply = `Hai ${msg._data.notifyName}, terima kasih telah menggunakan Satu Sehat on Chat! Layanan antri digunakan pada hari H yaa. Kalau boleh tahu dimana Anda akan antri? `
        publishChat(msg.from,reply,msg.id._serialized)
    } else if (msg.body.toLowerCase().includes('rumah sakit')) {
        reply = `Baik, di poli apa? `
        let db = new sqlite3.Database('./satusehat.db', sqlite3.OPEN_READWRITE, (err) => {
            if (err) {
                console.log("Getting error " + err);
            } else{
                db.all(`select contact,faskes from antrian where contact = '${msg.from}' and faskes = '${msg.body.toLowerCase()}' `, (err, rows) => {
                    if(rows.length == 0){
                        db.exec(`insert into antrian (contact, faskes, poli, antrian, date) values ('${msg.from}', '${msg.body.toLowerCase()}','', 1,datetime())`);
                    }else{
                        found = rows.find(a => a.faskes=='');
                        if(found){
                            db.exec(`update antrian set contact = '${msg.from}', faskes = '${msg.body.toLowerCase()}', poli = '', antrian = 1, date = datetime() where contact='${msg.from}' and faskes=''`);
                        }
                    }
                });
            }
        });
        publishChat(msg.from,reply,msg.id._serialized)
    } else if (msg.body.toLowerCase().includes('poli')) {
        let db = new sqlite3.Database('./satusehat.db', sqlite3.OPEN_READWRITE, (err) => {
            if (err) {
                console.log("Getting error " + err);
            } else{
                db.all(`select contact,chat from log where contact = ? and chat like '%rumah sakit%' order by date desc limit 1`,  msg.from, (err, rows) => {
                    if(rows.length != 0){
                        db.all(`select faskes,poli,antrian from antrian where lower(faskes) = '${rows[0].chat.toLowerCase()}' and lower(poli) = '${msg.body.toLowerCase()}'`, (err, rows1) => {
                            antrian = 1
                            if(rows1.length != 0){
                                antrian = rows1[0].antrian + 1;
                            }
                            db.exec(`update antrian set poli = '${msg.body.toLowerCase()}', antrian = ${antrian}, date = datetime() where contact='${msg.from}' and lower(faskes) = '${rows[0].chat.toLowerCase()}'`);
                            
                            reply = `Baik, Anda di antrian ke ${antrian} untuk ${msg.body} di ${rows[0].chat}`
                            publishChat(msg.from,reply,msg.id._serialized)
                        });
                    }
                });
            }
        });
    } else if (msg.type === 'image' && msg.hasMedia) {
        const attachmentData = await msg.downloadMedia();
        imgData = Buffer.from(attachmentData.data, 'base64')
        Jimp.read(imgData, function(err, image) {
            if (err) {
                console.error(err);
            }
            
            let qrcode = new qrCode();
            qrcode.callback = function(err, value) {
                if (err) {
                    console.error(err);
                }
                
                console.log(value.result);
                result = `Hanya bisa QR Peduli Lindungi (${value.result})`
                if(value.result.includes('check')){
                    jenis = 'Check Out';
                    if(value.result.includes('checkin')){
                        jenis = 'Check In';
                    }
                    result = `
                    Terima kasih anda telah *${jenis}*
                    Lokasi: 'Demo Lokasi' 
                    Tanggal: ${new Date().toLocaleString('en-GB')}

                    (${value.result})
                    `;
                }
                msg.reply(result);
            };
            
            qrcode.decode(image.bitmap);
        });
    } else {
        publishConversation(msg.from,msg.body,msg.id._serialized)
    }
});

clientWA.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
});