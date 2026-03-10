import mongoose from "mongoose";
import { env } from "../config/env";

let hasConnected = false;

export const connectMongo = async (): Promise<void> => {
  if (hasConnected) {
    return;
  }

  if (!env.mongodbUri) {
    throw new Error("MONGODB_URI is required when DB_PROVIDER is set to mongodb");
  }

  const options = {
    ...(env.mongodbDbName ? { dbName: env.mongodbDbName } : {}),
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
    socketTimeoutMS: 12000,
  };
  await mongoose.connect(env.mongodbUri, options);
  hasConnected = true;
  console.log("Connected to MongoDB Atlas");
};

export const isMongoReady = (): boolean => {
  return mongoose.connection.readyState === 1;
};
