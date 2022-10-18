import json
import pika
import sys
import sqlite3
from http.server import BaseHTTPRequestHandler, HTTPServer
from datetime import date, datetime
from sys import version as python_version
from cgi import parse_header, parse_multipart
from urllib.parse import parse_qs

class Message(object):
    to = ""
    chat = ""
    id = ""
    def __init__(self, to, chat,id):
        self.to = to
        self.chat = chat
        self.id = id
    def toJSON(self):
        return json.dumps(self, default=lambda o: o.__dict__,sort_keys=True, indent=4)

path = "D:\\SOURCE\\Hackathon\\FHH2022\\satusehatonchat\\"
parameters = pika.URLParameters("amqp://satusehat:satusehat@localhost:5672")

def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""

    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    raise TypeError ("Type %s not serializable" % type(obj))

def get_user():
    conn = sqlite3.connect(path+'satusehat.db')
    c = conn.cursor()
    c.execute("SELECT contact, nama FROM user")
    data=c.fetchall()
    res = []
    for i,row in enumerate(data):
        masked = row[0][:5]+len(row[0][5:-9])*"#"+row[0][-9:]
        res.append({'contact':masked,'nama': str(row[1])})
    conn.close()
    return res

def get_antrian():
    conn = sqlite3.connect(path+'satusehat.db')
    c = conn.cursor()
    c.execute("SELECT contact, faskes, poli, antrian FROM antrian")
    data=c.fetchall()
    res = []
    for i,row in enumerate(data):
        masked = row[0][:5]+len(row[0][5:-9])*"#"+row[0][-9:]
        res.append({'contact':masked,'faskes': str(row[1]),'poli': str(row[2]),'antrian': str(row[3])})
    conn.close()
    return res

def broadcast(segmen,message):
    conn = sqlite3.connect(path+'satusehat.db')
    c = conn.cursor()
    c.execute(f'SELECT contact FROM user where substr(contact,-6,1)%2 == {segmen}')
    data=c.fetchall()
    res = []
    message = "*Demo broadcast/advertisement* \n\n"+message
    for i,row in enumerate(data):
        objChat = Message(row[0],message,None)
        connReply = pika.BlockingConnection(parameters = parameters)
        chanReply = connReply.channel()
        chanReply.exchange_declare(exchange='satusehat_exchange',exchange_type='direct',durable=True)
        chanReply.queue_declare(queue='satusehat_chat_queue',durable=True)
        chanReply.queue_bind(exchange='satusehat_exchange',queue='satusehat_chat_queue',routing_key='satusehat_chat_route')
        chanReply.basic_publish(exchange='satusehat_exchange',routing_key='satusehat_chat_route',body=objChat.toJSON())
        connReply.close()
        print(objChat.toJSON())
        res.append({'contact':row[0],'message': message})
    conn.close()
    return res

class handler(BaseHTTPRequestHandler):
    def end_headers (self):
        self.send_header('Access-Control-Allow-Origin', '*')
        BaseHTTPRequestHandler.end_headers(self)
        
    def do_GET(self):

        result = None
        if('/user' in self.path):
            result = get_user()
        if('/antrian' in self.path):
            result = get_antrian()
        
        self.send_response(200)
        self.send_header('Content-type','application/json')
        self.end_headers()

        message = {"data":result}
        self.wfile.write(bytes(json.dumps(message, default=json_serial),"utf-8"))
        
    def do_POST(self):

        result = None
        if('/broadcast' in self.path):
            ctype, pdict = parse_header(self.headers.get_content_type())
            postvars = {}
            if ctype == 'multipart/form-data':
                postvars = parse_multipart(self.rfile, pdict)
            elif ctype == 'application/x-www-form-urlencoded':
                length = int(self.headers['content-length'])
                postvars = parse_qs(self.rfile.read(length), keep_blank_values=1)
            segmen = postvars[b'segmen'][0]
            message = postvars[b'message'][0]
            result = broadcast(segmen.decode('UTF-8'),message.decode('UTF-8'))
        
        self.send_response(200)
        self.send_header('Content-type','application/json')
        self.end_headers()

        message = {"results":result}
        self.wfile.write(bytes(json.dumps(message, default=json_serial),"utf-8"))
        
print("Starting server")    
with HTTPServer(('', 80), handler) as server:
    server.serve_forever()