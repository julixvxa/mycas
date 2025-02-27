const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const session = require('express-session');
const req = require('express/lib/request');
const bcrypt = require('bcrypt');
const SQLiteStore = require('connect-sqlite3')(session);

require('dotenv').config();


const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    store: new SQLiteStore({
      db: 'sessions.sqlite',
      dir: './db',
      logErrors: true
    }),
    secret: process.env.SESSION_SECRET || 'fallback_secret', // Fallback secret if env isn't loaded.
    resave: false,
    saveUninitialized: true,
    cookie: { 
      secure: false,
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24
    }
  }));

console.log('Loaded session secret:', process.env.SESSION_SECRET);
console.log('express-session version:', require('express-session/package.json').version);
console.log('process.env:', process.env);




// Serve static files from the uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Database setup
const Database = require('better-sqlite3');
const db = new Database('database.db');



const saltRounds = 10;




// register endpoint
app.post('/register', (req, res) => {
    const { schoolFullName, email, userFullName, password } = req.body;
    const userID = email; // Assuming userID is derived from email

    const getSchoolQuery = 'SELECT schoolID FROM school WHERE schoolFullName = ?';
    db.get(getSchoolQuery, [schoolFullName], async (err, row) => {
        if (err) {
            console.error('Error checking school:', err.message);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        let schoolID;

        if (!row) {
            // School does not exist, insert into school table
            const insertSchoolQuery = 'INSERT INTO school (schoolFullName) VALUES (?)';
            db.run(insertSchoolQuery, [schoolFullName], function (err) {
                if (err) {
                    console.error('Error inserting school:', err.message);
                    return res.status(500).json({ success: false, message: 'Database error' });
                }
                schoolID = this.lastID; // Get the auto-generated schoolID

                // Hash the password securely
                bcrypt.hash(password, saltRounds, (err, hashedPassword) => {
                    if (err) {
                        console.error('Error hashing password:', err.message);
                        return res.status(500).json({ success: false, message: 'Server error' });
                    }

                    // Insert user data into the userProfile table
                    const query = 'INSERT INTO userProfile (userID, userFullName, userPasswordHash, schoolID, userRole) VALUES (?, ?, ?, ?, ?)';
                    db.run(query, [userID, userFullName, hashedPassword, schoolID, 'm'], function (err) {
                        if (err) {
                            console.error('Error during registration:', err.message);
                            return res.status(500).json({ success: false, message: 'Database error' });
                        }

                        // Save the session data
                        req.session.userID = userID;
                        res.json({ success: true });
                    });
                });
            });
        } else {
            // School exists, prompt login instead
            res.json({ success: false, message: 'School already registered, please log in' });
        }
    });
});



// Helper function to get the schoolID
function getSchoolID(schoolFullName) {
    return new Promise((resolve, reject) => {
        const query = 'SELECT schoolID FROM school WHERE schoolFullName = ?';
        db.get(query, [schoolFullName], (err, row) => {
            if (err) return reject(err);
            if (!row) return reject(new Error('School does not exist'));
            resolve(row.schoolID);
        });
    });
}


// Signup Endpoint
app.post('/signup', async (req, res) => {
    const { email, fullName, password, school, year } = req.body;
    const userID = email; // Assuming userID is derived from email

    try {
        // Check if the school exists
        const schoolID = await getSchoolID(school);

        // Hash the password securely
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Proceed with user creation in the database
        const query = 'INSERT INTO userProfile (userID, userFullName, userPasswordHash, schoolID, userGraduationYear, userRole) VALUES (?, ?, ?, ?, ?, ?)';
        
        db.run(query, [userID, fullName, hashedPassword, schoolID, year, 's'], function (err) {
            if (err) {
                console.error('Error during sign-up:', err.message);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            
            // Save the user session
            req.session.userID = userID;
            res.json({ success: true });
        });
    } catch (error) {
        console.error('Error processing request:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});




// Login Endpoint
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    const query = 'SELECT * FROM userProfile WHERE userID = ?';
    db.get(query, [email], async (err, user) => {
        if (err) {
            console.error('Error during login:', err.message);
            return res.status(500).json({ success: false, message: 'Server error occurred' });
        }

        if (user) {
            try {
                const match = await bcrypt.compare(password, user.userPasswordHash);

                if (match) {
                    // Successful login, save the session
                    req.session.userID = user.userID;
                    req.session.save((err) => {
                        if (err) {
                            console.error('Error saving session:', err.message);
                            return res.status(500).json({ success: false, message: 'Session error' });
                        }
                        return res.status(200).json({ success: true, userID: user.userID });
                    });
                } else {
                    return res.status(401).json({ success: false, message: 'Invalid credentials' });
                }
            } catch (error) {
                console.error('Error comparing passwords:', error.message);
                return res.status(500).json({ success: false, message: 'Error processing request' });
            }
        } else {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
    });
});



// LOG OUT
app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err.message);
            return res.status(500).send({ success: false, message: 'Failed to log out' });
        }
        res.clearCookie('connect.sid'); // Clear the session cookie
        return res.send({ success: true, message: 'Logged out successfully' });
    });
});




