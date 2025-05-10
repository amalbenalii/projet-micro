const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { Kafka } = require('kafkajs');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

// Load protobuf
const PROTO_PATH = path.join(__dirname, 'chat.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const { chat } = protoDescriptor;

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/social-network', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Message Schema
const MessageSchema = new mongoose.Schema({
    text: { type: String, required: true },
    userId: { type: String, required: true },
    targetUserId: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', MessageSchema);

// Kafka configuration
const kafka = new Kafka({
    clientId: 'chat-service',
    brokers: ['localhost:9092']
});

const producer = kafka.producer();

// Chat service implementation
const subscribers = new Map();

const chatService = {
    SendMessage: async (call, callback) => {
        try {
            const { text, userId, targetUserId } = call.request;
            
            // Save message to MongoDB
            const message = new Message({
                text,
                userId,
                targetUserId
            });
            await message.save();

            // Send notification via Kafka
            await producer.send({
                topic: 'notifications',
                messages: [{
                    value: JSON.stringify({
                        type: 'CHAT_MESSAGE',
                        messageId: message._id,
                        userId,
                        targetUserId,
                        text
                    })
                }]
            });

            // Notify subscriber if online
            const targetSubscriber = subscribers.get(targetUserId);
            if (targetSubscriber) {
                targetSubscriber.write({
                    id: message._id.toString(),
                    text,
                    userId,
                    timestamp: message.timestamp.toISOString()
                });
            }

            callback(null, { 
                success: true,
                messageId: message._id.toString()
            });
        } catch (error) {
            console.error('Error sending message:', error);
            callback({
                code: grpc.status.INTERNAL,
                message: 'Error sending message'
            });
        }
    },

    SubscribeToMessages: (call) => {
        const { userId } = call.request;
        subscribers.set(userId, call);

        call.on('cancelled', () => {
            subscribers.delete(userId);
        });
    }
};

// Start gRPC server
async function startServer() {
    await producer.connect();

    const server = new grpc.Server();
    server.addService(chat.ChatService.service, chatService);

    const PORT = process.env.CHAT_SERVICE_PORT || 50051;
    server.bindAsync(
        `0.0.0.0:${PORT}`,
        grpc.ServerCredentials.createInsecure(),
        (error, port) => {
            if (error) {
                console.error('Failed to start gRPC server:', error);
                return;
            }
            server.start();
            console.log(`gRPC Chat service running on port ${port}`);
        }
    );
}

startServer().catch(console.error);
