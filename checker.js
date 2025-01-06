require("dotenv").config();
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const mysql = require("mysql2");

// Add the stealth plugin to Puppeteer
puppeteer.use(StealthPlugin());

// Create a connection to the database
const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

connection.connect((err) => {
  if (err) {
    console.error("Error connecting to the database:", err);
    process.exit(1); // Exit with an error code
  }
  console.log("Connected to the database");
});

// Function to extract price and discount from a URL
async function extractPriceSpanAndDiscount(url) {
  const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'] // Add these arguments
});
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle0", timeout: 0 }); // Increase timeout for Cloudflare

  let priceText = null;
  let discountText = null;

  try {
    // Select the specific span by its class and data-purpose attributes for expiration
    priceText = await page.$eval(
      'span.ud-text-sm[data-purpose="safely-set-inner-html:discount-expiration:expiration-text"]',
      (span) => {
        return span.textContent.trim(); // Extract the text content and trim any extra spaces
      }
    );
  } catch (error) {
    console.log("No matching element found for the price span.");
  }

  try {
    // Select the discount percentage from the div
    discountText = await page.$eval(
      "div.base-price-text-module--price-part---xQlz.ud-clp-percent-discount.ud-text-sm span:last-child",
      (span) => {
        return span.textContent.trim(); // Extract the discount percentage
      }
    );
  } catch (error) {
    console.log("No matching element found for the discount span.");
  }

  console.log("Price Text:", priceText); // Log the extracted price text or null if not found
  console.log("Discount Text:", discountText); // Log the extracted discount text or null if not found

  await browser.close(); // Close the browser

  return { priceText, discountText };
}

// Function to update the expired and discount columns in the database
async function updateExpiredAndDiscountColumns() {
  try {
    // Query to get URLs from the udemy table
    const query = "SELECT id, url FROM udemy";

    const results = await new Promise((resolve, reject) => {
      connection.query(query, (err, results) => {
        if (err) {
          reject(err);
        } else {
          resolve(results);
        }
      });
    });

    console.log(`Found ${results.length} URLs in the database.`);

    // Iterate over each URL and update the expired and discount columns
    for (const row of results) {
      const { id, url } = row;
      console.log(`Processing URL: ${url}`);

      const { priceText, discountText } = await extractPriceSpanAndDiscount(url);

      // Update the expired and discount columns with the extracted values
      const updateQuery =
        "UPDATE udemy SET expired = ?, discount = ? WHERE id = ?";
      await new Promise((resolve, reject) => {
        connection.query(
          updateQuery,
          [priceText, discountText, id],
          (updateErr) => {
            if (updateErr) {
              console.error(`Error updating record with id ${id}:`, updateErr);
              reject(updateErr);
            } else {
              console.log(`Updated record with id ${id} successfully.`);
              resolve();
            }
          }
        );
      });

      // Add a delay between requests to avoid overwhelming the server
      await new Promise((resolve) => setTimeout(resolve, 5000)); // 5-second delay
    }
  } catch (error) {
    console.error("Error during the update process:", error);
    throw error; // Re-throw the error to ensure the process exits with a non-zero status code
  }
}

// Main function to run the script
async function main() {
  try {
    await updateExpiredAndDiscountColumns();
    console.log("Script completed successfully.");
  } catch (error) {
    console.error("Script failed:", error);
    process.exit(1); // Exit with a non-zero status code to indicate failure
  } finally {
    connection.end(); // Close the database connection
  }
}

// Run the script
main();