// FETCHING USER ID
app.get('/session-userID', (req, res) => {
    const userID = req.session.userID; // Ensure `userID` is set in the session somewhere else
    res.json({ success: true, userID: userID });
});

// FETCHING FULL NAME
app.get('/user/:userID', (req, res) => {
    const userID = req.params.userID;
    const query = 'SELECT userFullName FROM userProfile WHERE userID = ?';
    db.get(query, [userID], (err, row) => {
        if (err) {
            console.error('Error fetching user full name:', err.message);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        if (row) {
            res.json({ success: true, userFullName: row.userFullName });
        } else {
            res.status(404).json({ success: false, message: 'User not found' });
        }
    });
});



const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Store files in the 'uploads/' folder
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`); // Create unique filenames based on current timestamp
    }
});

// File validation
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpg|jpeg|png|gif|webp/;
    const mimeType = allowedTypes.test(file.mimetype);
    const extName = allowedTypes.test(path.extname(file.originalname).toLowerCase());

    // Check file type
    if (mimeType && extName) {
        return cb(null, true); // Accept the file
    } else {
        cb(new Error('Only image files are allowed'), false); // Reject the file
    }
};

// File size validation 
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 15 * 1024 * 1024 }  // Limit files to 15MB
});



// Create a new post with media
app.post('/post', upload.array('media', 5), (req, res) => {
    console.log('Received request at /post'); // Debugging log
    console.log('Request body:', req.body);
    console.log('Uploaded files:', req.files);

    const { text, category, month, privacy } = req.body;
    const userID = req.session.userID; // Fetch userID from session
    const postDate = new Date().toISOString();

    if (!userID) {
        return res.status(400).json({ success: false, message: 'User not logged in' });
    }

    // Insert post into the database
    const insertPostQuery = 'INSERT INTO post (userID, postCASCategoryID, postMonthID, postText, postDate, postPrivacyID) VALUES (?, ?, ?, ?, ?, ?)';
    db.run(insertPostQuery, [userID, category, month, text, postDate, privacy], function (err) {
        if (err) {
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        const postID = this.lastID;
        const mediaFiles = req.files.map(file => [postID, file.filename]);

        if (mediaFiles.length > 0) {
            // Insert media file info into the database
            const insertMediaQuery = 'INSERT INTO media (postID, mediaFile) VALUES (?, ?)';
            db.parallelize(() => {
                const stmt = db.prepare(insertMediaQuery);
                mediaFiles.forEach(file => stmt.run(file, err => {
                    if (err) {
                        console.error('Error inserting media:', err.message);
                    }
                }));
                stmt.finalize();
            });
        }

        res.json({ success: true, postID: postID });
    });
});


app.get('/posts', (req, res) => {
    const userID = req.query.userID;

    // Base query
    let query = `SELECT * 
                 FROM post 
                 ORDER BY postDate DESC`; // Note: `ORDER BY` comes last

    const params = [];

    // Append `WHERE` clause if `userID` is provided
    if (userID) {
        query = `SELECT * 
                 FROM post
                 WHERE userID = ? 
                 ORDER BY postDate DESC`;
        params.push(userID);
    }

    console.log('Executing query:', query);
    console.log('With params:', params);

    db.all(query, params, (err, posts) => {
        if (err) {
            console.error('Error fetching posts:', err.message);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        // Ensure that `posts` is an array before responding
        if (!Array.isArray(posts)) {
            console.error('Invalid posts data format:', posts);
            return res.status(500).json({ success: false, message: 'Invalid posts data' });
        }

        res.json(posts);
    });
});





// FETCHING MEDIA
app.get('/media/:postID', (req, res) => {
    const postID = req.params.postID;
    const query = 'SELECT mediaFile FROM media WHERE postID = ?';
    db.all(query, [postID], (err, rows) => {
        if (err) {
            console.error('Error fetching media:', err.message);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        res.json(rows);
    });
});


// Endpoint to load posts
app.get('/postload', (req, res) => {
    const userID = req.query.userID;
    const currentUser = req.query.currentUser;
    const userRole = req.query.userRole;  // Retrieve userRole from the query parameters

    // Base query
    let query = `
        SELECT p.*
        FROM post p
        LEFT JOIN friends f ON (p.userID = f.userAddresseeID AND f.userAddresserID = ?) 
                            OR (p.userID = f.userAddresserID AND f.userAddresseeID = ?)
        WHERE 
            ((p.postPrivacyID = 3) OR 
            (p.postPrivacyID = 2 AND (f.statusID = 'a' OR p.userID = ? OR ? = 'm')) OR 
            (p.postPrivacyID = 1 AND (p.userID = ? OR ? = 'm')))
        ORDER BY p.postDate DESC;
    `;
    
    // Array of parameters passed into the query
    const params = [currentUser, currentUser, currentUser, userRole, currentUser, userRole];

    // Append `WHERE` clause if `userID` is provided
    if (userID) {
        query = `SELECT p.*
                FROM post p
                LEFT JOIN friends f ON (p.userID = f.userAddresseeID AND f.userAddresserID = ?) 
                                    OR (p.userID = f.userAddresserID AND f.userAddresseeID = ?)
                WHERE 
                    (((p.postPrivacyID = 3) OR 
                    (p.postPrivacyID = 2 AND (f.statusID = 'a' OR p.userID = ? OR ? = 'm')) OR 
                    (p.postPrivacyID = 1 AND (p.userID = ? OR ? = 'm'))) 
                    AND p.userID = ?)
                ORDER BY p.postDate DESC;
        `;
        params.push(userID);
    }

    

    console.log('Executing query:', query);
    console.log('With params:', params);

    db.all(query, params, (err, posts) => {
        if (err) {
            console.error('Error fetching posts:', err.message);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        // Ensure that `posts` is an array before responding
        if (!Array.isArray(posts)) {
            console.error('Invalid posts data format:', posts);
            return res.status(500).json({ success: false, message: 'Invalid posts data' });
        }

        // Optionally, use userRole here for filtering or additional logic based on user role
        console.log('User Role:', userRole); // You can check the role to filter posts or permissions

        res.json(posts);
    });
});


// SEARCHING POSTS
app.get('/searchPosts', (req, res) => {
    const searchTerm = (req.query.search || '').trim();
    const categoryID = req.query.categoryID;
    const monthID = req.query.monthID;
    const userID = req.query.userID;
    const privacyID = req.query.privacyID;
    const postID = parseInt(req.query.postID, 10);
    const currentUser = req.query.currentUser;
    const userRole = req.query.userRole;

    // Construct the base query
    let query = `
        SELECT post.*
        FROM post
        INNER JOIN userProfile ON post.userID = userProfile.userID
        LEFT JOIN friends f ON (post.userID = f.userAddresseeID AND f.userAddresserID = ?) 
                                OR (post.userID = f.userAddresserID AND f.userAddresseeID = ?)
        WHERE 
            ((post.postPrivacyID = 3) OR 
            (post.postPrivacyID = 2 AND (f.statusID = 'a' OR ? = 'm' OR post.userID = ?)) OR 
            (post.postPrivacyID = 1 AND (post.userID = ? OR ? = 'm')))
    `;

    console.log("user" + userID);

    const queryParams = [currentUser, currentUser, userRole, currentUser, currentUser, userRole];

    if (searchTerm.length === 0) {
        // If searchTerm is empty, return all posts
        if (categoryID) {
            query += ' AND post.postCASCategoryID = ?';
            queryParams.push(categoryID);
        }
        if (monthID) {
            query += ' AND post.postMonthID = ?';
            queryParams.push(monthID);
        }
        if (privacyID) {
            query += ' AND post.postPrivacyID = ?';
            queryParams.push(privacyID);
        }
        if (userID) {
            query += ' AND post.userID = ?';
            queryParams.push(userID);
        } if (postID){
            query += ' AND post.postID = ?';
            queryParams.push(postID);
        }
        query += ' ORDER BY post.postDate DESC';

        console.log('SQL Query:', query);
        console.log('Query Parameters:', queryParams);

        db.all(query, queryParams, (err, rows) => {
            if (err) {
                console.error('Error executing query:', err.message);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            res.json({ success: true, posts: rows });
        });
    } else {
        const searchTerms = searchTerm.split(',').map(term => term.trim()).filter(term => term.length > 0);

        if (searchTerms.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid search terms provided' });
        }

        const conditions = [];

        // Generate conditions to match all search terms
        searchTerms.forEach(term => {
            conditions.push(`(post.postText LIKE ? OR userProfile.userFullName LIKE ?)`);
            queryParams.push(`%${term}%`, `%${term}%`);
        });

        if (conditions.length > 0) {
            query += ' AND ' + conditions.join(' AND ');
        }

        if (categoryID) {
            query += ' AND post.postCASCategoryID = ?';
            queryParams.push(categoryID);
        }
        if (monthID) {
            query += ' AND post.postMonthID = ?';
            queryParams.push(monthID);
        } 
        if (privacyID) {
            query += ' AND post.postPrivacyID = ?';
            queryParams.push(privacyID);
        }
        if (userID) {
            query += ' AND post.userID = ?';
            queryParams.push(userID);
        }
        query += ' ORDER BY post.postDate DESC';

        console.log('SQL Query:', query);
        console.log('Query Parameters:', queryParams);

        db.all(query, queryParams, (err, rows) => {
            if (err) {
                console.error('Error executing query:', err.message);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            res.json({ success: true, posts: rows });
        });
    }
});


app.get('/searchUser', (req, res) => {
    const searchTerm = req.query.term ? `%${req.query.term.toLowerCase()}%` : '';
    const userID = req.query.userID; // Get the logged-in user's ID from the request


    if (!searchTerm) {
        return res.status(400).json({ success: false, message: 'Search term is required' });
    }

    if (!userID) {
        return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    // Prepare the query with placeholders for parameter binding
    const query = `
        SELECT 
            userProfile.userID, 
            userProfile.userFullName, 
            userProfile.schoolID, 
            userProfile.userGraduationYear,
            school.schoolFullName
        FROM 
            userProfile
        LEFT JOIN 
            school ON userProfile.schoolID = school.schoolID
        WHERE 
            (LOWER(userProfile.userFullName) LIKE ? OR LOWER(school.schoolFullName) LIKE ?)
            AND userProfile.userID != ?;  -- Exclude the logged-in user
    `;

    // Execute the query with the search term and logged-in user ID as parameters
    db.all(query, [searchTerm, searchTerm, userID], (err, rows) => {
        if (err) {
            console.error('Error executing query', err);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        res.json({
            success: true,
            users: rows
        });
    });
});



// LOADING COMMENTS
app.get('/comments', (req, res) => {
    const { postID } = req.query;

    if (!postID) {
        return res.status(400).json({ success: false, message: 'Post ID is required' });
    }

    // Query to fetch comments and user roles
    const query = `
        SELECT c.commentID, c.postID, c.commentDate, c.commentText, c.commentingUserID, u.userRole
        FROM comments c
        JOIN userProfile u ON c.commentingUserID = u.userID
        WHERE c.postID = ?
        ORDER BY CASE 
            WHEN u.userRole = 'm' THEN 0 
            ELSE 1 
        END, c.commentDate DESC
    `;

    db.all(query, [postID], (err, rows) => {
        if (err) {
            console.error('Error fetching comments:', err.message);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        // Extract userIDs from comments
        const userIDs = rows.map(comment => comment.commentingUserID);
        const userQuery = 'SELECT userID, userFullName FROM userProfile WHERE userID IN (' + userIDs.map(() => '?').join(',') + ')';

        db.all(userQuery, userIDs, (err, users) => {
            if (err) {
                console.error('Error fetching users:', err.message);
                return res.status(500).json({ success: false, message: 'Database error' });
            }

            // Create a map of userID to userFullName for quick lookup
            const userMap = new Map(users.map(user => [user.userID, user.userFullName]));

            // Attach userFullName to each comment
            const commentsWithUserNames = rows.map(comment => ({
                ...comment,
                userFullName: userMap.get(comment.commentingUserID) || 'Unknown'
            }));

            res.json(commentsWithUserNames);
        });
    });
});


// ADDING NEW COMMENTS
app.post('/add-comments', (req, res) => {
    const { postID, commentText } = req.body;
    const commentingUserID = req.session.userID; // Assuming user is authenticated and userID is stored in session

    if (!postID || !commentText || !commentingUserID) {
        return res.status(400).json({ success: false, message: 'Post ID, comment text, and user ID are required' });
    }

    const commentDate = new Date().toISOString(); // Get the current date and time in ISO format

    // Correct the parameter order in the query
    const query = 'INSERT INTO comments (postID, commentDate, commentText, commentingUserID) VALUES (?, ?, ?, ?)';

    db.run(query, [postID, commentDate, commentText, commentingUserID], function(err) {
        if (err) {
            console.error('Error inserting comment:', err.message);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        res.json({ success: true, commentID: this.lastID }); // Return the ID of the newly inserted comment
    });
});

// INSERTING RECORDS INTO LIKES
app.post('/like', (req, res) => {
    const { postID } = req.body;
    const userID = req.session.userID; // Assuming user is authenticated and userID is stored in session

    if (!postID || !userID) {
        return res.status(400).json({ success: false, message: 'Post ID and user ID are required' });
    }

    const query = 'INSERT OR IGNORE INTO likes (postID, userID) VALUES (?, ?)';

    db.run(query, [postID, userID], function(err) {
        if (err) {
            console.error('Error inserting like:', err.message);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        res.json({ success: true });
    });
});

// GETTING THE NUMBER OF LIKES
app.get('/like-count', (req, res) => {
    const { postID } = req.query;

    if (!postID) {
        return res.status(400).json({ success: false, message: 'Post ID is required' });
    }

    const query = `
        SELECT COUNT(*) AS totalLikes
        FROM likes
        WHERE postID = ?
    `;

    db.get(query, [postID], (err, row) => {
        if (err) {
            console.error('Error fetching likes:', err.message);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        res.json({ totalLikes: row.totalLikes });
    });
});

// DELETING COMMENTS
app.delete('/comments/:commentID', (req, res) => {
    const commentID = req.params.commentID;
    const userID = req.session.userID; // Assuming user is authenticated and userID is stored in session

    if (!commentID || !userID) {
        return res.status(400).json({ success: false, message: 'Comment ID and user ID are required' });
    }

    // Check user's role
    db.get('SELECT userRole FROM userProfile WHERE userID = ?', [userID], (err, row) => {
        if (err) {
            console.error('Error checking user role:', err.message);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (!row) {
            console.error('User not found:', userID);
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const userRole = row.userRole;

        if (userRole === 'm') {
            // Role "m" can delete any comment
            db.run('DELETE FROM comments WHERE commentID = ?', [commentID], function(err) {
                if (err) {
                    console.error('Error deleting comment:', err.message);
                    return res.status(500).json({ success: false, message: 'Database error' });
                }

                res.json({ success: true });
            });
        } else if (userRole === 's') {
            // Role "s" can only delete their own comments
            db.get('SELECT commentingUserID FROM comments WHERE commentID = ?', [commentID], (err, row) => {
                if (err) {
                    console.error('Error fetching comment author:', err.message);
                    return res.status(500).json({ success: false, message: 'Database error' });
                }

                if (!row) {
                    console.error('Comment not found for commentID:', commentID);
                    return res.status(404).json({ success: false, message: 'Comment not found' });
                }

                if (row.commentingUserID !== userID) {
                    return res.status(403).json({ success: false, message: 'Not authorized to delete this comment' });
                }

                // User is authorized to delete their own comment
                db.run('DELETE FROM comments WHERE commentID = ?', [commentID], function(err) {
                    if (err) {
                        console.error('Error deleting comment:', err.message);
                        return res.status(500).json({ success: false, message: 'Database error' });
                    }

                    res.json({ success: true });
                });
            });
        } else {
            res.status(403).json({ success: false, message: 'Not authorized to delete comments' });
        }
    });
});


// FETCHING ROLE
app.get('/userRole', (req, res) => {
    const userID = req.session.userID; // Assuming user is authenticated and userID is stored in session

    if (!userID) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const query = 'SELECT userRole FROM userProfile WHERE userID = ?';
    db.get(query, [userID], (err, row) => {
        if (err) {
            console.error('Error fetching user role:', err.message);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (!row) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ role: row.userRole, userID: userID });
    });
});



// DELETING POSTS
app.delete('/posts/:postID', (req, res) => {
    const postID = req.params.postID;
    const userID = req.session.userID; // Assuming user is authenticated and userID is stored in session

    if (!postID || !userID) {
        return res.status(400).json({ success: false, message: 'Post ID and user ID are required' });
    }

    console.log('Session userID:', userID);

    // Check user's role
    db.get('SELECT userRole FROM userProfile WHERE userID = ?', [userID], (err, row) => {
        if (err) {
            console.error('Error checking user role:', err.message);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        console.log('User role:', row.userRole);
        const userRole = row.userRole;
        

        if (userRole === 'm') {
            // Role "m" can delete any post
            db.run('DELETE FROM post WHERE postID = ?', [postID], function(err) {
                if (err) {
                    console.error('Error deleting post:', err.message);
                    return res.status(500).json({ success: false, message: 'Database error' });
                }

                // Also delete associated comments
                db.run('DELETE FROM comments WHERE postID = ?', [postID], function(err) {
                    if (err) {
                        console.error('Error deleting comments:', err.message);
                        return res.status(500).json({ success: false, message: 'Database error' });
                    }

                    res.json({ success: true });
                });
            });
        } else if (userRole === 's') {
            // Role "s" can only delete their own posts
            db.get('SELECT userID FROM post WHERE postID = ?', [postID], (err, row) => {
                if (err) {
                    console.error('Error fetching post author:', err.message);
                    return res.status(500).json({ success: false, message: 'Database error' });
                }

                if (row.userID !== userID) {
                    return res.status(403).json({ success: false, message: 'Not authorized to delete this post' });
                }

                // User is authorized to delete their own post
                db.run('DELETE FROM post WHERE postID = ?', [postID], function(err) {
                    if (err) {
                        console.error('Error deleting post:', err.message);
                        return res.status(500).json({ success: false, message: 'Database error' });
                    }

                    // Also delete associated comments
                    db.run('DELETE FROM comments WHERE postID = ?', [postID], function(err) {
                        if (err) {
                            console.error('Error deleting comments:', err.message);
                            return res.status(500).json({ success: false, message: 'Database error' });
                        }

                        res.json({ success: true });
                    });
                });
            });
        } else {
            res.status(403).json({ success: false, message: 'Not authorized to delete posts' });
        }
    });
});



// Route to fetch user information and their posts
app.get('/user-info/:userID', (req, res) => {
    const userID = req.params.userID; // Fetch userID from URL parameters

    if (!userID) {
        console.error('User ID not provided');
        return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    db.get(`SELECT userProfile.userID, userProfile.userFullName, userProfile.userGraduationYear, school.schoolFullName
            FROM userProfile
            INNER JOIN school ON userProfile.schoolID = school.schoolID
            WHERE userProfile.userID = ?`, [userID], (err, row) => {
        if (err) {
            console.error('Error fetching user info:', err.message);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (!row) {
            console.error('User not found');
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({
            success: true,
            userID: row.userID,
            userFullName: row.userFullName,
            userGraduationYear: row.userGraduationYear,
            schoolFullName: row.schoolFullName
        });
    });
});



app.get('/user-statistics/:userID', (req, res) => {
    const userID = req.params.userID;

    // Query to get the total number of posts by the user
    const totalPostsQuery = 'SELECT COUNT(*) AS totalPosts FROM post WHERE userID = ?';

    
    // Query to get the number of posts by CAS category
    const postsByCategoryQuery = `
    SELECT postCASCategoryID, COUNT(*) AS count
    FROM post
    WHERE userID = ?
    GROUP BY postCASCategoryID;
    `;    

    // Execute the queries
    db.get(totalPostsQuery, [userID], (err, totalPostsResult) => {
        if (err) {
            console.error('Error fetching total posts count:', err);
            return res.status(500).json({ error: 'Error fetching total posts count' });
        }
        
        db.all(postsByCategoryQuery, [userID], (err, postsByCategoryResult) => {
            if (err) {
                console.error('Error fetching posts by category:', err);
                return res.status(500).json({ error: 'Error fetching posts by category' });
            }
                
            res.json({ success: true, totalPosts: totalPostsResult.totalPosts, postsByCategory: postsByCategoryResult});

        });
    });
});



app.post('/api/friends/request', async (req, res) => {
    const { userAddresserID, userAddresseeID } = req.body;

    try {
        await db.run('INSERT INTO friends (userAddresserID, userAddresseeID, statusID) VALUES (?, ?, ?)', [
            userAddresserID,
            userAddresseeID,
            'p'
        ]);

        res.status(200).send({ message: 'Friend request sent' });
    } catch (error) {
        console.error('Error sending friend request:', error);
        res.status(500).send({ error: 'Failed to send friend request' });
    }
});

app.get('/check-status', (req, res) => {
    const { userAddresserID, userAddresseeID } = req.query;

    if (!userAddresserID || !userAddresseeID) {
        return res.status(400).json({ error: 'Both userAddresserID and userAddresseeID are required' });
    }

    const query = `
    SELECT statusID, userAddresserID, userAddresseeID
    FROM friends
    WHERE (userAddresserID = ? AND userAddresseeID = ?)
       OR (userAddresserID = ? AND userAddresseeID = ?)
    `;


    const params = [userAddresserID, userAddresseeID, userAddresseeID, userAddresserID];

    db.get(query, params, (err, row) => {
        if (err) {
            console.error('Database error:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
    
        // Handle possible friendship statuses
        if (row) {
            const status = row.statusID;
            const addresserID = row.userAddresserID;
            const addresseeID = row.userAddresseeID;
            if (['p', 'a', 'd'].includes(status)) {
                res.json({ status, userAddresserID: addresserID, userAddresseeID: addresseeID });
            } else {
                console.error('Unexpected status value:', status);
                res.json({ status: 'd', userAddresserID, userAddresseeID }); // Default to 'd' if status is unexpected
            }
        } else {
            // If no row is found, assume users are not friends
            res.json({ status: 'd', userAddresserID, userAddresseeID });
        }
    });
});    


app.post('/api/friends/respond', async (req, res) => {
    const { userAddresserID, userAddresseeID, action } = req.body;

    console.log(`Received action: ${action} from ${userAddresseeID} to ${userAddresserID}`);

    try {
        let statusID;
        if (action === 'accept') {
            statusID = 'a'; // accepted
        } else if (action === 'decline') {
            // We’ll delete the declined request instead of updating the status
            console.log(`Deleting declined friend request between ${userAddresserID} and ${userAddresseeID}`);
            
            db.run(`
                DELETE FROM friends
                WHERE (userAddresserID = ? AND userAddresseeID = ?)
                   OR (userAddresserID = ? AND userAddresseeID = ?)
            `, [userAddresserID, userAddresseeID, userAddresseeID, userAddresserID], function (err) {
                if (err) {
                    console.error('Error deleting declined request:', err);
                    return res.status(500).send({ error: 'Database error during DELETE' });
                }

                console.log(`Delete successful: ${this.changes} rows affected`);

                if (this.changes > 0) {
                    res.status(200).send({ message: `Friend request declined and removed successfully` });
                } else {
                    res.status(400).send({ error: 'Failed to delete declined friend request' });
                }
            });
            return; // Exit here since decline action is handled
        } else {
            return res.status(400).send({ error: 'Invalid action' });
        }

        // Proceed with accepting the request if action was 'accept'
        console.log(`Checking if relationship exists between ${userAddresserID} and ${userAddresseeID}...`);
        
        db.get(`
            SELECT * FROM friends
            WHERE (userAddresserID = ? AND userAddresseeID = ?)
               OR (userAddresserID = ? AND userAddresseeID = ?)
        `, [userAddresserID, userAddresseeID, userAddresseeID, userAddresserID], function (err, row) {
            if (err) {
                console.error('Error checking relationship:', err);
                return res.status(500).send({ error: 'Database error during SELECT' });
            }

            if (row) {
                // Relationship exists, we should update it
                console.log(`Relationship found between ${userAddresserID} and ${userAddresseeID}. Updating status to ${statusID}.`);
                
                db.run(`
                    UPDATE friends
                    SET statusID = ?
                    WHERE (userAddresserID = ? AND userAddresseeID = ?)
                       OR (userAddresserID = ? AND userAddresseeID = ?)
                `, [statusID, userAddresserID, userAddresseeID, userAddresseeID, userAddresserID], function (err) {
                    if (err) {
                        console.error('Error updating relationship:', err);
                        return res.status(500).send({ error: 'Database error during UPDATE' });
                    }

                    console.log(`Update successful: ${this.changes} rows affected`);

                    if (this.changes > 0) {
                        res.status(200).send({ message: `Friend request accepted successfully` });
                    } else {
                        res.status(400).send({ error: 'Failed to update friend request' });
                    }
                });
            } else {
                // No existing relationship, create a new friend request
                console.log(`No relationship found between ${userAddresserID} and ${userAddresseeID}. Inserting new friend request with status ${statusID}.`);
                
                db.run(`
                    INSERT INTO friends (userAddresserID, userAddresseeID, statusID)
                    VALUES (?, ?, ?)
                `, [userAddresserID, userAddresseeID, statusID], function (err) {
                    if (err) {
                        console.error('Error inserting new relationship:', err);
                        return res.status(500).send({ error: 'Database error during INSERT' });
                    }

                    console.log(`New friend request inserted: ${this.changes} row(s) affected`);
                    res.status(200).send({ message: `Friend request sent successfully` });
                });
            }
        });
    } catch (error) {
        console.error('Error responding to friend request:', error);
        res.status(500).send({ error: 'An error occurred' });
    }
});


// Endpoint to get the three latest friends
// Updated endpoint to get the three latest friends with their names and IDs
app.get('/api/friends/latest/:userID', async (req, res) => {
    const { userID } = req.params;

    try {
        const query = `
            SELECT u.userID, u.userFullName
            FROM friends f
            JOIN userProfile u ON u.userID = CASE
                WHEN f.userAddresserID = ? THEN f.userAddresseeID
                ELSE f.userAddresserID
            END
            WHERE (f.userAddresserID = ? OR f.userAddresseeID = ?)
            AND f.statusID = 'a'
            ORDER BY f.friendshipID DESC
            LIMIT 3
        `;

        db.all(query, [userID, userID, userID], (err, rows) => {
            if (err) {
                console.error('Error fetching latest friends with names:', err);
                return res.status(500).send({ success: false, error: 'Database error' });
            }

            res.status(200).send({ success: true, friends: rows });
        });
    } catch (error) {
        console.error('Error in /api/friends/latest:', error);
        res.status(500).send({ success: false, error: 'An error occurred' });
    }
});



// Endpoint to create a notification
// Endpoint to create a notification
app.post('/api/sendNotifications', async (req, res) => {
    const { userID, notificationType, actorID, postID } = req.body;

    if (!userID || !notificationType) {
        return res.status(400).send({ error: 'userID and notificationType are required' });
    }

    if (userID === actorID) {
        // No notification needed, return early
        return res.status(200).send({ message: 'No notification created: userID and actorID are the same' });
    }

    try {
        await db.run(
            'INSERT INTO notifications (userID, notificationType, actorID, postID) VALUES (?, ?, ?, ?)',
            [userID, notificationType, actorID, postID]
        );

        res.status(200).send({ message: 'Notification created' });
    } catch (error) {
        console.error('Error creating notification:', error);
        res.status(500).send({ error: 'Failed to create notification' });
    }
});

// Endpoint to get notifications for a user
app.get('/api/getNotifications', async (req, res) => {
    const { userID } = req.query;

    try {
        // Validate userID
        if (!userID) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        // Query the database
        const notifications = await new Promise((resolve, reject) => {
            db.all(`
                SELECT n.*, u.userFullName
                FROM notifications n
                JOIN userProfile u ON n.actorID = u.userID
                WHERE n.userID = ? 
                ORDER BY n.notificationTime DESC;
            `, [userID], (err, rows) => {
                if (err) {
                    return reject(err);
                }
                resolve(rows);
            });
        });

        // Check if notifications is an array
        if (Array.isArray(notifications)) {
            res.status(200).json(notifications);
        } else {
            console.error('Invalid notifications data: Not an array');
            res.status(500).json({ error: 'Invalid notifications data' });
        }
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).send({ error: 'Failed to fetch notifications' });
    }
});




app.get('/api/getPostOwnerID', (req, res) => {
    const { postID } = req.query;

    if (!postID) {
        return res.status(400).json({ error: 'postID is required' });
    }

    const query = 'SELECT userID FROM post WHERE postID = ?';

    db.get(query, [postID], (err, row) => {
        if (err) {
            console.error('Database error:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }

        if (row) {
            res.status(200).json({ userID: row.userID });
        } else {
            res.status(404).json({ error: 'Post not found' });
        }
    });
});




app.post('/change-password', async (req, res) => {
    const { userID, oldPassword, newPassword } = req.body;

    if (!userID || !oldPassword || !newPassword) {
        return res.json({ success: false, message: 'All fields are required' });
    }

    try {
        // Get the stored password hash for the user
        db.get(`SELECT userPasswordHash FROM userProfile WHERE userID = ?`, [userID], async (err, row) => {
            if (err || !row) return res.json({ success: false, message: 'User not found' });

            // Compare old password with stored hash
            const match = await bcrypt.compare(oldPassword, row.userPasswordHash);
            if (!match) return res.json({ success: false, message: 'Incorrect old password' });

            // Hash the new password
            const newHashedPassword = await bcrypt.hash(newPassword, 10);

            // Update the password in the database
            db.run(`UPDATE userProfile SET userPasswordHash = ? WHERE userID = ?`, [newHashedPassword, userID], function (err) {
                if (err) return res.json({ success: false, message: 'Database error' });

                res.json({ success: true, message: 'Password updated successfully' });
            });
        });
    } catch (error) {
        console.error('Error changing password:', error);
        res.json({ success: false, message: 'Internal server error' });
    }
});



app.listen(process.env.PORT || 3000, () => {
    console.log("On work")
})
