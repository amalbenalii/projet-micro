const express = require('express');
const mongoose = require('mongoose');
const { Kafka } = require('kafkajs');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.POSTS_SERVICE_PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/social-network', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Kafka configuration
const kafka = new Kafka({
    clientId: 'posts-service',
    brokers: ['localhost:9092']
});

const producer = kafka.producer();

// MongoDB Schema
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

// Post Schema
const PostSchema = new mongoose.Schema({
    content: { type: String, required: true },
    userId: { type: String, required: true },
    likes: { type: Number, default: 0 },
    comments: [{
        text: String,
        userId: String,
        createdAt: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now }
});

const Post = mongoose.model('Post', PostSchema);

// Routes
// Create a new post
app.post('/posts', async (req, res) => {
    try {
        const { content, userId } = req.body;
        const post = new Post({ content, userId });
        await post.save();
        res.status(201).json(post);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get comments for a post
app.get('/posts/:id/comments', async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }
        res.json(post.comments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Like a post
app.post('/posts/:id/like', async (req, res) => {
    try {
        const { userId } = req.body;
        const post = await Post.findById(req.params.id);
        
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }

        post.likes += 1;
        await post.save();

        // Send notification event to Kafka
        await producer.send({
            topic: 'notifications',
            messages: [{
                value: JSON.stringify({
                    type: 'LIKE',
                    postId: post._id,
                    userId: userId,
                    targetUserId: post.userId
                })
            }]
        });

        res.json({ likes: post.likes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add comment to a post
app.post('/posts/:id/comments', async (req, res) => {
    try {
        const { text, userId } = req.body;
        const post = await Post.findById(req.params.id);
        
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }

        post.comments.push({ text, userId });
        await post.save();

        // Send notification event to Kafka
        await producer.send({
            topic: 'notifications',
            messages: [{
                value: JSON.stringify({
                    type: 'COMMENT',
                    postId: post._id,
                    userId: userId,
                    targetUserId: post.userId,
                    commentText: text
                })
            }]
        });

        res.status(201).json(post.comments[post.comments.length - 1]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all posts (for testing)
app.get('/posts', async (req, res) => {
    try {
        const posts = await Post.find().sort({ createdAt: -1 });
        res.json(posts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Startup
async function startServer() {
    await producer.connect();
    app.listen(PORT, () => {
        console.log(`Posts service running on port ${PORT}`);
    });
}

// Stories endpoints
app.post('/stories', async (req, res) => {
    try {
        const { content, userId } = req.body;
        const story = new Story({ content, userId });
        await story.save();

        // Send story creation event to Kafka
        await producer.send({
            topic: 'stories',
            messages: [{
                value: JSON.stringify({
                    type: 'STORY_CREATED',
                    storyId: story._id,
                    userId: userId,
                    content: content
                })
            }]
        });

        res.status(201).json(story);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all active stories
app.get('/stories', async (req, res) => {
    try {
        const stories = await Story.find({
            expiresAt: { $gt: new Date() } // Only return non-expired stories
        }).sort({ createdAt: -1 });
        res.json(stories);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get stories by user
app.get('/stories/user/:userId', async (req, res) => {
    try {
        const stories = await Story.find({
            userId: req.params.userId,
            expiresAt: { $gt: new Date() } // Only return non-expired stories
        }).sort({ createdAt: -1 });
        res.json(stories);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

startServer().catch(console.error);
