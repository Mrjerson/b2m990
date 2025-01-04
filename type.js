require("dotenv").config();
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const mysql = require("mysql2");

// Add the stealth plugin to Puppeteer
puppeteer.use(StealthPlugin());

// Create a MySQL connection
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

// Function to insert a category into the 'UDEMYtypes' table
async function insertCategory(typeName) {
  return new Promise((resolve, reject) => {
    const query = "INSERT INTO UDEMYtypes (type_name) VALUES (?)";
    connection.query(query, [typeName], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results.insertId); // Return the inserted Type ID
      }
    });
  });
}

// Function to insert a relationship into the 'UDEMYurl_types' table
async function insertUrlTypeRelation(id, typeId) {
  return new Promise((resolve, reject) => {
    const query = "INSERT INTO UDEMYurl_types (url_id, type_id) VALUES (?, ?)";
    connection.query(query, [id, typeId], (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

// Function to check if a relationship already exists
async function checkRelation(url_id, type_id) {
  return new Promise((resolve, reject) => {
    const query =
      "SELECT * FROM UDEMYurl_types WHERE url_id = ? AND type_id = ?";
    connection.query(query, [url_id, type_id], (err, results) => {
      if (err) {
        return reject(err);
      }
      if (results.length > 0) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

// Function to check if a type already exists
async function checkType(type_name) {
  return new Promise((resolve, reject) => {
    const query = "SELECT type_id FROM UDEMYtypes WHERE type_name = ?";
    connection.query(query, [type_name], (err, results) => {
      if (err) {
        return reject(err);
      }
      resolve(results);
    });
  });
}

// Function to extract categories from a single URL and save to database
async function extractCategoriesAndSave(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle0", timeout: 0 });

  let categories = [];

  try {
    categories = await page.$$eval(
      "ul.ud-unstyled-list.pill-group-module--pill-group--q7hFg li a span.ud-btn-label",
      (spans) => spans.map((span) => span.textContent.trim())
    );
  } catch (error) {
    console.log("No matching elements found for the categories.");
  }

  // Insert each category into the database and link it to the URL
  for (const category of categories) {
    const urlId = await getUrlIdFromDatabase(url);
    const id_type = await checkType(category);
    let relationExists = false;

    for (const type of id_type) {
      const checker = await checkRelation(urlId, type.type_id);
      if (checker) {
        relationExists = true;
        break;
      }
    }

    if (!relationExists) {
      const typeId = await insertCategory(category);
      // Insert the relationship into 'UDEMYurl_types'
      await insertUrlTypeRelation(urlId, typeId)
        .then(() => {
          console.log(
            `Inserted relationship for URL: ${url} and category: ${category}`
          );
        })
        .catch((error) => {
          console.error(
            `Error inserting relationship for URL: ${url} and category: ${category}`,
            error
          );
        });
    }
  }

  await browser.close();
}

// Function to get URL ID from the 'udemy' table
async function getUrlIdFromDatabase(url) {
  return new Promise((resolve, reject) => {
    const query = "SELECT id FROM udemy WHERE url = ?";
    connection.query(query, [url], (err, results) => {
      if (err) {
        reject(err);
      } else if (results.length > 0) {
        resolve(results[0].id); // Return the URL ID
      } else {
        reject(new Error(`URL not found: ${url}`)); // URL not found in the table
      }
    });
  });
}

// Function to get URLs from the 'udemy' table
async function getUrlsFromDatabase() {
  return new Promise((resolve, reject) => {
    const query = "SELECT url FROM udemy WHERE expired IS NOT NULL"; // Updated condition
    connection.query(query, (err, results) => {
      if (err) {
        reject(err);
      } else {
        const urls = results.map((row) => row.url); // Extract URLs into an array
        resolve(urls);
      }
    });
  });
}

// Process URLs from the 'udemy' table
async function processUrls() {
  try {
    const urlArray = await getUrlsFromDatabase(); // Get URLs from the database
    console.log(`Found ${urlArray.length} URLs in the database.`);

    // Iterate over each URL and extract categories
    for (const url of urlArray) {
      await extractCategoriesAndSave(url);
    }
  } catch (error) {
    console.error("Error fetching URLs from database:", error);
    throw error; // Re-throw the error to ensure the process exits with a non-zero status code
  }
}

// Main function to run the script
async function main() {
  try {
    await processUrls();
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
