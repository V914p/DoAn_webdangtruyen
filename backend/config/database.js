import mongoose from 'mongoose';
import { env, validateEnvironment } from './env.js';

const readyStateLabels = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting'
};

let connectionPromise = null;
let connectionListenersBound = false;

function bindConnectionListeners() {
  if (connectionListenersBound) {
    return;
  }

  connectionListenersBound = true;

  mongoose.connection.on('connected', () => {
    console.log(`[database] Connected to ${mongoose.connection.name || 'MongoDB'}`);
  });

  mongoose.connection.on('disconnected', () => {
    console.log('[database] Disconnected from MongoDB');
  });

  mongoose.connection.on('error', (error) => {
    console.error('[database] MongoDB connection error:', error);
  });
}

export function getDatabaseStatus() {
  return {
    readyState: mongoose.connection.readyState,
    status: readyStateLabels[mongoose.connection.readyState] || 'unknown',
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null
  };
}

export async function connectToDatabase() {
  validateEnvironment({ requireDatabase: true });
  bindConnectionListeners();

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  mongoose.set('strictQuery', true);

  connectionPromise = mongoose.connect(env.mongo.uri, {
    autoIndex: env.mongo.autoIndex,
    maxPoolSize: env.mongo.maxPoolSize,
    minPoolSize: env.mongo.minPoolSize,
    serverSelectionTimeoutMS: env.mongo.serverSelectionTimeoutMS,
    socketTimeoutMS: env.mongo.socketTimeoutMS
  }).finally(() => {
    connectionPromise = null;
  });

  await connectionPromise;
  return mongoose.connection;
}

export async function disconnectFromDatabase() {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();
}