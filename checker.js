require("dotenv").config();
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { MongoClient } = require("mongodb");

// Add the stealth plugin to Puppeteer
puppeteer.use(StealthPlugin());

// MongoDB connection
const client = new MongoClient(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

let db, udemyCollection;

async function connectToDatabase() {
  try {
    await client.connect();
    db = client.db(); // Uses the database specified in the connection string
    udemyCollection = db.collection("udemy");
    console.log("Connected to MongoDB database.");
  } catch (err) {
    console.error("Error connecting to the database:", err);
    process.exit(1);
  }
}

// Function to extract price and discount from a URL
async function extractPriceSpanAndDiscount(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle0", timeout: 0 });

  let priceText = null;
  let discountText = null;

  try {
    priceText = await page.$eval(
      'span.ud-text-sm[data-purpose="safely-set-inner-html:discount-expiration:expiration-text"]',
      (span) => span.textContent.trim()
    );
  } catch (error) {
    console.log("No matching element found for the price span.");
  }

  try {
    discountText = await page.$eval(
      "div.base-price-text-module--price-part---xQlz.ud-clp-percent-discount.ud-text-sm span:last-child",
      (span) => span.textContent.trim()
    );
  } catch (error) {
    console.log("No matching element found for the discount span.");
  }

  console.log("Price Text:", priceText);
  console.log("Discount Text:", discountText);

  await browser.close();

  return { priceText, discountText };
}

// Function to update the expired and discount fields in the database
async function updateExpiredAndDiscountFields() {
  try {
    // Get all documents from the udemy collection
    const courses = await udemyCollection.find({}).toArray();

    console.log(`Found ${courses.length} URLs in the database.`);

    // Iterate over each course and update the expired and discount fields
    for (const course of courses) {
      const { _id, url } = course;
      console.log(`Processing URL: ${url}`);

      const { priceText, discountText } = await extractPriceSpanAndDiscount(
        url
      );

      // Update the document with the extracted values
      try {
        const result = await udemyCollection.updateOne(
          { _id: _id },
          { $set: { expired: priceText, discount: discountText } }
        );

        if (result.modifiedCount > 0) {
          console.log(`Updated record with id ${_id} successfully.`);
        } else {
          console.log(`No changes made to record with id ${_id}.`);
        }
      } catch (updateErr) {
        console.error(`Error updating record with id ${_id}:`, updateErr);
        continue; // Continue with next record if one fails
      }

      // Add a delay between requests to avoid overwhelming the server
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  } catch (error) {
    console.error("Error during the update process:", error);
    throw error;
  }
}

// Main function to run the script
async function main() {
  try {
    await connectToDatabase();
    await updateExpiredAndDiscountFields();
    console.log("Script completed successfully.");
  } catch (error) {
    console.error("Script failed:", error);
    process.exit(1);
  } finally {
    await client.close();
    console.log("Disconnected from MongoDB.");
  }
}

// Run the script
main();
