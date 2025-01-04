require("dotenv").config();
const mysql = require("mysql2");

// Database connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to the database:", err.stack);
    process.exit(1); // Exit with an error code
  }
  console.log("Connected to MySQL database.");
});

// Function to delete rows where the `expired` column is NULL
async function deleteNullExpiredRows() {
  return new Promise((resolve, reject) => {
    // Define the query to delete rows where the `expired` column is NULL
    const query = "DELETE FROM udemy WHERE expired IS NULL";

    db.query(query, (err, results) => {
      if (err) {
        console.error(
          "Error deleting rows with NULL expired value:",
          err.message
        );
        reject(err);
      } else {
        console.log(
          `Deleted ${results.affectedRows} rows with NULL expired value.`
        );
        resolve(results);
      }
    });
  });
}

// Main function to run the deletion process
async function main() {
  try {
    console.log("Checking for rows with NULL expired value...");
    await deleteNullExpiredRows();
    console.log("Deletion process completed successfully.");
  } catch (error) {
    console.error("Error during deletion process:", error.message);
    process.exit(1); // Exit with a non-zero status code to indicate failure
  } finally {
    db.end(); // Close the database connection
  }
}

// Run the script
main();
