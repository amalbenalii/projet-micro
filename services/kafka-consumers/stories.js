const { Kafka } = require('kafkajs');
const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/social-network', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Story Schema
const StorySchema = new mongoose.Schema({
    userId: { type: String, required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { 
        type: Date, 
        default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    }
});

const Story = mongoose.model('Story', StorySchema);

// Kafka configuration
const kafka = new Kafka({
    clientId: 'story-consumer',
    brokers: [process.env.KAFKA_BROKERS || 'localhost:9092'],
    retry: {
        initialRetryTime: 100,
        retries: 8
    }
});

const consumer = kafka.consumer({ groupId: 'story-group' });

async function startConsumer() {
    await consumer.connect();
    await consumer.subscribe({ topic: 'stories' });

    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            const data = JSON.parse(message.value.toString());

            try {
                switch (data.type) {
                    case 'STORY_CREATED':
                        // Sauvegarder la story
                        const story = new Story({
                            userId: data.userId,
                            content: data.content,
                            createdAt: new Date(),
                            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
                        });
                        await story.save();
                        console.log('✨ Story created:', {
                            storyId: story._id,
                            userId: data.userId,
                            content: data.content,
                            expiresAt: story.expiresAt
                        });

                        // Publier une notification de nouvelle story
                        const producer = kafka.producer();
                        await producer.connect();
                        await producer.send({
                            topic: 'notifications',
                            messages: [{
                                value: JSON.stringify({
                                    type: 'STORY_CREATED',
                                    userId: data.userId,
                                    targetUserId: data.userId,
                                    storyId: story._id,
                                    content: data.content
                                })
                            }]
                        });
                        await producer.disconnect();
                        console.log('📢 Notification sent for new story');
                        break;

                    case 'STORY_EXPIRED':
                        // Supprimer la story
                        await Story.findByIdAndDelete(data.storyId);
                        console.log('🗑️ Story expired and deleted:', data.storyId);
                        break;
                }
            } catch (error) {
                console.error('Error processing story event:', error);
            }
        }
    });
}

// Handle errors
consumer.on('consumer.crash', async (error) => {
    console.error('Consumer crashed:', error);
    try {
        await consumer.disconnect();
        await startConsumer();
    } catch (e) {
        console.error('Failed to restart consumer:', e);
    }
});

// Start the consumer
startConsumer().catch(console.error);
