import mongoose from 'mongoose'

export async function connectMongo(uri: string): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true)
  await mongoose.connect(uri)
  return mongoose
}

export function isMongoReady(): boolean {
  return mongoose.connection.readyState === 1
}
