# RLS Policy Checklist

## Before Writing Any RLS Policy

### 1. Self-Reference Check
- [ ] Policy does NOT query the same table it's attached to
- [ ] No `FROM table_name` or `JOIN table_name` within a policy `ON table_name`

### 2. Use Safe Helper Functions
Instead of direct joins to `user_organizations`, use these SECURITY DEFINER functions:

```sql
-- Check if current user belongs to an organization
user_belongs_to_org(org_id UUID) → BOOLEAN

-- Check if current user has organization access (includes super_admin check)
user_has_organization_access(org_id UUID) → BOOLEAN

-- Check if current user is super admin
is_super_admin() → BOOLEAN
```

### 3. Common Anti-Patterns to Avoid

❌ **BAD - Self-referential policy:**
```sql
CREATE POLICY "check org membership" ON user_organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_organizations  -- RECURSION!
      WHERE user_id = auth.uid()
    )
  );
```

✅ **GOOD - Use profiles table or SECURITY DEFINER function:**
```sql
CREATE POLICY "check org membership" ON user_organizations
  FOR SELECT USING (
    user_id = auth.uid()
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
  );
```

❌ **BAD - Direct join to user_organizations in another table's policy:**
```sql
CREATE POLICY "view projects" ON projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_organizations uo  -- Can cause recursion
      WHERE uo.user_id = auth.uid()
      AND uo.organization_id = projects.organization_id
    )
  );
```

✅ **GOOD - Use SECURITY DEFINER function:**
```sql
CREATE POLICY "view projects" ON projects
  FOR SELECT USING (
    user_belongs_to_org(organization_id)
  );
```

### 4. Testing Requirements

After creating or modifying RLS policies:

1. **Test with service role key** (should always work):
   ```javascript
   const supabase = createClient(url, SERVICE_ROLE_KEY);
   const { data, error } = await supabase.from('table').select('*');
   ```

2. **Test with anon key** (should fail gracefully, not 500 error):
   ```javascript
   const supabase = createClient(url, ANON_KEY);
   const { data, error } = await supabase.from('table').select('*');
   // Should return empty array, NOT "infinite recursion" error
   ```

3. **Test with authenticated user**:
   ```javascript
   await supabase.auth.signInWithPassword({ email, password });
   const { data, error } = await supabase.from('table').select('*');
   // Should return user's permitted data
   ```

### 5. Pre-commit Hook

A pre-commit hook is installed at `.git/hooks/pre-commit` that checks for potential RLS recursion patterns. The source is versioned at `scripts/hooks/pre-commit-rls-check.sh`.

To reinstall after cloning:
```bash
cp scripts/hooks/pre-commit-rls-check.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```
