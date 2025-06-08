require("dotenv").config();
const { MongoClient } = require("mongodb");

// MongoDB connection setup
const client = new MongoClient(process.env.MONGO_URI);
let db;

async function connectToMongoDB() {
  try {
    await client.connect();
    db = client.db();
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    throw error;
  }
}

// Function to delete documents where the `expired` field is null
async function deleteNullExpiredDocuments() {
  try {
    const result = await db.collection("udemy").deleteMany({
      expired: null,
    });

    console.log(
      `Deleted ${result.deletedCount} documents with null expired value.`
    );
    return result;
  } catch (error) {
    console.error("Error deleting documents with null expired value:", error);
    throw error;
  }
}

// Main function to run the deletion process
async function main() {
  try {
    await connectToMongoDB();
    console.log("Checking for documents with null expired value...");
    await deleteNullExpiredDocuments();
    console.log("Deletion process completed successfully.");
  } catch (error) {
    console.error("Error during deletion process:", error);
    process.exit(1);
  } finally {
    await client.close();
    console.log("MongoDB connection closed");
  }
}

// Run the script
main();
