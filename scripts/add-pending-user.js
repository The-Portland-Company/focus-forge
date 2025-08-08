const fs = require('fs');
const path = require('path');

// Read the database
const databasePath = path.join(__dirname, '..', 'data', 'database.json');
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));

// Add Jane Smith as a pending user
const janeSmith = {
  id: `user-${Date.now()}`,
  firstName: 'Jane',
  lastName: 'Smith',
  name: 'Jane Smith',
  email: 'jane.smith@example.com',
  profileColor: '#8B5CF6',
  animationsEnabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  status: 'pending',
  invitedAt: new Date().toISOString(),
  invitedBy: 'user-47554087' // Spencer
};

// Add to users array
database.users.push(janeSmith);

// Add to The Portland Company organization
const tpcOrg = database.organizations.find(org => org.id === 'org-tpc');
if (tpcOrg) {
  if (!tpcOrg.memberIds) {
    tpcOrg.memberIds = [];
  }
  if (!tpcOrg.memberIds.includes(janeSmith.id)) {
    tpcOrg.memberIds.push(janeSmith.id);
  }
}

// Save the updated database
fs.writeFileSync(databasePath, JSON.stringify(database, null, 2));

console.log('Successfully added Jane Smith as a pending user to The Portland Company');