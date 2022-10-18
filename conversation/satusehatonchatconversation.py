import json
import pika
from chatterbot import ChatBot
from chatterbot.trainers import ChatterBotCorpusTrainer

path = "D:\\SOURCE\\Hackathon\\FHH2022\\satusehatonchat\\"
parameters = pika.URLParameters("amqp://satusehat:satusehat@localhost:5672")

chatbot = ChatBot("SatuSehatonChat")
chatbot.storage.drop()
trainer = ChatterBotCorpusTrainer(chatbot)
trainer.train(path+"conversation\\corpus.yml")

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

def consume_all(ch,method,properties,body):
    result = ""
    if method.routing_key == 'satusehat_conversation_consume_route':
        chat = json.loads(body)
        result = chatbot.get_response(chat['chat'])

    # prepare balasan
    objChat = Message(chat['to'],str(result),chat['id'])
    connReply = pika.BlockingConnection(parameters = parameters)
    chanReply = connReply.channel()
    chanReply.exchange_declare(exchange='satusehat_exchange',exchange_type='direct',durable=True)
    chanReply.queue_declare(queue='satusehat_chat_queue',durable=True)
    chanReply.queue_bind(exchange='satusehat_exchange',queue='satusehat_chat_queue',routing_key='satusehat_chat_route')
    chanReply.basic_publish(exchange='satusehat_exchange',routing_key='satusehat_chat_route',body=objChat.toJSON())
    connReply.close()

connReply = pika.BlockingConnection(parameters = parameters)
chanReply = connReply.channel()
chanReply.exchange_declare(exchange='satusehat_exchange',exchange_type='direct',durable=True)
chanReply.queue_declare(queue='satusehat_conversation_queue',durable=True)
chanReply.queue_bind(exchange='satusehat_exchange',queue='satusehat_conversation_queue',routing_key='satusehat_conversation_consume_route')
chanReply.basic_consume(queue='satusehat_conversation_queue', on_message_callback=consume_all, auto_ack = True)
chanReply.start_consuming()

print("conversational engine running!")