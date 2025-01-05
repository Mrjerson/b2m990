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
    // Step 1: Delete related rows from `UDEMYurl_types`
    const deleteUrlTypesQuery = `
      DELETE UDEMYurl_types
      FROM UDEMYurl_types
      INNER JOIN udemy ON UDEMYurl_types.url_id = udemy.id
      WHERE udemy.expired IS NULL;
    `;

    db.query(deleteUrlTypesQuery, (err, results) => {
      if (err) {
        console.error(
          "Error deleting rows from UDEMYurl_types with NULL expired value:",
          err.message
        );
        reject(err);
      } else {
        console.log(
          `Deleted ${results.affectedRows} rows from UDEMYurl_types with NULL expired value.`
        );

        // Step 2: Delete related rows from `UDEMYtypes`
        const deleteTypesQuery = `
          DELETE UDEMYtypes
          FROM UDEMYtypes
          INNER JOIN UDEMYurl_types ON UDEMYtypes.type_id = UDEMYurl_types.type_id
          WHERE UDEMYurl_types.url_id IN (
            SELECT id FROM udemy WHERE expired IS NULL
          );
        `;

        db.query(deleteTypesQuery, (err, results) => {
          if (err) {
            console.error(
              "Error deleting rows from UDEMYtypes with NULL expired value:",
              err.message
            );
            reject(err);
          } else {
            console.log(
              `Deleted ${results.affectedRows} rows from UDEMYtypes with NULL expired value.`
            );

            // Step 3: Delete rows from `udemy`
            const deleteUdemyQuery = `
              DELETE FROM udemy
              WHERE expired IS NULL;
            `;

            db.query(deleteUdemyQuery, (err, results) => {
              if (err) {
                console.error(
                  "Error deleting rows from udemy with NULL expired value:",
                  err.message
                );
                reject(err);
              } else {
                console.log(
                  `Deleted ${results.affectedRows} rows from udemy with NULL expired value.`
                );
                resolve(results);
              }
            });
          }
        });
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
