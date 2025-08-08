const fs = require('fs');
const path = require('path');

// Read the database
const databasePath = path.join(__dirname, '..', 'data', 'database.json');
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));

// Find The Portland Company and add Spencer as a member
database.organizations = database.organizations.map(org => {
  if (org.id === 'org-tpc') {
    return {
      ...org,
      memberIds: ['user-47554087'] // Spencer's ID
    };
  }
  return org;
});

// Save the updated database
fs.writeFileSync(databasePath, JSON.stringify(database, null, 2));

console.log('Successfully added Spencer as a member of The Portland Company');