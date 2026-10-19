require('dotenv').config();

const app = require('./app');
const { connectDB } = require('./config/db');
const { startScheduler, stopScheduler } = require('./services/scheduler');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await connectDB();

    startScheduler();

    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    process.on('SIGTERM', () => {
      console.log('SIGTERM received. Shutting down gracefully...');
      stopScheduler();
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('SIGINT received. Shutting down gracefully...');
      stopScheduler();
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();