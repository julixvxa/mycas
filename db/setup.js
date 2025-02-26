const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Path to your SQL schema file
const schemaPath = path.join(__dirname, 'schema.sql');

// Initialize SQLite database
const db = new sqlite3.Database('database.sqlite');

db.serialize(() => {
    // Read the SQL schema file
    fs.readFile(schemaPath, 'utf8', (err, schema) => {
        if (err) {
            console.error('Error reading schema file:', err);
            return;
        }

        // Execute schema
        db.exec(schema, (err) => {
            if (err) {
                console.error('Error executing schema:', err.message);
            } else {
                console.log('Database schema initialized successfully.');

                // Insert initial data into friendshipStatus table
                db.run(`
                    INSERT INTO friendshipStatus (statusID, statusName) VALUES
                    ('p', 'Pending'),
                    ('a', 'Accepted'),
                    ('d', 'Declined')
                `, (err) => {
                    if (err) {
                        console.error('Error inserting initial data:', err.message);
                    } else {
                        console.log('Initial data inserted successfully.');
                    }
                    db.close();
                });
            }
        });
    });
});
