const { Kafka } = require('kafkajs');
const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/social-network', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Notification Schema
const NotificationSchema = new mongoose.Schema({
    type: { type: String, required: true }, // LIKE, COMMENT, CHAT_MESSAGE
    userId: { type: String, required: true }, // who triggered the notification
    targetUserId: { type: String, required: true }, // who should receive the notification
    postId: String,
    commentText: String,
    messageId: String,
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const Notification = mongoose.model('Notification', NotificationSchema);

// Kafka configuration
const kafka = new Kafka({
    clientId: 'notification-consumer',
    brokers: [process.env.KAFKA_BROKERS || 'localhost:9092'],
    retry: {
        initialRetryTime: 100,
        retries: 8
    }
});

const consumer = kafka.consumer({ groupId: 'notification-group' });

async function startConsumer() {
    await consumer.connect();
    await consumer.subscribe({ topic: 'notifications' });

    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            try {
                const data = JSON.parse(message.value.toString());
                
                // Create notification in MongoDB
                const notification = new Notification({
                    type: data.type,
                    userId: data.userId,
                    targetUserId: data.targetUserId,
                    postId: data.postId,
                    commentText: data.commentText,
                    messageId: data.messageId
                });
                
                await notification.save();
                // Afficher un message formaté selon le type de notification
                let notificationMessage = '';
                switch (data.type) {
                
                    case 'LIKE':
                        notificationMessage = ` Like: User ${data.userId} liked your post`;
                        break;
                    case 'COMMENT':
                        notificationMessage = ` Comment: User ${data.userId} commented: "${data.commentText}"`;
                        break;
                    case 'CHAT_MESSAGE':
                        notificationMessage = ` Message: New message from user ${data.userId}`;
                        break;
                    default:
                        notificationMessage = ` New notification of type ${data.type} from user ${data.userId}`;
                }
                console.log('\n✨ New Notification ✨');
                console.log(notificationMessage);
                console.log('Time:', new Date().toLocaleString());
                
                console.log('-'.repeat(50));
            } catch (error) {
                console.error('Error processing notification:', error);
            }
        }
    });
}

// Start the consumer
startConsumer().catch(console.error);
