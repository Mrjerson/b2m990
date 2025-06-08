require("dotenv").config();
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { MongoClient } = require("mongodb");

// Add the stealth plugin to Puppeteer
puppeteer.use(StealthPlugin());

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

// Function to extract categories from a single URL and save to database
async function extractCategoriesAndSave(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle0", timeout: 0 });

  let categories = [];

  try {
    categories = await page.$$eval("li a span.ud-btn-label", (spans) =>
      spans.map((span) => span.textContent.trim())
    );
  } catch (error) {
    console.log("No matching elements found for the categories.");
  }

  // Update the Udemy document with the categories
  if (categories.length > 0) {
    try {
      const result = await db.collection("udemy").updateOne(
        { url: url },
        {
          $addToSet: { categories: { $each: categories } },
          $set: { lastUpdated: new Date() },
        }
      );

      if (result.modifiedCount > 0) {
        console.log(`Updated categories for URL: ${url}`);
      } else {
        console.log(
          `No document found for URL: ${url} or no new categories to add`
        );
      }
    } catch (error) {
      console.error(`Error updating categories for URL: ${url}`, error);
    }
  }

  await browser.close();
}

// Function to get URLs from the 'udemy' collection
async function getUrlsFromDatabase() {
  try {
    const cursor = db
      .collection("udemy")
      .find(
        { expired: { $exists: true, $ne: null } },
        { projection: { url: 1, _id: 0 } }
      );
    const urls = await cursor.map((doc) => doc.url).toArray();
    console.log(`Found ${urls.length} URLs in the database.`);
    return urls;
  } catch (error) {
    console.error("Error fetching URLs from database:", error);
    throw error;
  }
}

// Process URLs from the 'udemy' collection
async function processUrls() {
  try {
    const urlArray = await getUrlsFromDatabase();

    // Iterate over each URL and extract categories
    for (const url of urlArray) {
      await extractCategoriesAndSave(url);
    }
  } catch (error) {
    console.error("Error processing URLs:", error);
    throw error;
  }
}

// Main function to run the script
async function main() {
  try {
    await connectToMongoDB();
    await processUrls();
    console.log("Script completed successfully.");
  } catch (error) {
    console.error("Script failed:", error);
    process.exit(1);
  } finally {
    await client.close();
    console.log("MongoDB connection closed");
  }
}

// Run the script
main();
