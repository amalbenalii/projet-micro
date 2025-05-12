const { ApolloServer, gql } = require('apollo-server');
const { default: axios } = require('axios');
require('dotenv').config();

const POSTS_SERVICE_URL = process.env.POSTS_SERVICE_URL || 'http://localhost:3020';

// GraphQL Schema
const typeDefs = gql`
  type Comment {
    text: String!
    userId: String!
    createdAt: String!
  }

  type Post {
    id: ID!
    content: String!
    userId: String!
    likes: Int!
    comments: [Comment!]!
    createdAt: String!
  }

  type Query {
    feed(userId: ID!): [Post!]!
    post(id: ID!): Post
  }
`;

// Resolvers
const resolvers = {
  Query: {
    feed: async (_, { userId }) => {
      try {
        console.log('Fetching posts from:', `${POSTS_SERVICE_URL}/posts`);
        const response = await axios.get(`${POSTS_SERVICE_URL}/posts`);
        console.log('Posts received:', response.data);
        const posts = response.data;

        if (!Array.isArray(posts)) {
          console.error('Received invalid posts data:', posts);
          throw new Error('Invalid posts data received');
        }

        return posts.map(post => ({
          id: post._id,
          content: post.content,
          userId: post.userId,
          likes: post.likes || 0,
          comments: post.comments || [],
          createdAt: post.createdAt
        }));
      } catch (error) {
        console.error('Error fetching feed:', error.message, error.response?.data);
        throw new Error(`Failed to fetch feed: ${error.message}`);
      }
    },
    post: async (_, { id }) => {
      try {
        console.log('Fetching post:', `${POSTS_SERVICE_URL}/posts/${id}`);
        const response = await axios.get(`${POSTS_SERVICE_URL}/posts/${id}`);
        console.log('Post received:', response.data);
        const post = response.data;

        if (!post) {
          throw new Error(`Post not found with id: ${id}`);
        }

        return {
          id: post._id,
          content: post.content,
          userId: post.userId,
          likes: post.likes || 0,
          comments: post.comments || [],
          createdAt: post.createdAt
        };
      } catch (error) {
        console.error('Error fetching post:', error.message, error.response?.data);
        throw new Error(`Failed to fetch post: ${error.message}`);
      }
    }
  }
};

// Create Apollo Server
const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ req }) => {
    // Here you would typically handle authentication
    return { userId: req.headers.userid };
  }
});

// Start the server
const PORT = process.env.GRAPHQL_SERVICE_PORT || 4000;

server.listen(PORT).then(({ url }) => {
  console.log(`GraphQL service running at ${url}`);
});
