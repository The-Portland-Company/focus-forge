const fs = require('fs');
const path = require('path');

// Read the database
const databasePath = path.join(__dirname, '..', 'data', 'database.json');
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));

// Update users to have active status if not already set
database.users = database.users.map(user => {
  if (!user.status) {
    return {
      ...user,
      status: 'active'
    };
  }
  return user;
});

// Save the updated database
fs.writeFileSync(databasePath, JSON.stringify(database, null, 2));

console.log('Successfully updated users with status field');