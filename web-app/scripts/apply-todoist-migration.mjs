#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load environment variables
config({ path: join(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables. Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  console.log('Applying Todoist integration migration...\n');

  try {
    // Read the migration file
    const migrationPath = join(process.cwd(), 'supabase', 'migrations', '20250902_todoist_integration.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    // Split the migration into individual statements
    // Remove comments and split by semicolons
    const statements = migrationSQL
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`Found ${statements.length} SQL statements to execute\n`);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      
      // Skip if it's just whitespace
      if (statement.trim().length <= 1) continue;
      
      // Get first few words for logging
      const preview = statement.substring(0, 50).replace(/\n/g, ' ');
      process.stdout.write(`[${i + 1}/${statements.length}] Executing: ${preview}...`);

      const { error } = await supabase.rpc('exec_sql', { 
        sql_query: statement 
      }).single();

      if (error) {
        // Try direct execution if RPC fails
        const { error: directError } = await supabase.from('_exec').select(statement);
        
        if (directError) {
          console.log(' ❌');
          errorCount++;
          errors.push({
            statement: preview,
            error: directError.message
          });
        } else {
          console.log(' ✅');
          successCount++;
        }
      } else {
        console.log(' ✅');
        successCount++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`Migration completed!`);
    console.log(`✅ Successful statements: ${successCount}`);
    console.log(`❌ Failed statements: ${errorCount}`);
    
    if (errors.length > 0) {
      console.log('\nErrors encountered:');
      errors.forEach(({ statement, error }) => {
        console.log(`  - ${statement}: ${error}`);
      });
    }

    console.log('\nNote: Some errors are expected for "IF NOT EXISTS" statements on existing objects.');
    console.log('The migration is designed to be idempotent.\n');

  } catch (error) {
    console.error('Error applying migration:', error);
    process.exit(1);
  }
}

// Run the migration
applyMigration();