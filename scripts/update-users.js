const fs = require('fs');
const path = require('path');

// Read the database
const databasePath = path.join(__dirname, '..', 'data', 'database.json');
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));

// Update users to have name and email fields
database.users = database.users.map(user => {
  // Create a full name from firstName and lastName
  const name = user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName;
  
  // Generate an email if missing
  const email = user.email || `${user.firstName.toLowerCase()}${user.lastName ? user.lastName.toLowerCase() : ''}@example.com`;
  
  // Add createdAt and updatedAt if missing
  const now = new Date().toISOString();
  
  return {
    ...user,
    name,
    email,
    createdAt: user.createdAt || now,
    updatedAt: user.updatedAt || now
  };
});

// Save the updated database
fs.writeFileSync(databasePath, JSON.stringify(database, null, 2));

console.log('Successfully updated users with name and email fields');