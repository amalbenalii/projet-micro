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
    brokers: ['localhost:9092']
});

const consumer = kafka.consumer({ groupId: 'notification-group' });

async function startConsumer() {
    await consumer.connect();
    await consumer.subscribe({ topics: ['notifications', 'stories'] });

    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            const data = JSON.parse(message.value.toString());

            if (topic === 'notifications') {
                try {
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
                    console.log(`New notification created for user ${data.targetUserId}`);
                } catch (error) {
                    console.error('Error processing notification:', error);
                }
            } else if (topic === 'stories') {
                try {
                    if (data.type === 'STORY_CREATED') {
                        // Créer une notification pour la nouvelle story
                        const notification = new Notification({
                            type: 'STORY_CREATED',
                            userId: data.userId,
                            targetUserId: data.userId, // Notification pour le créateur
                            content: data.content
                        });
                        await notification.save();
                        console.log(`New story notification created for user ${data.userId}`);

                        // Schedule story deletion after 24 hours
                        setTimeout(async () => {
                            try {
                                await Story.deleteOne({ _id: data.storyId });
                                console.log(`Story ${data.storyId} expired and deleted`);

                                // Créer une notification pour l'expiration
                                const expirationNotification = new Notification({
                                    type: 'STORY_EXPIRED',
                                    userId: data.userId,
                                    targetUserId: data.userId,
                                    content: 'Votre story a expiré'
                                });
                                await expirationNotification.save();
                                console.log(`Story expiration notification created for user ${data.userId}`);
                            } catch (error) {
                                console.error('Error handling story expiration:', error);
                            }
                        }, 24 * 60 * 60 * 1000); // 24 hours
                    }
                } catch (error) {
                    console.error('Error processing story event:', error);
                }
            }
        }
    });
}

// Story Schema
const StorySchema = new mongoose.Schema({
    userId: { type: String, required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { 
        type: Date, 
        default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
    }
});

const Story = mongoose.model('Story', StorySchema);

// Start the consumer
startConsumer().catch(console.error);
