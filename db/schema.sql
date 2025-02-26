-- Table for schools
CREATE TABLE school (
    schoolID INTEGER PRIMARY KEY AUTOINCREMENT,
    schoolFullName TEXT NOT NULL
);

-- Table for user profiles
CREATE TABLE userProfile (
    userID TEXT PRIMARY KEY,
    userFullName TEXT NOT NULL,
    userPasswordHash TEXT NOT NULL,
    schoolID INTEGER,
    userRole TEXT NOT NULL,
    userGraduationYear INTEGER,
    FOREIGN KEY (schoolID) REFERENCES school(schoolID)
);

-- Table for posts
CREATE TABLE post (
    postID INTEGER PRIMARY KEY AUTOINCREMENT,
    userID TEXT,
    postCASCategoryID INTEGER,
    postMonthID INTEGER,
    postText TEXT NOT NULL,
    postPrivacyID INTEGER,
    postDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userID) REFERENCES userProfile(userID)
);

-- Table for comments on posts
CREATE TABLE comments (
    commentID INTEGER PRIMARY KEY AUTOINCREMENT,
    postID TEXT,
    commentDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    commentText TEXT NOT NULL,
    commentingUserID TEXT NOT NULL,
    FOREIGN KEY (postID) REFERENCES post(postID),
    FOREIGN KEY (commentingUserID) REFERENCES userProfile(userID)
);

-- Table for likes on posts
CREATE TABLE likes (
    postID INTEGER NOT NULL,
    userID TEXT NOT NULL,
    FOREIGN KEY (postID) REFERENCES posts(postID),
    FOREIGN KEY (userID) REFERENCES userProfile(userID),
    UNIQUE (postID, userID)
);

-- Table for friendship statuses
CREATE TABLE friendshipStatus (
    statusID TEXT PRIMARY KEY,
    statusName TEXT NOT NULL
);

-- Table for media associated with posts
CREATE TABLE media (
    postID TEXT,
    mediaFile TEXT PRIMARY KEY,
    FOREIGN KEY (postID) REFERENCES post(postID)
);

-- Table for notifications
CREATE TABLE notifications (
    notificationID INTEGER PRIMARY KEY AUTOINCREMENT,
    userID TEXT,
    notificationType TEXT NOT NULL,
    notificationTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actorID TEXT,
    postID INTEGER,
    FOREIGN KEY (postID) REFERENCES post(postID),
    FOREIGN KEY (actorID) REFERENCES userProfile(userID),
    FOREIGN KEY (userID) REFERENCES userProfile(userID)
);

-- Table for friends
CREATE TABLE friends (
    friendshipID INTEGER PRIMARY KEY AUTOINCREMENT,
    userAddresserID TEXT,
    userAddresseeID TEXT,
    statusID TEXT DEFAULT 'd',
    FOREIGN KEY (userAddresserID) REFERENCES userProfile(userID),
    FOREIGN KEY (userAddresseeID) REFERENCES userProfile(userID),
    FOREIGN KEY (statusID) REFERENCES friendshipStatus(statusID),
    UNIQUE (userAddresserID, userAddresseeID) -- Ensures no duplicate relationships
);
